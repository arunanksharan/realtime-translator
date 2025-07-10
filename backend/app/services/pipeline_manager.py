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
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask, PipelineParams
from pipecat.transports.services.daily import DailyTransport, DailyParams
from pipecat.services.gemini_multimodal_live import GeminiMultimodalLiveLLMService
from pipecat.processors.frame_processor import FrameProcessor
from pipecat.frames.frames import AudioRawFrame, TextFrame, TranscriptionFrame, EndFrame, StartFrame
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.processors.aggregators.llm_response import BaseLLMResponseAggregator
from pipecat.processors.aggregators.sentence import SentenceAggregator

from app.core.config import settings
from app.services.websocket_service import websocket_manager
from app.services.transcription_processor import (
    TranscriptionTracker,
    ParticipantIdentifier,
    AudioMetricsCollector
)

logger = logging.getLogger(__name__)

class AudioPacketLogger(FrameProcessor):
    """Debug processor to log all audio packets at various stages"""
    
    def __init__(self, stage_name: str):
        super().__init__()
        self.stage_name = stage_name
        self._packet_count = 0
        self._started = False
        self._queued_frames = []
        
    async def process_frame(self, frame, direction=None):
        # Handle StartFrame
        if isinstance(frame, StartFrame):
            self._started = True
            logger.info(f"🔊 AudioPacketLogger [{self.stage_name}] initialized")
            await self.push_frame(frame, direction)
            
            # Process any queued frames
            for queued_frame, queued_direction in self._queued_frames:
                await self._process_frame_internal(queued_frame, queued_direction)
            self._queued_frames.clear()
            return
            
        # Queue frames if not started
        if not self._started:
            self._queued_frames.append((frame, direction))
            await self.push_frame(frame, direction)
            return
        
        # Normal processing
        await self._process_frame_internal(frame, direction)
        
    async def _process_frame_internal(self, frame, direction):
        # Always pass through
        await self.push_frame(frame, direction)
        
        # Log audio frames
        if isinstance(frame, AudioRawFrame):
            self._packet_count += 1
            
            # Log detailed info for first few packets and then periodically
            if self._packet_count <= 5 or self._packet_count % 50 == 0:
                # Gather frame info
                audio_size = 0
                if hasattr(frame, 'audio') and frame.audio is not None:
                    if hasattr(frame.audio, '__len__'):
                        audio_size = len(frame.audio)
                    elif hasattr(frame, 'num_frames'):
                        audio_size = frame.num_frames
                
                # Get participant info
                participant_info = "Unknown"
                if hasattr(frame, 'participant_id'):
                    participant_info = f"participant_id={frame.participant_id}"
                elif hasattr(frame, 'participant') and isinstance(frame.participant, dict):
                    participant_info = f"participant={frame.participant}"
                elif hasattr(frame, 'user'):
                    participant_info = f"user={frame.user}"
                elif hasattr(frame, 'user_id'):
                    participant_info = f"user_id={frame.user_id}"
                
                # Log the packet
                logger.info(f"🎵 [{self.stage_name}] Audio packet #{self._packet_count}: "
                          f"size={audio_size}, {participant_info}, "
                          f"sample_rate={getattr(frame, 'sample_rate', 'N/A')}, "
                          f"channels={getattr(frame, 'num_channels', 'N/A')}")
                
                # For first packet, log all attributes
                if self._packet_count == 1:
                    attrs = [attr for attr in dir(frame) if not attr.startswith('_')]
                    logger.info(f"🎵 [{self.stage_name}] Frame attributes: {attrs}")
        
        # Log other frame types
        elif isinstance(frame, (TextFrame, TranscriptionFrame)):
            logger.info(f"📝 [{self.stage_name}] {frame.__class__.__name__}: {getattr(frame, 'text', 'No text')[:50]}...")

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
        self._frame_count = 0
        self._started = False
        self._queued_frames = []
        
    async def process_frame(self, frame, direction=None):
        """Only process audio from designated source user"""
        # Handle StartFrame
        if isinstance(frame, StartFrame):
            self._started = True
            logger.info(f"🎹 AudioInputFilter initialized for user {self.source_user}")
            await self.push_frame(frame, direction)
            
            # Process any queued frames
            for queued_frame, queued_direction in self._queued_frames:
                await self._process_frame_internal(queued_frame, queued_direction)
            self._queued_frames.clear()
            return
            
        # Queue frames if not started
        if not self._started:
            self._queued_frames.append((frame, direction))
            await self.push_frame(frame, direction)
            return
        
        # Normal processing
        await self._process_frame_internal(frame, direction)
        
    async def _process_frame_internal(self, frame, direction):
        """Internal frame processing logic that correctly identifies the speaker."""
        if isinstance(frame, AudioRawFrame):
            # Check if this is a UserAudioRawFrame with user_id
            frame_user_id = getattr(frame, 'user_id', None)
            
            # Log for debugging
            self._frame_count += 1
            if self._frame_count <= 5 or self._frame_count % 100 == 0:
                logger.info(f"🎹 AudioInputFilter: Frame #{self._frame_count} from participant {frame_user_id}")
            
            # For now, pass through all audio frames
            # TODO: Implement proper participant ID mapping
            await self.push_frame(frame, direction)
            
            # Check if this frame is from one of the bots (to avoid feedback)
            # Bot participant IDs typically have a certain pattern or we can check against known bot IDs
            # For now, we'll rely on the fact that bots don't send audio to themselves
        else:
            # Pass non-audio frames (like StartFrame, EndFrame) through
            await self.push_frame(frame, direction)

