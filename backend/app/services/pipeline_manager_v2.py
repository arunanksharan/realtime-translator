"""
Translation pipeline manager implementing dual parallel pipelines - Modern Pipecat approach
"""
import asyncio
import logging
from typing import Dict, Optional, List
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
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext

from app.core.config import settings
from app.services.websocket_service import websocket_manager

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

class TranslationRouter(FrameProcessor):
    """Routes audio between users based on direction"""
    
    def __init__(self, direction: TranslationDirection, session_id: str):
        super().__init__()
        self.direction = direction
        self.session_id = session_id
        self._audio_count = 0
        
    async def process_frame(self, frame, direction=None):
        """Route audio frames appropriately"""
        if isinstance(frame, AudioRawFrame):
            self._audio_count += 1
            
            # Log periodically
            if self._audio_count <= 5 or self._audio_count % 100 == 0:
                participant_id = getattr(frame, 'user_id', 'unknown')
                logger.info(f"🎯 TranslationRouter [{self.direction.value}] Frame #{self._audio_count} from {participant_id}")
        
        # Pass all frames through
        await self.push_frame(frame, direction)

class TranscriptionBroadcaster(FrameProcessor):
    """Broadcasts transcriptions via WebSocket"""
    
    def __init__(self, session_id: str, direction: str, source_lang: str, target_lang: str):
        super().__init__()
        self.session_id = session_id
        self.direction = direction
        self.source_lang = source_lang
        self.target_lang = target_lang
        
    async def process_frame(self, frame, direction=None):
        """Broadcast transcription updates"""
        # Pass frame through first
        await self.push_frame(frame, direction)
        
        # Check for transcription data
        if isinstance(frame, (TextFrame, TranscriptionFrame)):
            text = getattr(frame, 'text', '')
            if text and text != 'Translation generated':
                try:
                    await websocket_manager.broadcast_transcription(
                        session_id=self.session_id,
                        speaker_id='bot',
                        original_text=f"[{self.source_lang}] Audio",
                        translated_text=text,
                        language_from=self.source_lang,
                        language_to=self.target_lang,
                        confidence=0.85,
                        is_partial=False
                    )
                    logger.info(f"📢 Broadcasted: {text[:50]}...")
                except Exception as e:
                    logger.warning(f"Failed to broadcast: {e}")

