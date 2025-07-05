"""
Translation pipeline manager implementing dual parallel pipelines
"""
import asyncio
import logging
from typing import Dict, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
from datetime import datetime

from pipecat.pipeline.pipeline import Pipeline
from pipecat.transports.services.daily import DailyTransport
from pipecat.services.gemini_multimodal_live import GeminiMultimodalLiveLLMService
from pipecat.processors.frame_processor import FrameProcessor
from pipecat.frames.frames import AudioRawFrame
from pipecat.audio.vad.vad_analyzer import VADAnalyzer

from app.core.config import settings

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
    gemini_multimodal_live_api_key: str

class AudioInputFilter(FrameProcessor):
    """Filter audio input to only process from designated user"""
    
    def __init__(self, source_user: str):
        super().__init__()
        self.source_user = source_user
        self.frame_count = 0
        
    async def process_frame(self, frame: AudioRawFrame) -> Optional[AudioRawFrame]:
        """Only process audio from designated source user"""
        self.frame_count += 1
        
        # In a real implementation, Daily.co handles participant filtering
        # This is a conceptual filter - actual filtering happens at transport level
        if hasattr(frame, 'participant_id') and frame.participant_id == self.source_user:
            logger.debug(f"Processing audio frame {self.frame_count} from {self.source_user}")
            return frame
        
        # For now, pass through all frames as Daily.co handles the filtering
        return frame

class AudioOutputFilter(FrameProcessor):
    """Filter audio output to send to designated user"""
    
    def __init__(self, target_user: str):
        super().__init__()
        self.target_user = target_user
        
    async def process_frame(self, frame: AudioRawFrame) -> AudioRawFrame:
        """Tag frame for delivery to specific target user"""
        # Tag the frame with target participant
        frame.target_participant_id = self.target_user
        logger.debug(f"Sending translated audio to {self.target_user}")
        return frame

class TranslationProcessor(FrameProcessor):
    """Enhanced translation processor with monitoring"""
    
    def __init__(self, llm_service: GeminiMultimodalLiveLLMService, direction: str):
        super().__init__()
        self.llm_service = llm_service
        self.direction = direction
        self.translation_count = 0
        self.last_translation_time = None
        
    async def process_frame(self, frame: AudioRawFrame) -> Optional[AudioRawFrame]:
        """Process audio frame through LLM with monitoring"""
        start_time = datetime.now()
        
        try:
            # Process through Gemini
            result = await self.llm_service.process_frame(frame)
            
            if result:
                self.translation_count += 1
                processing_time = (datetime.now() - start_time).total_seconds() * 1000
                self.last_translation_time = processing_time
                
                logger.info(f"Translation {self.direction} #{self.translation_count} completed in {processing_time:.2f}ms")
                
            return result
            
        except Exception as e:
            logger.error(f"Translation error in {self.direction}: {e}")
            return None

