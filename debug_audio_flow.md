# Audio Flow Debugging Guide

## Quick Test: Bypass Filters

To quickly test if audio is flowing, modify the pipeline creation in `pipeline_manager.py`:

### Original Pipeline (A→B):
```python
self.pipelines[direction] = Pipeline([
    self.transports[direction].input(),
    metrics_collector,
    AudioInputFilter(source_user=self.config.user_a_id),  # COMMENT THIS OUT
    self.processors[direction],
    transcription_tracker,
    AudioOutputFilter(target_user=self.config.user_b_id),  # COMMENT THIS OUT
    self.transports[direction].output()
])
```

### Test Pipeline (A→B):
```python
self.pipelines[direction] = Pipeline([
    self.transports[direction].input(),
    metrics_collector,
    # AudioInputFilter(source_user=self.config.user_a_id),  # BYPASSED
    self.processors[direction],
    transcription_tracker,
    # AudioOutputFilter(target_user=self.config.user_b_id),  # BYPASSED
    self.transports[direction].output()
])
```

## Common Issues and Solutions:

### 1. Daily Transport Not Capturing Audio
Add participant audio subscription after transport creation:

```python
# After creating transport
self.transports[direction] = DailyTransport(...)

# Subscribe to all participants initially (for debugging)
await self.transports[direction].update_subscriptions(
    participant_settings={
        "base": {
            "subscribe": True,
            "send": True
        }
    }
)
```

### 2. Participant ID Mismatch
The Daily session_id might not match your user_a_id/user_b_id. Log the actual Daily participant info:

```python
# Add to pipeline after transport input
class DebugLogger(FrameProcessor):
    async def process_frame(self, frame, direction=None):
        if isinstance(frame, AudioRawFrame) and hasattr(frame, 'participant'):
            logger.info(f"🔍 Daily participant: {frame.participant}")
        await self.push_frame(frame, direction)
```

### 3. Gemini Not Configured for Audio
Check Gemini configuration:
- Ensure `response_modalities` includes "AUDIO"
- Verify `audio_config` has correct language codes
- Check if API key has audio permissions

### 4. Missing Audio Data
If frames have no audio data, check:
- Microphone permissions in browser
- Daily room audio settings
- Transport audio parameters

## Debugging Checklist:

1. ✅ Check browser console for microphone errors
2. ✅ Verify Daily room has audio enabled
3. ✅ Confirm bots joined the room (check Daily dashboard)
4. ✅ Look for initialization logs (StartFrame processed)
5. ✅ Monitor frame flow logs
6. ✅ Check Gemini API responses
7. ✅ Verify WebSocket is receiving transcription updates
