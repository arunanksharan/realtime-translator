# Issue 3 Fix: WebSocket and Real-time Updates Integration

## Problem
1. WebSocket connection established but transcriptions not showing in UI
2. Pipeline manager attempts to broadcast transcriptions but text extraction from audio frames not working
3. Real-time status updates not fully integrated
4. Missing transcription text from Gemini API responses

## Analysis
The WebSocket infrastructure is properly implemented:
- Backend WebSocket manager handles connections, broadcasts, and participant tracking
- Frontend useWebSocket hook maintains connection and receives messages
- TranscriptionFeed component ready to display transcriptions

The issue is in the pipeline manager where it tries to extract transcription text from audio frames, but the frames don't contain the text data.

## Solution Required

### 1. Gemini API Configuration
The Gemini Multimodal Live API needs to be configured to return both audio AND text in the response:

```python
# In pipeline_manager.py - Update Gemini service configuration
self.llm_services[direction] = GeminiMultimodalLiveLLMService(
    api_key=self.config.gemini_multimodal_live_api_key,
    model="gemini-2.0-flash-exp",
    system_instruction=self._get_system_instruction(...),
    generation_config={
        "response_modalities": ["AUDIO", "TEXT"],  # Request both modalities
        "speech_config": {...},
        "text_config": {
            "enable_transcription": True,  # Enable text transcription
            "include_original_text": True,  # Include source text
        }
    }
)
```

### 2. Update TranslationProcessor
The TranslationProcessor needs to handle Gemini's response format properly:

```python
async def process_frame(self, frame: AudioRawFrame) -> Optional[AudioRawFrame]:
    """Process audio frame through LLM with transcription extraction"""
    start_time = datetime.now()
    
    try:
        # Process through Gemini
        result = await self.llm_service.process_frame(frame)
        
        if result:
            # Extract transcription from Gemini response
            # The response should include both audio and text
            if hasattr(result, 'transcription') or hasattr(result, 'text'):
                original_text = getattr(frame, 'transcription_text', '')
                translated_text = getattr(result, 'transcription_text', '')
                
                if translated_text:
                    # Broadcast transcription via WebSocket
                    await self._broadcast_transcription(
                        original_text=original_text,
                        translated_text=translated_text,
                        speaker_id=getattr(frame, 'participant_id', 'unknown'),
                        confidence=getattr(result, 'confidence', 0.85)
                    )
            
            return result
```

### 3. Pipeline Status Updates
Add periodic status updates to the pipeline manager:

```python
async def _status_update_loop(self):
    """Send periodic pipeline status updates"""
    while self.is_running:
        try:
            status = await self.get_status()
            
            # Broadcast via WebSocket
            from app.services.websocket_service import websocket_manager
            await websocket_manager.broadcast_pipeline_status(
                self.config.session_id, 
                status
            )
            
            await asyncio.sleep(5)  # Update every 5 seconds
        except Exception as e:
            logger.error(f"Status update error: {e}")
```

### 4. WebSocket Message Flow
```
Audio Input (User A speaks)
    ↓
Daily.co captures audio
    ↓
Pipeline A→B processes
    ↓
Gemini API translates (returns audio + text)
    ↓
TranslationProcessor extracts text
    ↓
WebSocket broadcasts transcription
    ↓
Frontend receives and displays in TranscriptionFeed
    ↓
Translated audio plays for User B
```

## Current Implementation Status
- ✅ WebSocket infrastructure complete
- ✅ Frontend components ready
- ✅ Basic pipeline integration exists
- ❌ Text extraction from Gemini responses
- ❌ Proper transcription broadcasting
- ❌ Real-time status updates

## Next Steps
1. Update Gemini API configuration to request text transcriptions
2. Implement proper text extraction from Gemini responses
3. Add status update loop to pipeline manager
4. Test end-to-end transcription flow
5. Add error handling for transcription failures

## Alternative Approach
If Gemini doesn't provide text transcriptions directly, consider:
1. Using a separate Speech-to-Text service (Google Cloud Speech-to-Text)
2. Processing audio in parallel for transcription
3. Using Gemini's streaming capabilities for real-time text

## Files to Modify
1. `/backend/app/services/pipeline_manager.py` - Update Gemini config and text extraction
2. `/backend/app/services/translation_service.py` - Add status update loop
3. Consider adding a separate transcription service if needed
