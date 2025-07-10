# Implementation Guide: Gemini API Text Transcription Fix

## Background
The Gemini Multimodal Live API is used for real-time translation but currently only returns audio without text transcriptions, causing the transcription feed to remain empty.

## Step-by-Step Implementation

### 1. Update Gemini Service Configuration

**File**: `/backend/app/services/pipeline_manager.py`

**Current Issue**: The Gemini service is configured for audio-only responses.

**Fix**: Update the `_create_pipeline_a_to_b` and `_create_pipeline_b_to_a` methods:

```python
# Around line 180-200 in pipeline_manager.py
self.llm_services[direction] = GeminiMultimodalLiveLLMService(
    api_key=self.config.gemini_multimodal_live_api_key,
    voice_id="auto",
    model="gemini-2.0-flash-exp",
    system_instruction=self._get_system_instruction(
        self.config.language_a, 
        self.config.language_b,
        "A", "B"
    ),
    generation_config={
        "response_modalities": ["AUDIO", "TEXT"],  # Add TEXT modality
        "speech_config": {
            "voice_config": {
                "voice_name": "auto",
                "speaking_rate": 1.0,
                "pitch": 0.0,
            }
        },
        # Add text configuration
        "text_config": {
            "temperature": 0.7,
            "top_p": 0.95,
            "max_output_tokens": 150,
        }
    },
    # Enable streaming for real-time text
    enable_streaming=True,
    stream_text=True,
)
```

### 2. Update System Instructions

**Add to `_get_system_instruction` method**:

```python
def _get_system_instruction(self, source_lang: str, target_lang: str, 
                           source_user: str, target_user: str) -> str:
    return f"""You are a professional real-time translator. Your role is to:

1. Listen to audio in {source_lang} from User {source_user}
2. Translate it accurately to {target_lang} for User {target_user}
3. Speak the translation naturally with appropriate tone and emotion
4. Provide both audio and text output for each translation
5. Include the original transcription in your response

IMPORTANT: 
- Always return both the audio translation AND the text transcription
- Format: Return the original text and translated text separately
- Maintain natural conversation flow and tone
- Handle incomplete sentences gracefully
- Use appropriate cultural context

Remember: This is real-time communication between two people who don't speak 
the same language. Your translation enables their conversation."""
```

### 3. Update TranslationProcessor

**File**: `/backend/app/services/pipeline_manager.py`

**Update the `TranslationProcessor.process_frame` method**:

```python
async def process_frame(self, frame: AudioRawFrame) -> Optional[AudioRawFrame]:
    """Process audio frame through LLM with text extraction"""
    start_time = datetime.now()
    
    try:
        # Process through Gemini
        result = await self.llm_service.process_frame(frame)
        
        if result:
            self.translation_count += 1
            processing_time = (datetime.now() - start_time).total_seconds() * 1000
            self.last_translation_time = processing_time
            
            # Extract text from Gemini response
            # The response format depends on Pipecat's implementation
            original_text = ""
            translated_text = ""
            
            # Check different possible response formats
            if hasattr(result, 'metadata') and result.metadata:
                original_text = result.metadata.get('original_text', '')
                translated_text = result.metadata.get('translated_text', '')
            elif hasattr(result, 'text'):
                translated_text = result.text
            elif hasattr(result, 'transcription'):
                translated_text = result.transcription
                
            # If we have text, broadcast it
            if translated_text:
                await self._broadcast_transcription(
                    original_text=original_text or "Audio received",
                    translated_text=translated_text,
                    speaker_id=getattr(frame, 'participant_id', 'unknown'),
                    confidence=0.85
                )
                
            logger.info(f"Translation {self.direction} #{self.translation_count} "
                       f"completed in {processing_time:.2f}ms")
            
            return result
            
    except Exception as e:
        logger.error(f"Translation error in {self.direction}: {e}")
        await self._broadcast_error(str(e))
        return None
```

### 4. Update Broadcast Method