class AudioOutputFilter(FrameProcessor):
    """Filter audio output to send to designated user"""
    
    def __init__(self, target_user: str):
        super().__init__()
        self.target_user = target_user
        self._frame_count = 0
        self._started = False
        self._queued_frames = []
        
    async def process_frame(self, frame, direction=None):
        """Tag frame for delivery to specific target user"""
        # Handle StartFrame
        if isinstance(frame, StartFrame):
            self._started = True
            logger.info(f"🎶 AudioOutputFilter initialized for user {self.target_user}")
            await self.push_frame(frame, direction)
            
            # Process any queued frames
            for queued_frame, queued_direction in self._queued_frames:
                await self._process_frame_internal(queued_frame, queued_direction)
            self._queued_frames.clear()
            return
            
        # Queue frames if not started
        if not self._started:
            self._queued_frames.append((frame, direction))
            await self.push_frame(frame, direction)
            return
        
        # Normal processing
        await self._process_frame_internal(frame, direction)
        
    async def _process_frame_internal(self, frame, direction):
        """Internal frame processing logic to route audio."""
        if isinstance(frame, AudioRawFrame):
            # Tag the frame with the ID of the user who should receive it.
            # The DailyTransport output will use this to send the audio to the correct participant.
            frame.send_to_participant = self.target_user
        
        # Push the frame to the transport
        await self.push_frame(frame, direction)

