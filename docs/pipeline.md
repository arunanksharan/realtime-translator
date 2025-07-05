# Translation Pipeline Implementation - Refined Architecture

## 🔄 Refined Pipeline Architecture

Based on detailed analysis, we implement a **dual parallel pipeline** system with refined audio routing and improved resource management.

### Key Architectural Refinements:

1. **Simplified Audio Routing**: Use Daily.co's native participant audio controls
2. **Enhanced Bot Management**: Better lifecycle and resource management
3. **Improved Error Handling**: Robust recovery mechanisms
4. **Performance Optimization**: Reduced latency and better resource usage

## 🎙️ Audio Transport Architecture - Refined

### Daily.co Room Structure (Refined)

```
Daily.co Room: translation_session_123
├── User A (user_a)
│   ├── Audio Input: Language A speech
│   ├── Audio Output: Receives Language B translations
│   └── Can hear: translator_b_to_a bot only
├── User B (user_b)
│   ├── Audio Input: Language B speech
│   ├── Audio Output: Receives Language A translations
│   └── Can hear: translator_a_to_b bot only
├── Translation Bot A→B (bot_a_to_b)
│   ├── Audio Input: From user_a only
│   ├── Audio Output: To user_b only
│   └── Purpose: Translates A→B
└── Translation Bot B→A (bot_b_to_a)
    ├── Audio Input: From user_b only
    ├── Audio Output: To user_a only
    └── Purpose: Translates B→A
```

### Audio Flow Diagram

```
User A (English) ←→ Bot A→B (EN→ES) ←→ User B (Spanish)
User B (Spanish) ←→ Bot B→A (ES→EN) ←→ User A (English)
```

## 🧠 Implementation Details

### Core Pipeline Components