```python
async def _broadcast_transcription(self, original_text: str, 
                                 translated_text: str, 
                                 speaker_id: str, 
                                 confidence: float):
    """Broadcast transcription update via WebSocket"""
    try:
        from app.services.websocket_service import websocket_manager
        
        # Determine languages based on direction
        if self.direction == "a_to_b":
            lang_from = self.config.language_a
            lang_to = self.config.language_b
        else:
            lang_from = self.config.language_b
            lang_to = self.config.language_a
        
        await websocket_manager.broadcast_transcription(
            session_id=self.session_id,
            speaker_id=speaker_id,
            original_text=original_text,
            translated_text=translated_text,
            language_from=lang_from,
            language_to=lang_to,
            confidence=confidence,
            is_partial=False
        )
        
        logger.info(f"Broadcasted transcription: {original_text[:50]}... -> "
                   f"{translated_text[:50]}...")
                   
    except Exception as e:
        logger.warning(f"Failed to broadcast transcription: {e}")
```

### 5. Alternative: Add Speech-to-Text Service

If Gemini doesn't provide text transcriptions, add a separate STT service:

```python
# New file: /backend/app/services/speech_to_text.py
import asyncio
from google.cloud import speech_v1
from google.cloud.speech_v1 import types

class SpeechToTextService:
    def __init__(self):
        self.client = speech_v1.SpeechClient()
        self.config = types.RecognitionConfig(
            encoding=types.RecognitionConfig.AudioEncoding.LINEAR16,
            sample_rate_hertz=16000,
            language_code="en-US",  # Dynamic based on session
            enable_automatic_punctuation=True,
            model="latest_long",
        )
        
    async def transcribe_audio(self, audio_data: bytes, 
                              language_code: str) -> str:
        """Transcribe audio to text"""
        config = self.config
        config.language_code = language_code
        
        audio = types.RecognitionAudio(content=audio_data)
        
        try:
            response = await asyncio.to_thread(
                self.client.recognize, 
                config=config, 
                audio=audio
            )
            
            transcript = ""
            for result in response.results:
                transcript += result.alternatives[0].transcript + " "
                
            return transcript.strip()
            
        except Exception as e:
            logger.error(f"STT error: {e}")
            return ""
```

### 6. Testing the Implementation

Create a test script to verify transcriptions:

```python
# /backend/test_transcription.py
import asyncio
from app.services.translation_service import translation_service

async def test_transcription():
    # Create a test session
    session = await translation_service.create_session(
        user_a_id="test_user_a",
        language_a="en",
        language_b="es"
    )
    
    print(f"Created session: {session.id}")
    
    # Start the session
    await translation_service.start_session(session.id)
    
    # Wait for transcriptions
    print("Listening for transcriptions...")
    await asyncio.sleep(30)
    
    # Check if transcriptions were received
    # Monitor WebSocket messages or check logs

if __name__ == "__main__":
    asyncio.run(test_transcription())
```

## Verification Steps

1. **Check Gemini API Response Format**
   - Log the full response from Gemini
   - Identify where text is included
   - Update extraction logic accordingly

2. **Monitor WebSocket Messages**
   - Use browser dev tools
   - Check Network → WS tab
   - Verify transcription messages

3. **Check Backend Logs**
   - Look for "Broadcasted transcription" messages
   - Verify text extraction is working

## Troubleshooting

If transcriptions still don't appear:

1. **Verify Gemini API Capabilities**
   - Check if your API key has access to text responses
   - Test with Gemini API directly

2. **Check Pipecat Integration**
   - Review Pipecat documentation for Gemini integration
   - Update to latest Pipecat version if needed

3. **Add Debug Logging**
   ```python
   logger.debug(f"Gemini response type: {type(result)}")
   logger.debug(f"Gemini response attrs: {dir(result)}")
   logger.debug(f"Gemini response content: {result}")
   ```

4. **Fallback Options**
   - Use separate STT service
   - Process audio in parallel
   - Use streaming transcription

## Next Steps

After implementing these changes:

1. Restart the backend service
2. Create a new translation session
3. Start speaking and check the transcription feed
4. Monitor logs for any errors
5. Adjust extraction logic based on actual Gemini response format