class TranslationProcessor(FrameProcessor):
    """Enhanced translation processor with monitoring and WebSocket integration"""
    
    def __init__(self, llm_service: GeminiMultimodalLiveLLMService, direction: str, session_id: str):
        super().__init__()
        self.llm_service = llm_service
        self.direction = direction
        self.session_id = session_id
        self.translation_count = 0
        self.last_translation_time = None
        self._started = False
        self._queued_frames = []
        
    async def process_frame(self, frame, direction=None):
        """Process audio frame through LLM with monitoring and real-time updates"""
        # Handle StartFrame
        if isinstance(frame, StartFrame):
            self._started = True
            logger.info(f"🌍 TranslationProcessor initialized for {self.direction}")
            await self.push_frame(frame, direction)
            
            # Process any queued frames
            for queued_frame, queued_direction in self._queued_frames:
                await self._process_frame_internal(queued_frame, queued_direction)
            self._queued_frames.clear()
            return
            
        # Queue frames if not started
        if not self._started:
            self._queued_frames.append((frame, direction))
            await self.push_frame(frame, direction)
            return
        
        # Normal processing
        await self._process_frame_internal(frame, direction)
        
    async def _process_frame_internal(self, frame, direction):
        """Internal frame processing logic."""
        # Only process AudioRawFrame, pass through others
        if not isinstance(frame, AudioRawFrame):
            await self.push_frame(frame, direction)
            return
            
        start_time = datetime.now()
        
        # Log detailed audio frame info
        logger.info(f"🌍\n" + "="*60)
        logger.info(f"🌍 TranslationProcessor {self.direction}: PROCESSING AUDIO FRAME")
        logger.info(f"🌍 Frame type: {type(frame).__name__}")
        
        # Check audio data
        audio_data = None
        audio_size = 0
        if hasattr(frame, 'audio'):
            audio_data = frame.audio
            if audio_data is not None:
                if hasattr(audio_data, '__len__'):
                    audio_size = len(audio_data)
                elif hasattr(audio_data, 'shape'):
                    audio_size = audio_data.shape[0] if len(audio_data.shape) > 0 else 0
                logger.info(f"🌍 Audio data type: {type(audio_data)}, size: {audio_size}")
            else:
                logger.warning(f"🌍 frame.audio is None!")
        else:
            logger.warning(f"🌍 Frame has no 'audio' attribute!")
            
        # Log frame attributes
        logger.info(f"🌍 Frame attributes: {[attr for attr in dir(frame) if not attr.startswith('_') and not callable(getattr(frame, attr))]}")
        
        # Log participant info
        if hasattr(frame, 'participant'):
            logger.info(f"🌍 Participant: {frame.participant}")
        if hasattr(frame, 'participant_id'):
            logger.info(f"🌍 Participant ID: {frame.participant_id}")
        if hasattr(frame, 'user_id'):
            logger.info(f"🌍 User ID: {frame.user_id}")
            
        # Log audio properties
        if hasattr(frame, 'sample_rate'):
            logger.info(f"🌍 Sample rate: {frame.sample_rate}")
        if hasattr(frame, 'num_channels'):
            logger.info(f"🌍 Channels: {frame.num_channels}")
        if hasattr(frame, 'duration'):
            logger.info(f"🌍 Duration: {frame.duration}")
            
        if audio_size == 0:
            logger.error(f"🌍 NO AUDIO DATA TO SEND TO GEMINI!")
            logger.info(f"🌍" + "="*60 + "\n")
            await self.push_frame(frame, direction)
            return
            
        logger.info(f"🌍 SENDING TO GEMINI NOW...")
        logger.info(f"🌍" + "="*60 + "\n")
        
        try:
            # Process through Gemini
            result = await self.llm_service.process_frame(frame)
            
            logger.info(f"🌍 GEMINI RESPONSE: {result}")
            logger.info(f"🌍 Response type: {type(result).__name__ if result else 'None'}")
            
            if result:
                self.translation_count += 1
                processing_time = (datetime.now() - start_time).total_seconds() * 1000
                self.last_translation_time = processing_time
                
                # Broadcast transcription update via WebSocket
                await self._broadcast_transcription(frame, result)
                
                logger.info(f"Translation {self.direction} #{self.translation_count} completed in {processing_time:.2f}ms")
                
                # Push the result frame
                await self.push_frame(result, direction)
            else:
                # No result, just pass through the original frame
                await self.push_frame(frame, direction)
            
        except Exception as e:
            logger.error(f"Translation error in {self.direction}: {e}")
            await self._broadcast_error(str(e))
            # Pass through the original frame on error
            await self.push_frame(frame, direction)
            
    async def _broadcast_transcription(self, input_frame: AudioRawFrame, output_frame: AudioRawFrame):
        """Broadcast transcription update via WebSocket"""
        try:
            from app.services.websocket_service import websocket_manager
            
            # Extract transcription data from frames
            # Check multiple possible attributes where text might be stored
            original_text = ""
            translated_text = ""
            
            # Try to extract original text from input frame
            if hasattr(input_frame, 'text'):
                original_text = input_frame.text
            elif hasattr(input_frame, 'transcription'):
                original_text = input_frame.transcription
            elif hasattr(input_frame, 'metadata') and isinstance(input_frame.metadata, dict):
                original_text = input_frame.metadata.get('text', '') or input_frame.metadata.get('transcription', '')
            
            # Try to extract translated text from output frame
            if hasattr(output_frame, 'text'):
                translated_text = output_frame.text
            elif hasattr(output_frame, 'transcription'):
                translated_text = output_frame.transcription
            elif hasattr(output_frame, 'metadata') and isinstance(output_frame.metadata, dict):
                translated_text = output_frame.metadata.get('text', '') or output_frame.metadata.get('transcription', '')
            
            # Extract languages from direction string
            lang_from = self.direction.split('→')[0] if '→' in self.direction else 'unknown'
            lang_to = self.direction.split('→')[1] if '→' in self.direction else 'unknown'
            
            # Only broadcast if we have meaningful text
            if translated_text and translated_text != 'Translation generated':
                await websocket_manager.broadcast_transcription(
                    session_id=self.session_id,
                    speaker_id=getattr(input_frame, 'participant_id', 'unknown'),
                    original_text=original_text or f"[{lang_from}] Audio received",
                    translated_text=translated_text,
                    language_from=lang_from,
                    language_to=lang_to,
                    confidence=getattr(output_frame, 'confidence', 0.85),
                    is_partial=getattr(output_frame, 'is_partial', False)
                )
                logger.info(f"Broadcasted transcription: {original_text[:50]}... -> {translated_text[:50]}...")
            else:
                logger.debug(f"No text found in frame attributes: {dir(output_frame)}")
                
        except Exception as e:
            logger.warning(f"Failed to broadcast transcription: {e}")
            
    async def _broadcast_error(self, error_message: str):
        """Broadcast error via WebSocket"""
        try:
            from app.services.websocket_service import websocket_manager
            await websocket_manager.broadcast_error(
                session_id=self.session_id,
                error_code="TRANSLATION_ERROR",
                error_message=error_message
            )
        except Exception as e:
            logger.warning(f"Failed to broadcast error: {e}")

