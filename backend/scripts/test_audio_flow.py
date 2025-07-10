#!/usr/bin/env python3
"""
Test script to verify audio transcription flow
"""
import asyncio
import logging
import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from app.services.websocket_service import websocket_manager
from app.services.simple_pipeline_manager import SimplePipelineManager

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def test_transcription_flow():
    """Test the complete audio transcription flow"""
    
    # Test parameters
    session_id = "test-session-123"
    room_url = "https://test.daily.co/test-room"
    user_a_id = "user-a-123"
    user_b_id = "user-b-456"
    
    logger.info("🚀 Starting transcription flow test")
    
    # Create simple pipeline manager
    pipeline = SimplePipelineManager(
        session_id=session_id,
        room_url=room_url,
        user_a_id=user_a_id,
        user_b_id=user_b_id
    )
    
    try:
        # Initialize pipeline
        logger.info("📦 Initializing pipeline...")
        await pipeline.initialize()
        
        # Start pipeline
        logger.info("▶️ Starting pipeline...")
        await pipeline.start()
        
        # Simulate some transcriptions
        logger.info("📝 Simulating transcriptions...")
        
        # Simulate transcription 1
        await websocket_manager.broadcast_transcription(
            session_id=session_id,
            speaker_id=user_a_id,
            original_text="Hello, how are you?",
            translated_text="Hola, ¿cómo estás?",
            language_from="en",
            language_to="es",
            confidence=0.95,
            is_partial=False
        )
        
        await asyncio.sleep(2)
        
        # Simulate transcription 2
        await websocket_manager.broadcast_transcription(
            session_id=session_id,
            speaker_id=user_b_id,
            original_text="Estoy bien, gracias",
            translated_text="I'm fine, thank you",
            language_from="es",
            language_to="en",
            confidence=0.92,
            is_partial=False
        )
        
        # Let it run for a bit
        logger.info("⏳ Running for 10 seconds...")
        await asyncio.sleep(10)
        
        # Get status
        status = await pipeline.get_status()
        logger.info(f"📊 Pipeline status: {status}")
        
        # Stop pipeline
        logger.info("⏹️ Stopping pipeline...")
        await pipeline.stop()
        
        logger.info("✅ Test completed successfully!")
        
    except Exception as e:
        logger.error(f"❌ Test failed: {e}", exc_info=True)
        await pipeline.cleanup()
        raise


async def test_websocket_only():
    """Test just the WebSocket broadcasting"""
    
    session_id = "test-ws-session"
    
    logger.info("🔌 Testing WebSocket broadcasting...")
    
    # Broadcast a few test messages
    for i in range(5):
        await websocket_manager.broadcast_transcription(
            session_id=session_id,
            speaker_id=f"user-{i % 2 + 1}",
            original_text=f"Test message {i} in English",
            translated_text=f"Mensaje de prueba {i} en español",
            language_from="en",
            language_to="es",
            confidence=0.9 + (i * 0.01),
            is_partial=False
        )
        
        logger.info(f"📨 Sent test transcription {i}")
        await asyncio.sleep(1)
        
    logger.info("✅ WebSocket test completed!")


async def main():
    """Run tests"""
    
    # Test 1: WebSocket only
    await test_websocket_only()
    
    # Test 2: Full pipeline (disabled for now as it needs Daily.co)
    # await test_transcription_flow()
    
    logger.info("🎉 All tests completed!")


if __name__ == "__main__":
    asyncio.run(main())
