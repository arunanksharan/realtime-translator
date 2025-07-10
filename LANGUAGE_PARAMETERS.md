# Language Parameter Configuration for GeminiMultimodalLiveLLMService

## Current Implementation

Yes, we are passing language parameters to the GeminiMultimodalLiveLLMService, but primarily through the **system instruction** rather than as explicit API parameters.

### What We're Currently Doing:

1. **System Instruction** ✅
   - Languages are passed via detailed system instructions
   - Now includes both language codes and full names
   - Example: "Listen ONLY to User A speaking in English (language code: en)"

2. **Generation Config** (Added now) ✅
   - Added `audio_config` section with:
     ```python
     "audio_config": {
         "input_language": self.config.language_a,  # e.g., "en"
         "output_language": self.config.language_b   # e.g., "hi"
     }
     ```

3. **Voice Configuration** ⚠️
   - Currently using `voice_id="auto"` 
   - Gemini will auto-select based on output language

### Enhanced Configuration Applied:

```python
self.llm_services[direction] = GeminiMultimodalLiveLLMService(
    api_key=self.config.gemini_multimodal_live_api_key,
    voice_id="auto",  # Gemini selects appropriate voice
    model="gemini-2.0-flash-exp",
    system_instruction=self._get_system_instruction(
        self.config.language_a,  # Source language
        self.config.language_b,  # Target language
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
        # NEW: Explicit language configuration
        "audio_config": {
            "input_language": self.config.language_a,
            "output_language": self.config.language_b
        }
    },
    enable_streaming=True,
    stream_text=True
)
```

### Logging Added:

1. **Pipeline Creation**:
   ```
   Creating pipeline a_to_b: en → hi
   Creating pipeline b_to_a: hi → en
   ```

2. **System Instruction**:
   ```
   System instruction for A→B translation:
   You are a professional real-time translator...
   ```

## Potential Issues to Watch:

1. **Language Code Format**: 
   - We use ISO 639-1 codes (e.g., "en", "hi")
   - Gemini might expect different formats (e.g., "en-US", "hi-IN")

2. **Voice Selection**:
   - Using "auto" for voice selection
   - Might need specific voice IDs for certain languages

3. **Regional Variants**:
   - "zh" vs "zh-CN" vs "zh-TW"
   - "en" vs "en-US" vs "en-GB"

## Verification Steps:

After restarting the backend, check logs for:
1. Language parameters being passed correctly
2. System instruction containing proper language names
3. No errors from Gemini about unsupported languages

## Additional Considerations:

The Pipecat library might have its own language handling. Without access to the Pipecat source, we're making educated guesses about the best way to pass language parameters. The combination of:
- Detailed system instructions
- Language hints in audio_config
- Auto voice selection

Should provide Gemini with enough context to perform accurate translations.