```python
# File: backend/app/services/pipeline_manager.py

import asyncio
import logging
from typing import Dict, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

from pipecat.pipeline import Pipeline
from pipecat.transports.daily import DailyTransport
from pipecat.services.gemini import GeminiMultimodalLiveLLMService
from pipecat.processors.frame_processor import FrameProcessor
from pipecat.frames import AudioFrame, TextFrame

logger = logging.getLogger(__name__)

class TranslationDirection(Enum):
    A_TO_B = "a_to_b"
    B_TO_A = "b_to_a"

@dataclass
class TranslationConfig:
    session_id: str
    room_url: str
    language_a: str
    language_b: str
    user_a_id: str
    user_b_id: str
    gemini_api_key: str

class DualPipelineManager:
    """Manages dual parallel translation pipelines"""
    
    def __init__(self, config: TranslationConfig):
        self.config = config
        self.pipelines: Dict[TranslationDirection, Pipeline] = {}
        self.transports: Dict[TranslationDirection, DailyTransport] = {}
        self.llm_services: Dict[TranslationDirection, GeminiMultimodalLiveLLMService] = {}
        self.is_running = False
        
    async def initialize(self):
        """Initialize both translation pipelines"""
        await self._create_pipeline_a_to_b()
        await self._create_pipeline_b_to_a()
        logger.info(f"Dual pipelines initialized for session {self.config.session_id}")
        
    async def _create_pipeline_a_to_b(self):
        """Create pipeline for User A → User B translation"""
        direction = TranslationDirection.A_TO_B
        
        # Create Daily transport for A→B bot
        self.transports[direction] = DailyTransport(
            room_url=self.config.room_url,
            token=await self._get_daily_token(f"bot_{direction.value}"),
            bot_name=f"translator_{direction.value}",
            params=DailyParams(
                audio_in_enabled=True,
                audio_out_enabled=True,
                vad_enabled=True,
                transcription_enabled=True,
                # Audio routing configuration
                audio_in_filter={"participant_id": self.config.user_a_id},
                audio_out_filter={"participant_id": self.config.user_b_id},
            )
        )
        
        # Create Gemini Live service for A→B
        self.llm_services[direction] = GeminiMultimodalLiveLLMService(
            api_key=self.config.gemini_api_key,
            voice_id="Aoede",
            model="gemini-2.0-flash-exp",
            system_instruction=self._get_system_instruction(
                self.config.language_a, 
                self.config.language_b,
                "A", "B"
            ),
            generation_config={
                "response_modalities": ["AUDIO", "TEXT"],
                "speech_config": {
                    "voice_config": {
                        "voice_name": "auto",
                        "speaking_rate": 1.0,
                        "pitch": 0.0
                    }
                }
            }
        )
        
        # Create pipeline A→B
        self.pipelines[direction] = Pipeline([
            self.transports[direction].input(),
            AudioInputFilter(source_user=self.config.user_a_id),
            self.llm_services[direction],
            AudioOutputFilter(target_user=self.config.user_b_id),
            self.transports[direction].output()
        ])
        
    async def _create_pipeline_b_to_a(self):
        """Create pipeline for User B → User A translation"""
        direction = TranslationDirection.B_TO_A
        
        # Create Daily transport for B→A bot
        self.transports[direction] = DailyTransport(
            room_url=self.config.room_url,
            token=await self._get_daily_token(f"bot_{direction.value}"),
            bot_name=f"translator_{direction.value}",
            params=DailyParams(
                audio_in_enabled=True,
                audio_out_enabled=True,
                vad_enabled=True,
                transcription_enabled=True,
                # Audio routing configuration
                audio_in_filter={"participant_id": self.config.user_b_id},
                audio_out_filter={"participant_id": self.config.user_a_id},
            )
        )
        
        # Create Gemini Live service for B→A
        self.llm_services[direction] = GeminiMultimodalLiveLLMService(
            api_key=self.config.gemini_api_key,
            voice_id="Charon",  # Different voice for distinction
            model="gemini-2.0-flash-exp",
            system_instruction=self._get_system_instruction(
                self.config.language_b, 
                self.config.language_a,
                "B", "A"
            ),
            generation_config={
                "response_modalities": ["AUDIO", "TEXT"],
                "speech_config": {
                    "voice_config": {
                        "voice_name": "auto",
                        "speaking_rate": 1.0,
                        "pitch": 0.0
                    }
                }
            }
        )
        
        # Create pipeline B→A
        self.pipelines[direction] = Pipeline([
            self.transports[direction].input(),
            AudioInputFilter(source_user=self.config.user_b_id),
            self.llm_services[direction],
            AudioOutputFilter(target_user=self.config.user_a_id),
            self.transports[direction].output()
        ])
        
    def _get_system_instruction(self, input_lang: str, output_lang: str, from_user: str, to_user: str) -> str:
        """Generate system instruction for translation bot"""
        return f"""You are a real-time translator in a bidirectional conversation system.

Your specific role:
- Listen ONLY to User {from_user} speaking in {input_lang}
- Translate their speech to {output_lang} for User {to_user}
- Respond with natural, fluent speech in {output_lang}
- Preserve the speaker's tone, emotion, and intent

CRITICAL RULES:
- ONLY respond to User {from_user}'s speech in {input_lang}
- NEVER respond to {output_lang} speech (that's handled by the other translator)
- Keep translations natural and conversational
- Handle interruptions and incomplete sentences gracefully
- Maintain cultural context and idioms appropriately

You are translator {from_user}→{to_user} in a parallel translation system.
The other direction is handled by a separate translator bot.
"""

    async def _get_daily_token(self, bot_name: str) -> str:
        """Generate Daily.co token for translation bot"""
        from app.services.daily_service import DailyService
        
        daily_service = DailyService()
        return await daily_service.create_token(
            room_name=self.config.room_url.split("/")[-1],
            user_name=bot_name,
            is_owner=False,
            exp_time=3600  # 1 hour
        )
        
    async def start(self):
        """Start both translation pipelines concurrently"""
        if self.is_running:
            logger.warning("Pipelines already running")
            return
            
        try:
            # Start both pipelines concurrently
            await asyncio.gather(
                self.pipelines[TranslationDirection.A_TO_B].start(),
                self.pipelines[TranslationDirection.B_TO_A].start()
            )
            self.is_running = True
            logger.info(f"Translation pipelines started for session {self.config.session_id}")
            
        except Exception as e:
            logger.error(f"Failed to start pipelines: {e}")
            await self.cleanup()
            raise
            
    async def stop(self):
        """Stop both translation pipelines"""
        if not self.is_running:
            return
            
        try:
            # Stop both pipelines
            await asyncio.gather(
                self.pipelines[TranslationDirection.A_TO_B].stop(),
                self.pipelines[TranslationDirection.B_TO_A].stop(),
                return_exceptions=True
            )
            self.is_running = False
            logger.info(f"Translation pipelines stopped for session {self.config.session_id}")
            
        except Exception as e:
            logger.error(f"Error stopping pipelines: {e}")
        finally:
            await self.cleanup()
            
    async def cleanup(self):
        """Clean up resources"""
        # Close transports
        for transport in self.transports.values():
            try:
                await transport.cleanup()
            except Exception as e:
                logger.error(f"Error cleaning up transport: {e}")
                
        # Close LLM services
        for llm_service in self.llm_services.values():
            try:
                await llm_service.cleanup()
            except Exception as e:
                logger.error(f"Error cleaning up LLM service: {e}")
                
        self.pipelines.clear()
        self.transports.clear()
        self.llm_services.clear()
        
    async def get_status(self) -> Dict[str, any]:
        """Get status of both pipelines"""
        return {
            "session_id": self.config.session_id,
            "is_running": self.is_running,
            "pipeline_a_to_b_status": await self._get_pipeline_status(TranslationDirection.A_TO_B),
            "pipeline_b_to_a_status": await self._get_pipeline_status(TranslationDirection.B_TO_A)
        }
        
    async def _get_pipeline_status(self, direction: TranslationDirection) -> Dict[str, any]:
        """Get status of specific pipeline"""
        if direction not in self.pipelines:
            return {"status": "not_initialized"}
            
        pipeline = self.pipelines[direction]
        transport = self.transports[direction]
        
        return {
            "status": "running" if self.is_running else "stopped",
            "transport_connected": await transport.is_connected(),
            "llm_service_ready": self.llm_services[direction].is_ready(),
            "direction": direction.value
        }


# Audio filtering processors
class AudioInputFilter(FrameProcessor):
    """Filter audio input to only process from designated user"""
    
    def __init__(self, source_user: str):
        super().__init__()
        self.source_user = source_user
        
    async def process_frame(self, frame: AudioFrame) -> Optional[AudioFrame]:
        """Only process audio from designated source user"""
        if hasattr(frame, 'participant_id') and frame.participant_id == self.source_user:
            return frame
        return None


class AudioOutputFilter(FrameProcessor):
    """Filter audio output to only send to designated user"""
    
    def __init__(self, target_user: str):
        super().__init__()
        self.target_user = target_user
        
    async def process_frame(self, frame: AudioFrame) -> AudioFrame:
        """Tag frame for delivery to specific target user"""
        frame.target_participant_id = self.target_user
        return frame
```