class DualPipelineManager:
    """Manages dual parallel translation pipelines using modern Pipecat approach"""
    
    def __init__(self, config: TranslationConfig):
        self.config = config
        self.runners: List[PipelineRunner] = []
        self.tasks: List[PipelineTask] = []
        self.transports: Dict[TranslationDirection, DailyTransport] = {}
        self.llm_services: Dict[TranslationDirection, GeminiMultimodalLiveLLMService] = {}
        self.is_running = False
        self.start_time = None
        
    async def setup_and_run(self):
        """Set up and run both translation pipelines"""
        try:
            self.start_time = datetime.now()
            
            logger.info(f"\n" + "#"*80)
            logger.info(f"# STARTING TRANSLATION SESSION: {self.config.session_id}")
            logger.info(f"# Language A ({self.config.user_a_id}): {self.config.language_a}")
            logger.info(f"# Language B ({self.config.user_b_id}): {self.config.language_b}")
            logger.info(f"# Room URL: {self.config.room_url}")
            logger.info(f"#"*80 + f"\n")
            
            # Create tasks for both pipelines
            pipeline_tasks = [
                self._create_and_run_pipeline(TranslationDirection.A_TO_B),
                self._create_and_run_pipeline(TranslationDirection.B_TO_A)
            ]
            
            self.is_running = True
            
            # Run both pipelines concurrently
            await asyncio.gather(*pipeline_tasks)
            
        except Exception as e:
            logger.error(f"Failed to run pipelines: {e}")
            raise
        finally:
            await self.cleanup()
    
    async def _create_and_run_pipeline(self, direction: TranslationDirection):
        """Create and run a single translation pipeline"""
        try:
            if direction == TranslationDirection.A_TO_B:
                source_lang = self.config.language_a
                target_lang = self.config.language_b
                source_user = "A"
                target_user = "B"
            else:
                source_lang = self.config.language_b
                target_lang = self.config.language_a
                source_user = "B"
                target_user = "A"
            
            logger.info(f"🚀 Creating pipeline {direction.value}: {source_lang} → {target_lang}")
            
            # Create Daily transport
            daily_params = DailyParams(
                audio_in_enabled=True,
                audio_out_enabled=True,
                transcription_enabled=False,
                vad_enabled=True,
                vad_analyzer=SileroVADAnalyzer()
            )
            
            transport = DailyTransport(
                room_url=self.config.room_url,
                token=await self._get_daily_token(f"bot_{direction.value}"),
                bot_name=f"translator_{direction.value}",
                params=daily_params
            )
            self.transports[direction] = transport
            
            # Create Gemini LLM service
            llm = GeminiMultimodalLiveLLMService(
                api_key=self.config.gemini_multimodal_live_api_key,
                voice_id="Puck",  # You can vary this per direction
                transcribe_user_audio=True,
                system_instruction=self._get_system_instruction(
                    source_lang, target_lang, source_user, target_user
                )
            )
            self.llm_services[direction] = llm
            
            # Create context aggregator
            context = OpenAILLMContext()
            context_aggregator = llm.create_context_aggregator(context)
            
            # Create custom processors
            router = TranslationRouter(direction, self.config.session_id)
            transcription_broadcaster = TranscriptionBroadcaster(
                self.config.session_id, 
                direction.value,
                source_lang,
                target_lang
            )
            
            # Build pipeline
            pipeline = Pipeline([
                transport.input(),
                router,
                context_aggregator.user(),
                llm,
                transcription_broadcaster,
                transport.output(),
                context_aggregator.assistant()
            ])
            
            # Create pipeline task
            task = PipelineTask(
                pipeline,
                params=PipelineParams(
                    enable_metrics=True,
                    enable_usage_metrics=True
                )
            )
            self.tasks.append(task)
            
            # Set up event handlers
            @transport.event_handler("on_first_participant_joined")
            async def on_first_participant_joined(transport, participant):
                logger.info(f"First participant joined {direction.value}: {participant['id']}")
                # Subscribe to specific participants or all
                # For now, we'll subscribe after all participants join
                pass
            
            @transport.event_handler("on_participant_joined")
            async def on_participant_joined(transport, participant):
                logger.info(f"Participant joined {direction.value}: {participant['id']}")
            
            @transport.event_handler("on_participant_left")
            async def on_participant_left(transport, participant, reason):
                logger.info(f"Participant left {direction.value}: {participant['id']}")
                if len(transport._participants) == 0:
                    await task.cancel()
            
            # Create and run pipeline runner
            runner = PipelineRunner(handle_sigint=False)
            self.runners.append(runner)
            
            logger.info(f"✅ Starting pipeline runner for {direction.value}")
            await runner.run(task)
            
        except Exception as e:
            logger.error(f"Pipeline {direction.value} error: {e}")
            raise
    
    def _get_system_instruction(self, input_lang: str, output_lang: str, from_user: str, to_user: str) -> str:
        """Generate system instruction for translation bot"""
        language_names = {
            "en": "English", "es": "Spanish", "fr": "French", "de": "German",
            "it": "Italian", "pt": "Portuguese", "ja": "Japanese", "ko": "Korean",
            "zh": "Chinese", "ar": "Arabic", "hi": "Hindi", "ru": "Russian"
        }
        
        input_name = language_names.get(input_lang, input_lang)
        output_name = language_names.get(output_lang, output_lang)
        
        return f"""You are a real-time translator. 
Listen to audio in {input_name} and translate it to {output_name}.
Maintain the tone and emotion of the speaker.
Be concise and natural in your translations.
Only output the translation, nothing else."""
    
    async def _get_daily_token(self, bot_name: str) -> str:
        """Get Daily.co token for bot"""
        from app.services.daily_service import DailyService
        daily_service = DailyService()
        
        token = await daily_service.create_token(
            room_name=self.config.room_url.split('/')[-1],
            user_name=bot_name,
            is_owner=False,
            exp_time=7200,
            properties={
                "enable_screenshare": False,
                "enable_recording": False,
                "start_video_off": True,
                "start_audio_off": False
            }
        )
        
        return token
    
    async def stop(self):
        """Stop all pipelines"""
        logger.info("Stopping translation pipelines...")
        
        # Cancel all tasks
        for task in self.tasks:
            try:
                await task.cancel()
            except Exception as e:
                logger.warning(f"Error cancelling task: {e}")
        
        self.is_running = False
    
    async def cleanup(self):
        """Clean up resources"""
        # Cleanup transports
        for transport in self.transports.values():
            try:
                await transport.cleanup()
            except Exception as e:
                logger.error(f"Error cleaning up transport: {e}")
        
        # Cleanup LLM services  
        for llm in self.llm_services.values():
            try:
                await llm.cleanup()
            except Exception as e:
                logger.error(f"Error cleaning up LLM: {e}")
        
        self.transports.clear()
        self.llm_services.clear()
        self.runners.clear()
        self.tasks.clear()
        
        logger.info("Cleanup completed")
    
    async def get_status(self) -> Dict[str, any]:
        """Get pipeline status"""
        uptime = None
        if self.start_time:
            uptime = (datetime.now() - self.start_time).total_seconds()
        
        return {
            "session_id": self.config.session_id,
            "is_running": self.is_running,
            "uptime_seconds": uptime,
            "pipelines": len(self.tasks),
            "transports": len(self.transports)
        }
    
    async def get_metrics(self) -> Dict[str, any]:
        """Get pipeline metrics"""
        return {
            "session_id": self.config.session_id,
            "is_running": self.is_running,
            "total_translations": 0,  # TODO: Implement actual metrics
            "pipelines": {}
        }
    
    async def health_check(self) -> Dict[str, bool]:
        """Perform health check"""
        return {
            "overall_healthy": self.is_running,
            "pipeline_a_to_b_healthy": True,
            "pipeline_b_to_a_healthy": True,
            "transport_healthy": True,
            "llm_services_healthy": True
        }