class DualPipelineManager:
    """Manages dual parallel translation pipelines"""
    
    def __init__(self, config: TranslationConfig):
        self.config = config
        self.pipelines: Dict[TranslationDirection, Pipeline] = {}
        self.transports: Dict[TranslationDirection, DailyTransport] = {}
        self.llm_services: Dict[TranslationDirection, GeminiMultimodalLiveLLMService] = {}
        self.processors: Dict[TranslationDirection, TranslationProcessor] = {}
        self.is_running = False
        self.start_time = None
        
    async def initialize(self):
        """Initialize both translation pipelines"""
        try:
            await self._create_pipeline_a_to_b()
            await self._create_pipeline_b_to_a()
            logger.info(f"Dual pipelines initialized for session {self.config.session_id}")
        except Exception as e:
            logger.error(f"Failed to initialize pipelines: {e}")
            await self.cleanup()
            raise
            
    async def _create_pipeline_a_to_b(self):
        """Create pipeline for User A → User B translation"""
        direction = TranslationDirection.A_TO_B
        
        try:
            # Create Daily transport for A→B bot
            self.transports[direction] = DailyTransport(
                room_url=self.config.room_url,
                token=await self._get_daily_token(f"bot_{direction.value}"),
                bot_name=f"translator_{direction.value}",
                audio_in_enabled=True,
                audio_out_enabled=True,
                audio_in_sample_rate=settings.audio_sample_rate,
                audio_out_sample_rate=settings.audio_sample_rate,
                # Audio filtering happens at Daily.co level
                audio_in_filter={"user_id": self.config.user_a_id},
                audio_out_filter={"user_id": self.config.user_b_id},
            )
            
            # Create Gemini Live service for A→B
            self.llm_services[direction] = GeminiMultimodalLiveLLMService(
                api_key=self.config.gemini_multimodal_live_api_key,
                voice_id="auto",  # Auto-select appropriate voice
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
                            "pitch": 0.0,
                            "volume_gain_db": 0.0
                        }
                    }
                }
            )
            
            # Create translation processor
            self.processors[direction] = TranslationProcessor(
                self.llm_services[direction], 
                f"{self.config.language_a}→{self.config.language_b}"
            )
            
            # Create pipeline A→B
            self.pipelines[direction] = Pipeline([
                self.transports[direction].input(),
                AudioInputFilter(source_user=self.config.user_a_id),
                VADAnalyzer(),  # Voice activity detection
                self.processors[direction],
                AudioOutputFilter(target_user=self.config.user_b_id),
                self.transports[direction].output()
            ])
            
            logger.info(f"Created pipeline {direction.value}")
            
        except Exception as e:
            logger.error(f"Failed to create pipeline {direction.value}: {e}")
            raise
        
    async def _create_pipeline_b_to_a(self):
        """Create pipeline for User B → User A translation"""
        direction = TranslationDirection.B_TO_A
        
        try:
            # Create Daily transport for B→A bot
            self.transports[direction] = DailyTransport(
                room_url=self.config.room_url,
                token=await self._get_daily_token(f"bot_{direction.value}"),
                bot_name=f"translator_{direction.value}",
                audio_in_enabled=True,
                audio_out_enabled=True,
                audio_in_sample_rate=settings.audio_sample_rate,
                audio_out_sample_rate=settings.audio_sample_rate,
                # Audio filtering happens at Daily.co level
                audio_in_filter={"user_id": self.config.user_b_id},
                audio_out_filter={"user_id": self.config.user_a_id},
            )
            
            # Create Gemini Live service for B→A
            self.llm_services[direction] = GeminiMultimodalLiveLLMService(
                api_key=self.config.gemini_multimodal_live_api_key,
                voice_id="auto",  # Different voice for distinction
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
                            "pitch": 0.0,
                            "volume_gain_db": 0.0
                        }
                    }
                }
            )
            
            # Create translation processor
            self.processors[direction] = TranslationProcessor(
                self.llm_services[direction], 
                f"{self.config.language_b}→{self.config.language_a}"
            )
            
            # Create pipeline B→A
            self.pipelines[direction] = Pipeline([
                self.transports[direction].input(),
                AudioInputFilter(source_user=self.config.user_b_id),
                VADAnalyzer(),  # Voice activity detection
                self.processors[direction],
                AudioOutputFilter(target_user=self.config.user_a_id),
                self.transports[direction].output()
            ])
            
            logger.info(f"Created pipeline {direction.value}")
            
        except Exception as e:
            logger.error(f"Failed to create pipeline {direction.value}: {e}")
            raise
        
    def _get_system_instruction(self, input_lang: str, output_lang: str, from_user: str, to_user: str) -> str:
        """Generate system instruction for translation bot"""
        return f"""You are a professional real-time translator in a bidirectional conversation system.

Your specific role:
- Listen ONLY to User {from_user} speaking in {input_lang}
- Translate their speech accurately to {output_lang} for User {to_user}
- Respond with natural, fluent speech in {output_lang}
- Preserve the speaker's tone, emotion, and intent
- Handle cultural context and idiomatic expressions appropriately

CRITICAL OPERATIONAL RULES:
- ONLY respond to User {from_user}'s speech in {input_lang}
- NEVER respond to {output_lang} speech (handled by the parallel translator)
- Keep translations natural and conversational
- Handle interruptions and incomplete sentences gracefully
- Maintain appropriate formality level
- Preserve emotional nuance and speaking style

QUALITY STANDARDS:
- Accuracy: Translate meaning, not just words
- Fluency: Sound natural in {output_lang}
- Latency: Respond quickly for real-time flow
- Completeness: Don't drop important information
- Context: Consider conversation history

You are translator {from_user}→{to_user} in a parallel translation system.
The reverse direction is handled by a separate translator bot.
Work together to enable seamless bidirectional communication.
"""

    async def _get_daily_token(self, bot_name: str) -> str:
        """Generate Daily.co token for translation bot"""
        from app.services.daily_service import DailyService
        
        daily_service = DailyService()
        room_name = self.config.room_url.split("/")[-1]
        
        return await daily_service.create_token(
            room_name=room_name,
            user_name=bot_name,
            is_owner=False,
            exp_time=7200,  # 2 hours
            properties={
                "enable_recording": False,
                "enable_transcription": False,
                "enable_chat": False
            }
        )
        
    async def start(self):
        """Start both translation pipelines concurrently"""
        if self.is_running:
            logger.warning("Pipelines already running")
            return
            
        try:
            self.start_time = datetime.now()
            
            # Start both pipelines concurrently
            await asyncio.gather(
                self.pipelines[TranslationDirection.A_TO_B].arun(),
                self.pipelines[TranslationDirection.B_TO_A].arun()
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
            stop_tasks = []
            for direction in [TranslationDirection.A_TO_B, TranslationDirection.B_TO_A]:
                if direction in self.pipelines:
                    stop_tasks.append(self.pipelines[direction].stop())
                    
            if stop_tasks:
                await asyncio.gather(*stop_tasks, return_exceptions=True)
            
            self.is_running = False
            logger.info(f"Translation pipelines stopped for session {self.config.session_id}")
            
        except Exception as e:
            logger.error(f"Error stopping pipelines: {e}")
        finally:
            await self.cleanup()
            
    async def cleanup(self):
        """Clean up resources"""
        # Close transports
        for direction, transport in self.transports.items():
            try:
                await transport.cleanup()
                logger.debug(f"Cleaned up transport for {direction.value}")
            except Exception as e:
                logger.error(f"Error cleaning up transport {direction.value}: {e}")
                
        # Close LLM services
        for direction, llm_service in self.llm_services.items():
            try:
                await llm_service.cleanup()
                logger.debug(f"Cleaned up LLM service for {direction.value}")
            except Exception as e:
                logger.error(f"Error cleaning up LLM service {direction.value}: {e}")
                
        # Clear collections
        self.pipelines.clear()
        self.transports.clear()
        self.llm_services.clear()
        self.processors.clear()
        
        logger.info(f"Cleanup completed for session {self.config.session_id}")
        
    async def get_status(self) -> Dict[str, any]:
        """Get status of both pipelines"""
        uptime = None
        if self.start_time:
            uptime = (datetime.now() - self.start_time).total_seconds()
            
        return {
            "session_id": self.config.session_id,
            "is_running": self.is_running,
            "uptime_seconds": uptime,
            "pipeline_a_to_b_status": await self._get_pipeline_status(TranslationDirection.A_TO_B),
            "pipeline_b_to_a_status": await self._get_pipeline_status(TranslationDirection.B_TO_A),
            "total_translations": self._get_total_translations()
        }
        
    async def _get_pipeline_status(self, direction: TranslationDirection) -> Dict[str, any]:
        """Get status of specific pipeline"""
        if direction not in self.pipelines:
            return {"status": "not_initialized"}
            
        transport = self.transports.get(direction)
        processor = self.processors.get(direction)
        
        status = {
            "status": "running" if self.is_running else "stopped",
            "direction": direction.value,
            "transport_connected": False,
            "llm_service_ready": False,
            "translation_count": 0,
            "last_translation_time_ms": None
        }
        
        # Check transport status
        if transport:
            try:
                status["transport_connected"] = await transport.is_connected()
            except Exception as e:
                logger.error(f"Error checking transport status: {e}")
                
        # Check LLM service status
        if direction in self.llm_services:
            try:
                status["llm_service_ready"] = self.llm_services[direction].is_ready()
            except Exception as e:
                logger.error(f"Error checking LLM service status: {e}")
                
        # Get processor stats
        if processor:
            status["translation_count"] = processor.translation_count
            status["last_translation_time_ms"] = processor.last_translation_time
            
        return status
        
    def _get_total_translations(self) -> int:
        """Get total number of translations across both pipelines"""
        total = 0
        for processor in self.processors.values():
            total += processor.translation_count
        return total
        
    async def get_metrics(self) -> Dict[str, any]:
        """Get detailed metrics for monitoring"""
        metrics = {
            "session_id": self.config.session_id,
            "is_running": self.is_running,
            "total_translations": self._get_total_translations(),
            "pipelines": {}
        }
        
        for direction in [TranslationDirection.A_TO_B, TranslationDirection.B_TO_A]:
            if direction in self.processors:
                processor = self.processors[direction]
                metrics["pipelines"][direction.value] = {
                    "translation_count": processor.translation_count,
                    "last_translation_time_ms": processor.last_translation_time,
                    "avg_translation_time_ms": processor.last_translation_time,  # Could be enhanced
                    "direction": f"{self.config.language_a}→{self.config.language_b}" if direction == TranslationDirection.A_TO_B else f"{self.config.language_b}→{self.config.language_a}"
                }
                
        return metrics
        
    async def health_check(self) -> Dict[str, bool]:
        """Perform health check on both pipelines"""
        health = {
            "overall_healthy": True,
            "pipeline_a_to_b_healthy": True,
            "pipeline_b_to_a_healthy": True,
            "transport_healthy": True,
            "llm_services_healthy": True
        }
        
        # Check each pipeline
        for direction in [TranslationDirection.A_TO_B, TranslationDirection.B_TO_A]:
            pipeline_healthy = True
            
            # Check transport
            if direction in self.transports:
                try:
                    transport_connected = await self.transports[direction].is_connected()
                    if not transport_connected:
                        pipeline_healthy = False
                        health["transport_healthy"] = False
                except Exception:
                    pipeline_healthy = False
                    health["transport_healthy"] = False
                    
            # Check LLM service
            if direction in self.llm_services:
                try:
                    llm_ready = self.llm_services[direction].is_ready()
                    if not llm_ready:
                        pipeline_healthy = False
                        health["llm_services_healthy"] = False
                except Exception:
                    pipeline_healthy = False
                    health["llm_services_healthy"] = False
                    
            # Update pipeline-specific health
            if direction == TranslationDirection.A_TO_B:
                health["pipeline_a_to_b_healthy"] = pipeline_healthy
            else:
                health["pipeline_b_to_a_healthy"] = pipeline_healthy
                
            # Update overall health
            if not pipeline_healthy:
                health["overall_healthy"] = False
                
        return health