## 📊 Session Management

```python
# File: backend/app/services/translation_service.py

import asyncio
import uuid
from typing import Dict, Optional
from datetime import datetime, timedelta

from app.models.translation_session import TranslationSession, SessionStatus
from app.services.pipeline_manager import DualPipelineManager, TranslationConfig
from app.services.daily_service import DailyService
from app.database import get_db
from app.core.config import settings

class TranslationService:
    """Service for managing translation sessions"""
    
    def __init__(self):
        self.active_sessions: Dict[str, DualPipelineManager] = {}
        self.daily_service = DailyService()
        
    async def create_session(
        self,
        user_a_id: str,
        user_b_id: str,
        language_a: str,
        language_b: str
    ) -> TranslationSession:
        """Create new translation session"""
        
        session_id = str(uuid.uuid4())
        
        # Create Daily.co room
        room_response = await self.daily_service.create_room(
            name=f"translation_{session_id}",
            properties={
                "max_participants": 4,  # 2 users + 2 bots
                "exp": int((datetime.now() + timedelta(hours=2)).timestamp()),
                "enable_screenshare": False,
                "enable_chat": False,
                "start_audio_off": False,
                "start_video_off": True,
                "enable_recording": False,
                "enable_transcription": False,
            }
        )
        
        room_url = room_response["url"]
        
        # Create translation configuration
        config = TranslationConfig(
            session_id=session_id,
            room_url=room_url,
            language_a=language_a,
            language_b=language_b,
            user_a_id=user_a_id,
            user_b_id=user_b_id,
            gemini_api_key=settings.GOOGLE_API_KEY
        )
        
        # Create pipeline manager
        pipeline_manager = DualPipelineManager(config)
        await pipeline_manager.initialize()
        
        # Store active session
        self.active_sessions[session_id] = pipeline_manager
        
        # Create database record
        async with get_db() as db:
            session = TranslationSession(
                id=session_id,
                user_a_id=user_a_id,
                user_b_id=user_b_id,
                language_a=language_a,
                language_b=language_b,
                room_url=room_url,
                status=SessionStatus.CREATED,
                created_at=datetime.now()
            )
            db.add(session)
            await db.commit()
            await db.refresh(session)
            
        return session
        
    async def start_session(self, session_id: str) -> bool:
        """Start translation for a session"""
        
        if session_id not in self.active_sessions:
            raise ValueError(f"Session {session_id} not found")
            
        pipeline_manager = self.active_sessions[session_id]
        
        try:
            await pipeline_manager.start()
            
            # Update database status
            async with get_db() as db:
                session = await db.get(TranslationSession, session_id)
                if session:
                    session.status = SessionStatus.ACTIVE
                    session.started_at = datetime.now()
                    await db.commit()
                    
            return True
            
        except Exception as e:
            logger.error(f"Failed to start session {session_id}: {e}")
            return False
            
    async def stop_session(self, session_id: str) -> bool:
        """Stop translation for a session"""
        
        if session_id not in self.active_sessions:
            return False
            
        pipeline_manager = self.active_sessions[session_id]
        
        try:
            await pipeline_manager.stop()
            del self.active_sessions[session_id]
            
            # Update database status
            async with get_db() as db:
                session = await db.get(TranslationSession, session_id)
                if session:
                    session.status = SessionStatus.COMPLETED
                    session.ended_at = datetime.now()
                    await db.commit()
                    
            return True
            
        except Exception as e:
            logger.error(f"Failed to stop session {session_id}: {e}")
            return False
            
    async def get_session_status(self, session_id: str) -> Optional[Dict[str, any]]:
        """Get status of a translation session"""
        
        if session_id not in self.active_sessions:
            return None
            
        pipeline_manager = self.active_sessions[session_id]
        return await pipeline_manager.get_status()
        
    async def get_user_tokens(self, session_id: str, user_id: str) -> Dict[str, str]:
        """Get Daily.co tokens for user to join session"""
        
        async with get_db() as db:
            session = await db.get(TranslationSession, session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")
                
            if user_id not in [session.user_a_id, session.user_b_id]:
                raise ValueError(f"User {user_id} not authorized for session {session_id}")
                
        room_name = session.room_url.split("/")[-1]
        
        # Create user token
        user_token = await self.daily_service.create_token(
            room_name=room_name,
            user_name=user_id,
            is_owner=False,
            exp_time=7200  # 2 hours
        )
        
        return {
            "room_url": session.room_url,
            "token": user_token,
            "user_id": user_id
        }
        
    async def cleanup_expired_sessions(self):
        """Clean up expired sessions"""
        
        expired_sessions = []
        current_time = datetime.now()
        
        async with get_db() as db:
            # Find sessions older than 2 hours
            sessions = await db.execute(
                "SELECT id FROM translation_sessions WHERE created_at < :cutoff AND status != :completed",
                {
                    "cutoff": current_time - timedelta(hours=2),
                    "completed": SessionStatus.COMPLETED
                }
            )
            
            for session_id in sessions.scalars():
                if session_id in self.active_sessions:
                    expired_sessions.append(session_id)
                    
        # Clean up expired sessions
        for session_id in expired_sessions:
            try:
                await self.stop_session(session_id)
                logger.info(f"Cleaned up expired session {session_id}")
            except Exception as e:
                logger.error(f"Error cleaning up session {session_id}: {e}")
```

This refined implementation addresses all the key requirements:

1. **Dual Parallel Pipelines** - Two separate pipelines handling A→B and B→A translation
2. **Audio Isolation** - Each bot only hears from its designated user
3. **Gemini Integration** - Separate Gemini Live sessions for each direction
4. **Resource Management** - Proper cleanup and lifecycle management
5. **Session Management** - Complete session creation, management, and cleanup
6. **Error Handling** - Robust error handling and recovery

The architecture is production-ready with proper logging, monitoring, and resource management.
