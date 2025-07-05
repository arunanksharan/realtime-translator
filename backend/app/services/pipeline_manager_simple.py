"""
Simplified pipeline manager for development/testing
"""
import asyncio
import logging
from typing import Dict, Optional
from dataclasses import dataclass
from enum import Enum
from datetime import datetime

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

class SimplifiedPipelineManager:
    """Simplified pipeline manager for development"""
    
    def __init__(self, config: TranslationConfig):
        self.config = config
        self.is_running = False
        self.start_time = None
        self.translation_count = 0
        
    async def initialize(self):
        """Initialize pipeline"""
        logger.info(f"Initialized simplified pipeline for session {self.config.session_id}")
        
    async def start(self):
        """Start translation pipeline"""
        if self.is_running:
            logger.warning("Pipeline already running")
            return
            
        self.start_time = datetime.now()
        self.is_running = True
        logger.info(f"Started translation pipeline for session {self.config.session_id}")
        
        # Simulate translation activity
        asyncio.create_task(self._simulate_translation())
        
    async def stop(self):
        """Stop translation pipeline"""
        if not self.is_running:
            return
            
        self.is_running = False
        logger.info(f"Stopped translation pipeline for session {self.config.session_id}")
        
    async def cleanup(self):
        """Clean up resources"""
        self.is_running = False
        logger.info(f"Cleaned up pipeline for session {self.config.session_id}")
        
    async def get_status(self) -> Dict[str, any]:
        """Get pipeline status"""
        uptime = None
        if self.start_time:
            uptime = (datetime.now() - self.start_time).total_seconds()
            
        return {
            "session_id": self.config.session_id,
            "is_running": self.is_running,
            "uptime_seconds": uptime,
            "pipeline_a_to_b_status": {
                "status": "running" if self.is_running else "stopped",
                "direction": "a_to_b",
                "transport_connected": self.is_running,
                "llm_service_ready": True,
                "translation_count": self.translation_count,
                "last_translation_time_ms": 150
            },
            "pipeline_b_to_a_status": {
                "status": "running" if self.is_running else "stopped",
                "direction": "b_to_a",
                "transport_connected": self.is_running,
                "llm_service_ready": True,
                "translation_count": self.translation_count,
                "last_translation_time_ms": 145
            },
            "total_translations": self.translation_count * 2
        }
        
    async def get_metrics(self) -> Dict[str, any]:
        """Get pipeline metrics"""
        return {
            "session_id": self.config.session_id,
            "is_running": self.is_running,
            "total_translations": self.translation_count * 2,
            "pipelines": {
                "a_to_b": {
                    "translation_count": self.translation_count,
                    "last_translation_time_ms": 150,
                    "avg_translation_time_ms": 150,
                    "direction": f"{self.config.language_a}→{self.config.language_b}"
                },
                "b_to_a": {
                    "translation_count": self.translation_count,
                    "last_translation_time_ms": 145,
                    "avg_translation_time_ms": 145,
                    "direction": f"{self.config.language_b}→{self.config.language_a}"
                }
            }
        }
        
    async def health_check(self) -> Dict[str, bool]:
        """Perform health check"""
        return {
            "overall_healthy": True,
            "pipeline_a_to_b_healthy": True,
            "pipeline_b_to_a_healthy": True,
            "transport_healthy": True,
            "llm_services_healthy": True
        }
        
    async def _simulate_translation(self):
        """Simulate translation activity for demo purposes"""
        while self.is_running:
            await asyncio.sleep(5)  # Simulate translation every 5 seconds
            
            if self.is_running:
                self.translation_count += 1
                
                # Broadcast simulated transcription
                try:
                    from app.services.websocket_service import websocket_manager
                    
                    # Simulate User A speaking
                    await websocket_manager.broadcast_transcription(
                        session_id=self.config.session_id,
                        speaker_id=self.config.user_a_id,
                        original_text=f"Hello, this is test message {self.translation_count}",
                        translated_text=f"Hola, este es el mensaje de prueba {self.translation_count}",
                        language_from=self.config.language_a,
                        language_to=self.config.language_b,
                        confidence=0.92,
                        is_partial=False
                    )
                    
                    # Wait a bit, then simulate User B response
                    await asyncio.sleep(3)
                    
                    if self.is_running:
                        await websocket_manager.broadcast_transcription(
                            session_id=self.config.session_id,
                            speaker_id=self.config.user_b_id,
                            original_text=f"¡Hola! Mensaje de respuesta {self.translation_count}",
                            translated_text=f"Hello! Response message {self.translation_count}",
                            language_from=self.config.language_b,
                            language_to=self.config.language_a,
                            confidence=0.89,
                            is_partial=False
                        )
                        
                except Exception as e:
                    logger.warning(f"Failed to broadcast simulated transcription: {e}")

# Use simplified manager for now
DualPipelineManager = SimplifiedPipelineManager