class DualPipelineManager:
    """Manages dual parallel translation pipelines"""
    
    def __init__(self, config: TranslationConfig):
        self.config = config
        self.pipelines: Dict[TranslationDirection, Pipeline] = {}
        self.pipeline_tasks: Dict[TranslationDirection, PipelineTask] = {}
        self.pipeline_runners: Dict[TranslationDirection, PipelineRunner] = {}
        self.runner_tasks: Dict[TranslationDirection, asyncio.Task] = {}
        self.transports: Dict[TranslationDirection, DailyTransport] = {}
        self.llm_services: Dict[TranslationDirection, GeminiMultimodalLiveLLMService] = {}
        self.processors: Dict[TranslationDirection, TranslationProcessor] = {}
        self.is_running = False
        self.start_time = None
        # Map Daily.co participant IDs to our user IDs
        self.participant_mapping: Dict[str, str] = {}
        # Store bot participant IDs
        self.bot_participant_ids: Dict[TranslationDirection, str] = {}
        
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
        
        logger.info(f"Creating pipeline {direction.value}: {self.config.language_a} → {self.config.language_b}")
        
        try:
            # Create Daily transport for A→B bot
            daily_params = DailyParams(
                audio_in_enabled=True,
                audio_out_enabled=True,
                transcription_enabled=False,  # We handle transcription ourselves
                vad_enabled=True,
                vad_analyzer=SileroVADAnalyzer(),
                enable_metrics=False
            )
            
            logger.info(f"🌐 Creating Daily transport for {direction.value}...")
            self.transports[direction] = DailyTransport(
                room_url=self.config.room_url,
                token=await self._get_daily_token(f"bot_{direction.value}"),
                bot_name=f"translator_{direction.value}",
                params=daily_params
            )
            logger.info(f"✅ Daily transport created for {direction.value}")
            
            # Create Gemini Live service for A→B
            logger.info(f"🤖 Creating Gemini service for {direction.value}...")
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
                    },
                    "text_config": {
                        "enable_transcription": True,
                        "temperature": 0.7,
                        "max_output_tokens": 200
                    },
                    # Add language hints for better recognition
                    "audio_config": {
                        "input_language": self.config.language_a,
                        "output_language": self.config.language_b
                    }
                },
                # Enable streaming for real-time text updates
                enable_streaming=True,
                stream_text=True
            )
            logger.info(f"✅ Gemini service created for {direction.value}")
            
            # Create translation processor
            self.processors[direction] = TranslationProcessor(
                self.llm_services[direction], 
                f"{self.config.language_a}→{self.config.language_b}",
                self.config.session_id
            )
            
            # Create transcription tracker for A→B
            transcription_tracker = TranscriptionTracker(
                session_id=self.config.session_id,
                source_language=self.config.language_a,
                target_language=self.config.language_b,
                source_user_id=self.config.user_a_id,
                target_user_id=self.config.user_b_id,
                direction=f"{self.config.language_a}→{self.config.language_b}"
            )
            
            # Create metrics collector
            metrics_collector = AudioMetricsCollector(
                session_id=self.config.session_id,
                direction=direction.value
            )
            
            # Create pipeline A→B with enhanced processors
            self.pipelines[direction] = Pipeline([
                self.transports[direction].input(),
                AudioPacketLogger("A→B Input"),  # Log all incoming audio
                metrics_collector,  # Collect metrics
                AudioInputFilter(source_user=self.config.user_a_id),
                AudioPacketLogger("A→B After Filter"),  # Log after filter
                self.processors[direction],
                AudioPacketLogger("A→B After Translation"),  # Log after translation
                transcription_tracker,  # Track and broadcast transcriptions
                AudioOutputFilter(target_user=self.config.user_b_id),
                self.transports[direction].output()
            ])
            
            # Create pipeline task
            self.pipeline_tasks[direction] = PipelineTask(
                self.pipelines[direction],
                params=PipelineParams(
                    audio_in_sample_rate=16000,
                    audio_out_sample_rate=16000,
                    allow_interruptions=True,
                    enable_metrics=True,
                    enable_usage_metrics=True
                )
            )
            
            logger.info(f"Created pipeline {direction.value}")
            
        except Exception as e:
            logger.error(f"Failed to create pipeline {direction.value}: {e}")
            raise
        
    async def _create_pipeline_b_to_a(self):
        """Create pipeline for User B → User A translation"""
        direction = TranslationDirection.B_TO_A
        
        logger.info(f"Creating pipeline {direction.value}: {self.config.language_b} → {self.config.language_a}")
        
        try:
            # Create Daily transport for B→A bot
            daily_params = DailyParams(
                audio_in_enabled=True,
                audio_out_enabled=True,
                transcription_enabled=False,  # We handle transcription ourselves
                vad_enabled=True,
                vad_analyzer=SileroVADAnalyzer(),
                enable_metrics=False
            )
            
            logger.info(f"🌐 Creating Daily transport for {direction.value}...")
            self.transports[direction] = DailyTransport(
                room_url=self.config.room_url,
                token=await self._get_daily_token(f"bot_{direction.value}"),
                bot_name=f"translator_{direction.value}",
                params=daily_params
            )
            logger.info(f"✅ Daily transport created for {direction.value}")
            
            # Create Gemini Live service for B→A
            logger.info(f"🤖 Creating Gemini service for {direction.value}...")
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
                    },
                    "text_config": {
                        "enable_transcription": True,
                        "temperature": 0.7,
                        "max_output_tokens": 200
                    },
                    # Add language hints for better recognition
                    "audio_config": {
                        "input_language": self.config.language_b,
                        "output_language": self.config.language_a
                    }
                },
                # Enable streaming for real-time text updates
                enable_streaming=True,
                stream_text=True
            )
            logger.info(f"✅ Gemini service created for {direction.value}")
            
            # Create translation processor
            self.processors[direction] = TranslationProcessor(
                self.llm_services[direction], 
                f"{self.config.language_b}→{self.config.language_a}",
                self.config.session_id
            )
            
            # Create transcription tracker for B→A
            transcription_tracker = TranscriptionTracker(
                session_id=self.config.session_id,
                source_language=self.config.language_b,
                target_language=self.config.language_a,
                source_user_id=self.config.user_b_id,
                target_user_id=self.config.user_a_id,
                direction=f"{self.config.language_b}→{self.config.language_a}"
            )
            
            # Create metrics collector
            metrics_collector = AudioMetricsCollector(
                session_id=self.config.session_id,
                direction=direction.value
            )
            
            # Create pipeline B→A with enhanced processors
            self.pipelines[direction] = Pipeline([
                self.transports[direction].input(),
                AudioPacketLogger("B→A Input"),  # Log all incoming audio
                metrics_collector,  # Collect metrics
                AudioInputFilter(source_user=self.config.user_b_id),
                AudioPacketLogger("B→A After Filter"),  # Log after filter
                self.processors[direction],
                AudioPacketLogger("B→A After Translation"),  # Log after translation
                transcription_tracker,  # Track and broadcast transcriptions
                AudioOutputFilter(target_user=self.config.user_a_id),
                self.transports[direction].output()
            ])
            
            # Create pipeline task
            self.pipeline_tasks[direction] = PipelineTask(
                self.pipelines[direction],
                params=PipelineParams(
                    audio_in_sample_rate=16000,
                    audio_out_sample_rate=16000,
                    allow_interruptions=True,
                    enable_metrics=True,
                    enable_usage_metrics=True
                )
            )
            
            logger.info(f"Created pipeline {direction.value}")
            
        except Exception as e:
            logger.error(f"Failed to create pipeline {direction.value}: {e}")
            raise
        
    def _get_system_instruction(self, input_lang: str, output_lang: str, from_user: str, to_user: str) -> str:
        """Generate system instruction for translation bot"""
        
        # Map language codes to full names for better Gemini understanding
        language_names = {
            "en": "English",
            "es": "Spanish",
            "fr": "French",
            "de": "German",
            "it": "Italian",
            "pt": "Portuguese",
            "ja": "Japanese",
            "ko": "Korean",
            "zh": "Chinese (Mandarin)",
            "ar": "Arabic",
            "hi": "Hindi",
            "ru": "Russian",
            "nl": "Dutch",
            "sv": "Swedish",
            "no": "Norwegian",
            "da": "Danish",
            "fi": "Finnish",
            "pl": "Polish",
            "tr": "Turkish",
            "el": "Greek"
        }
        
        input_language_name = language_names.get(input_lang, input_lang)
        output_language_name = language_names.get(output_lang, output_lang)
        
        system_instruction = f"""You are a professional real-time translator in a bidirectional conversation system.

Your specific role:
- Listen ONLY to User {from_user} speaking in {input_language_name} (language code: {input_lang})
- Translate everything to {output_language_name} (language code: {output_lang}) for User {to_user}
- Speak the translation naturally in {output_language_name} with appropriate tone and emotion
- IMPORTANT: Always provide both audio AND text transcription of your translation
- Include the original text you heard in your response metadata

Translation guidelines:
- Maintain natural conversation flow
- Preserve tone, emotion, and intent
- Handle incomplete sentences gracefully
- Use appropriate cultural context
- Be concise but complete
- ONLY translate to {output_language_name}, never respond in any other language

Remember: You are enabling real-time communication between two people who don't speak the same language. User {from_user} speaks {input_language_name} and User {to_user} understands {output_language_name}."""
        
        logger.info(f"System instruction for {from_user}→{to_user} translation:\n{system_instruction[:200]}...")
        
        return system_instruction
    
    async def _get_daily_token(self, bot_name: str) -> str:
        """Get Daily.co token for bot"""
        from app.services.daily_service import DailyService
        daily_service = DailyService()
        
        # Create token for bot with appropriate permissions
        token = await daily_service.create_token(
            room_name=self.config.room_url.split('/')[-1],  # Extract room name from URL
            user_name=bot_name,
            is_owner=False,
            exp_time=7200,  # 2 hours
            properties={
                "enable_screenshare": False,
                "enable_recording": False,
                "start_video_off": True,
                "start_audio_off": False
            }
        )
        
        return token
    
    async def start(self):
        """Start both translation pipelines concurrently"""
        if self.is_running:
            logger.warning("Pipelines already running")
            return
            
        try:
            self.start_time = datetime.now()
            
            logger.info(f"\n" + "#"*80)
            logger.info(f"# STARTING TRANSLATION SESSION: {self.config.session_id}")
            logger.info(f"# Language A ({self.config.user_a_id}): {self.config.language_a}")
            logger.info(f"# Language B ({self.config.user_b_id}): {self.config.language_b}")
            logger.info(f"# Room URL: {self.config.room_url}")
            logger.info(f"#"*80 + f"\n")
            
            # Create pipeline runners for each direction
            for direction in [TranslationDirection.A_TO_B, TranslationDirection.B_TO_A]:
                logger.info(f"🚀 Starting pipeline: {direction.value}")
                self.pipeline_runners[direction] = PipelineRunner(handle_sigint=False)
                
                # Start each pipeline in its own task
                # The PipelineTask will automatically send a StartFrame when it begins
                self.runner_tasks[direction] = asyncio.create_task(
                    self.pipeline_runners[direction].run(self.pipeline_tasks[direction])
                )
                logger.info(f"✅ Pipeline {direction.value} runner task created.")
            
            # IMPORTANT: Wait a moment for pipelines to initialize before subscribing to audio
            await asyncio.sleep(5)  # Allow time for StartFrame to propagate
            
            # Now, subscribe to all participants for each bot
            # Note: We'll filter by actual participant IDs in the AudioInputFilter
            # For now, subscribe to all and filter later
            await self.transports[TranslationDirection.A_TO_B].update_subscriptions({
                "*": {"media": "subscribed"}  # Subscribe to all participants
            })
            logger.info(f"🔊 Bot A->B subscribed to all participants (will filter for User A).")
            
            await self.transports[TranslationDirection.B_TO_A].update_subscriptions({
                "*": {"media": "subscribed"}  # Subscribe to all participants
            })
            logger.info(f"🔊 Bot B->A subscribed to all participants (will filter for User B).")
            
            self.is_running = True
            logger.info(f"\n🎆 Translation pipelines started successfully!")
            logger.info(f"🎆 Waiting for audio input...\n")
            
        except Exception as e:
            logger.error(f"Failed to start pipelines: {e}")
            await self.cleanup()
            raise


            
    async def stop(self):
        """Stop both translation pipelines"""
        if not self.is_running:
            return
            
        try:
            logger.info(f"Stopping translation pipelines for session {self.config.session_id}")
            
            # Send EndFrame to all pipelines
            for direction in [TranslationDirection.A_TO_B, TranslationDirection.B_TO_A]:
                if direction in self.pipeline_tasks:
                    try:
                        await self.pipeline_tasks[direction].queue_frame(EndFrame())
                    except Exception as e:
                        logger.warning(f"Error queueing EndFrame for {direction.value}: {e}")
            
            # Give pipelines time to process EndFrame
            await asyncio.sleep(0.5)
            
            # Cancel runner tasks
            for direction, task in self.runner_tasks.items():
                if task and not task.done():
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass
            
            # Cancel pipeline tasks
            for direction, pipeline_task in self.pipeline_tasks.items():
                try:
                    await pipeline_task.cancel()
                except Exception as e:
                    logger.warning(f"Error cancelling pipeline task {direction.value}: {e}")
            
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
        self.pipeline_tasks.clear()
        self.pipeline_runners.clear()
        self.runner_tasks.clear()
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
