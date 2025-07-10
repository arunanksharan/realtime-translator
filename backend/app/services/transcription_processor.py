"""
Transcription processor for handling audio-to-text and translation

This module provides processors for tracking transcriptions, identifying participants,
and collecting metrics in the translation pipeline.
"""
import logging
import time
from typing import Dict
from datetime import datetime

from pipecat.processors.frame_processor import FrameProcessor
from pipecat.frames.frames import (
    AudioRawFrame, 
    TextFrame, 
    TranscriptionFrame,
    LLMFullResponseStartFrame,
    LLMFullResponseEndFrame,
    StartFrame
)

from app.services.websocket_service import websocket_manager

logger = logging.getLogger(__name__)


class TranscriptionTracker(FrameProcessor):
    """
    Tracks and broadcasts transcriptions and their corresponding translations
    from the audio pipeline. It assumes a translation is generated in response
    to a transcription within an LLM request/response cycle.
    """
    
    def __init__(
        self, 
        session_id: str,
        source_language: str,
        target_language: str,
        source_user_id: str,
        target_user_id: str,
        direction: str
    ):
        super().__init__()
        self.session_id = session_id
        self.source_language = source_language
        self.target_language = target_language
        self.source_user_id = source_user_id
        self.target_user_id = target_user_id
        self.direction = direction
        self._current_transcription: str = ""
        self._translation_count = 0
        self._started = False
        self._queued_frames = []
        
    async def process_frame(self, frame, direction=None):
        """Processes frames to identify and broadcast transcription/translation pairs."""
        # Handle StartFrame
        if isinstance(frame, StartFrame):
            self._started = True
            logger.info(f"📝 TranscriptionTracker initialized for {self.direction}")
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
        await self.push_frame(frame, direction)
        
        try:
            # A TranscriptionFrame contains the original speech-to-text result.
            if isinstance(frame, TranscriptionFrame):
                logger.info(f"📝 Received TranscriptionFrame: {frame.text[:50]}...")
                # We store this as the "active" transcription to be translated.
                self._current_transcription = frame.text
                # Broadcast the original transcription immediately as a partial result.
                await websocket_manager.broadcast_transcription(
                    session_id=self.session_id,
                    speaker_id=self.source_user_id,
                    original_text=frame.text,
                    translated_text="",  # Translation is not yet available.
                    language_from=self.source_language,
                    language_to=self.target_language,
                    confidence=getattr(frame, 'confidence', 0.9),
                    is_partial=True
                )
                
            # A TextFrame from an LLM is assumed to be the translation.
            elif isinstance(frame, TextFrame):
                # Only process this as a translation if we have a pending transcription.
                if self._current_transcription:
                    logger.info(f"📄 Received translation: {frame.text[:50]}...")
                    self._translation_count += 1
                    
                    # Broadcast the final, complete pair.
                    await websocket_manager.broadcast_transcription(
                        session_id=self.session_id,
                        speaker_id=self.source_user_id,
                        original_text=self._current_transcription,
                        translated_text=frame.text,
                        language_from=self.source_language,
                        language_to=self.target_language,
                        confidence=getattr(frame, 'confidence', 0.85),
                        is_partial=False  # This is the complete message.
                    )
                    
                    logger.info(f"✅ Broadcasted translation #{self._translation_count}: "
                              f"{self.source_language}→{self.target_language}")
                    
                    # IMPORTANT: Clear the transcription now that it has been translated
                    # and broadcasted. This prevents re-sending with stale data.
                    self._current_transcription = ""
                    
            # The end of an LLM response signals the end of a full turn.
            elif isinstance(frame, LLMFullResponseEndFrame):
                logger.debug(f"🤖 LLM response ended for {self.direction}")
                # As a safeguard, reset the state to ensure we're ready for the next turn.
                self._current_transcription = ""
                
        except Exception as e:
            logger.error(f"Error processing frame in TranscriptionTracker: {e}", exc_info=True)


class ParticipantIdentifier(FrameProcessor):
    """
    Identifies and tags audio frames with internal user IDs based on
    the Daily-provided session ID.
    """
    
    def __init__(self, user_mapping: Dict[str, str], direction: str):
        super().__init__()
        # Mapping of Daily session_id to your application's internal user_id
        self.user_mapping = user_mapping
        self.direction = direction
        self._frame_count = 0
        self._started = False
        self._queued_frames = []
        
    async def process_frame(self, frame, direction=None):
        """Adds a `user_id` attribute to audio frames if the participant is mapped."""
        # Handle StartFrame
        if isinstance(frame, StartFrame):
            self._started = True
            logger.info(f"🎭 ParticipantIdentifier initialized for {self.direction}")
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
        # Always push the frame through the pipeline.
        await self.push_frame(frame, direction)
        
        if isinstance(frame, AudioRawFrame):
            # The Daily transport adds the 'participant' dictionary to the frame.
            if hasattr(frame, 'participant'):
                daily_session_id = frame.participant.get('session_id')
                if daily_session_id and daily_session_id in self.user_mapping:
                    # Add our internal user_id to the frame for downstream processors.
                    frame.user_id = self.user_mapping[daily_session_id]
                    frame.participant_id = self.user_mapping[daily_session_id]
                    
                    self._frame_count += 1
                    if self._frame_count % 500 == 0:  # Log periodically for debugging.
                        logger.debug(f"🎤 Tagged audio frame #{self._frame_count} from {frame.user_id} in {self.direction}")


class AudioMetricsCollector(FrameProcessor):
    """
    Collects and periodically broadcasts metrics about frame processing
    for a specific pipeline direction.
    """
    METRICS_INTERVAL_SEC = 30.0  # Broadcast metrics every 30 seconds.
    
    def __init__(self, session_id: str, direction: str):
        super().__init__()
        self.session_id = session_id
        self.direction = direction
        self.audio_frames_received = 0
        self.text_frames_received = 0
        # Use a monotonic clock for robustly measuring time intervals.
        self._last_update_time = time.monotonic()
        self._started = False
        self._queued_frames = []
        
    async def process_frame(self, frame, direction=None):
        """Counts frames and triggers periodic metric broadcasts."""
        # Handle StartFrame
        if isinstance(frame, StartFrame):
            self._started = True
            logger.info(f"📊 AudioMetricsCollector initialized for {self.direction}")
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
        await self.push_frame(frame, direction)
        
        if isinstance(frame, AudioRawFrame):
            self.audio_frames_received += 1
        elif isinstance(frame, (TextFrame, TranscriptionFrame)):
            self.text_frames_received += 1
            
        # Check if it's time to broadcast metrics.
        current_time = time.monotonic()
        if (current_time - self._last_update_time) > self.METRICS_INTERVAL_SEC:
            await self._broadcast_metrics()
            self._last_update_time = current_time
            
    async def _broadcast_metrics(self):
        """Assembles and broadcasts the current metrics via WebSocket."""
        metrics = {
            "direction": self.direction,
            "audio_frames_received": self.audio_frames_received,
            "text_frames_received": self.text_frames_received,
            "timestamp_utc": datetime.utcnow().isoformat() + "Z",
        }
        await websocket_manager.broadcast_session_status(
            self.session_id,
            {"pipeline_metrics": metrics, "status": "active"}
        )
        logger.info(f"📊 Metrics for {self.direction}: {metrics}")
