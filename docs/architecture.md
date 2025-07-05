# Architecture Deep Dive

## 🏛️ System Architecture

### High-Level Overview
```
┌─────────────────┐    ┌─────────────────┐
│   Frontend A    │    │   Frontend B    │
│  (Language A)   │    │  (Language B)   │
└─────────┬───────┘    └─────────┬───────┘
          │                      │
          │   WebRTC Audio       │
          │                      │
    ┌─────▼──────────────────────▼─────┐
    │        Daily.co WebRTC           │
    │         Media Server             │
    └─────┬──────────────────────┬─────┘
          │                      │
          │                      │
    ┌─────▼─────┐          ┌─────▼─────┐
    │Pipeline A │          │Pipeline B │
    │  A → B    │          │  B → A    │
    └─────┬─────┘          └─────┬─────┘
          │                      │
          └──────┬─────────┬─────┘
                 │         │
         ┌───────▼─────────▼───────┐
         │   Gemini Multimodal     │
         │     Live API            │
         └─────────────────────────┘
```

## 🔄 Translation Pipeline Architecture

### Dual Pipeline Design

We implement **two parallel pipelines** to handle bidirectional translation:

1. **Pipeline A**: User A (Language A) → User B (Language B)
2. **Pipeline B**: User B (Language B) → User A (Language A)

### Why Parallel Pipelines?

**Single Pipeline Limitations**:
- Complex state management for bidirectional audio
- Difficult to handle simultaneous speakers
- Language context switching issues
- Higher latency due to routing complexity

**Parallel Pipeline Benefits**:
- ✅ Isolated language contexts
- ✅ Better handling of simultaneous speech
- ✅ Simplified state management
- ✅ Lower latency per direction
- ✅ Easier debugging and monitoring

### Pipeline Components

Each pipeline consists of these Pipecat components:

```python
# Pipeline A: User A → User B
pipeline_a = Pipeline([
    # 1. Audio Input Transport
    DailyTransport(
        room_url=daily_room_url,
        participant_id="user_a",
        audio_in=True,
        audio_out=False  # Only listening to User A
    ),
    
    # 2. Speech Recognition + Translation
    GeminiMultimodalLiveProcessor(
        input_language="en",  # User A's language
        output_language="es", # User B's language
        mode="speech_to_speech"
    ),
    
    # 3. Audio Output Transport
    DailyTransport(
        room_url=daily_room_url,
        participant_id="user_b",
        audio_in=False,  # Only sending to User B
        audio_out=True
    )
])

# Pipeline B: User B → User A
pipeline_b = Pipeline([
    # 1. Audio Input Transport
    DailyTransport(
        room_url=daily_room_url,
        participant_id="user_b",
        audio_in=True,
        audio_out=False  # Only listening to User B
    ),
    
    # 2. Speech Recognition + Translation
    GeminiMultimodalLiveProcessor(
        input_language="es",  # User B's language
        output_language="en", # User A's language
        mode="speech_to_speech"
    ),
    
    # 3. Audio Output Transport
    DailyTransport(
        room_url=daily_room_url,
        participant_id="user_a",
        audio_in=False,  # Only sending to User A
        audio_out=True
    )
])
```

## 🎙️ Audio Transport Architecture

### Daily.co WebRTC Integration

```python
class DualTransportManager:
    def __init__(self, room_url: str, session_config: SessionConfig):
        self.room_url = room_url
        self.session_config = session_config
        
        # Create separate transports for each user
        self.transport_a = DailyTransport(
            room_url=room_url,
            participant_id=f"user_a_{session_config.session_id}",
            audio_in=True,   # Receives User A's audio
            audio_out=True,  # Sends translated audio to User A
        )
        
        self.transport_b = DailyTransport(
            room_url=room_url,
            participant_id=f"user_b_{session_config.session_id}",
            audio_in=True,   # Receives User B's audio
            audio_out=True,  # Sends translated audio to User B
        )
    
    async def setup_audio_routing(self):
        """Configure audio routing for bidirectional translation"""
        
        # User A's audio goes to Pipeline A
        await self.transport_a.set_audio_in_enabled(True)
        await self.transport_a.set_participant_audio_enabled("user_a", True)
        await self.transport_a.set_participant_audio_enabled("user_b", False)
        
        # User B's audio goes to Pipeline B
        await self.transport_b.set_audio_in_enabled(True)
        await self.transport_b.set_participant_audio_enabled("user_b", True)
        await self.transport_b.set_participant_audio_enabled("user_a", False)
```

## 🧠 Gemini Multimodal Live API Integration

### Speech-to-Speech Translation

```python
class GeminiTranslationProcessor(FrameProcessor):
    def __init__(self, input_lang: str, output_lang: str):
        super().__init__()
        self.input_lang = input_lang
        self.output_lang = output_lang
        self.gemini_client = GeminiMultimodalLiveClient()
        
    async def process_frame(self, frame: AudioFrame) -> AudioFrame:
        """Process audio frame through Gemini Live API"""
        
        # 1. Send audio to Gemini for transcription
        transcript = await self.gemini_client.transcribe(
            audio_data=frame.audio,
            language=self.input_lang
        )
        
        # 2. Translate the transcript
        translation = await self.gemini_client.translate(
            text=transcript,
            source_lang=self.input_lang,
            target_lang=self.output_lang
        )
        
        # 3. Convert translation to speech
        translated_audio = await self.gemini_client.text_to_speech(
            text=translation,
            language=self.output_lang,
            voice_config=self.get_voice_config()
        )
        
        # 4. Return translated audio frame
        return AudioFrame(
            audio=translated_audio,
            sample_rate=frame.sample_rate,
            channels=frame.channels
        )
```

## 🔄 Session Management

### Session State Architecture

```python
class TranslationSession:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.user_a: Optional[User] = None
        self.user_b: Optional[User] = None
        self.pipeline_a: Optional[Pipeline] = None
        self.pipeline_b: Optional[Pipeline] = None
        self.daily_room: Optional[DailyRoom] = None
        self.status: SessionStatus = SessionStatus.WAITING
        
    async def start_translation(self):
        """Start both translation pipelines"""
        if not self.user_a or not self.user_b:
            raise ValueError("Both users must be present")
            
        # Create Daily.co room
        self.daily_room = await self.create_daily_room()
        
        # Initialize pipelines
        self.pipeline_a = await self.create_pipeline_a()
        self.pipeline_b = await self.create_pipeline_b()
        
        # Start both pipelines concurrently
        await asyncio.gather(
            self.pipeline_a.start(),
            self.pipeline_b.start()
        )
        
        self.status = SessionStatus.ACTIVE
```

## 🚀 Performance Optimizations

### Latency Reduction Strategies

1. **Concurrent Processing**: Both pipelines run simultaneously
2. **Streaming Translation**: Process audio chunks in real-time
3. **Connection Pooling**: Reuse Gemini API connections
4. **Audio Buffering**: Minimize audio drops during translation
5. **Predictive Caching**: Cache common translations

### Resource Management

```python
class ResourceManager:
    def __init__(self):
        self.gemini_pool = GeminiConnectionPool(max_connections=10)
        self.daily_rooms = DailyRoomManager()
        self.pipeline_cache = PipelineCache()
        
    async def optimize_pipeline(self, pipeline: Pipeline):
        """Apply performance optimizations"""
        
        # 1. Configure audio buffer sizes
        await pipeline.set_audio_buffer_size(1024)  # Low latency
        
        # 2. Enable streaming mode
        await pipeline.set_streaming_enabled(True)
        
        # 3. Configure parallel processing
        await pipeline.set_parallel_processing(True)
        
        # 4. Set quality vs speed trade-offs
        await pipeline.set_quality_mode("balanced")
```

## 🔐 Security Architecture

### Authentication Flow

```python
class AuthenticationManager:
    def __init__(self):
        self.jwt_secret = os.getenv("JWT_SECRET")
        self.token_expiry = timedelta(hours=24)
        
    async def authenticate_session(self, token: str) -> User:
        """Authenticate user for translation session"""
        
        # 1. Validate JWT token
        payload = jwt.decode(token, self.jwt_secret, algorithms=["HS256"])
        
        # 2. Check user permissions
        user = await self.get_user(payload["user_id"])
        if not user.can_use_translation:
            raise PermissionError("User not authorized for translation")
            
        # 3. Generate session-specific token
        session_token = await self.create_session_token(user)
        
        return user, session_token
```

### Daily.co Security

```python
async def create_secure_daily_room(session_id: str) -> DailyRoom:
    """Create Daily.co room with security configurations"""
    
    room_config = {
        "name": f"translation_{session_id}",
        "privacy": "private",
        "properties": {
            "max_participants": 2,  # Only 2 users allowed
            "enable_chat": False,   # Disable chat
            "enable_screenshare": False,  # Disable screenshare
            "start_audio_off": False,  # Audio enabled by default
            "start_video_off": True,   # Video disabled
            "exp": int(time.time()) + 3600,  # 1 hour expiry
            "enable_recording": False,  # No recording
            "enable_transcription": False,  # No transcription
        }
    }
    
    return await daily_client.create_room(room_config)
```

## 📊 Monitoring & Observability

### Metrics Collection

```python
class TranslationMetrics:
    def __init__(self):
        self.latency_histogram = Histogram(
            "translation_latency_seconds",
            "Translation latency in seconds",
            buckets=[0.1, 0.5, 1.0, 2.0, 5.0]
        )
        
        self.accuracy_gauge = Gauge(
            "translation_accuracy",
            "Translation accuracy score"
        )
        
        self.active_sessions = Gauge(
            "active_translation_sessions",
            "Number of active translation sessions"
        )
    
    async def record_translation(self, latency: float, accuracy: float):
        """Record translation metrics"""
        self.latency_histogram.observe(latency)
        self.accuracy_gauge.set(accuracy)
```

### Health Checks

```python
class HealthChecker:
    async def check_pipeline_health(self, pipeline: Pipeline) -> bool:
        """Check if translation pipeline is healthy"""
        
        try:
            # 1. Check Gemini API connectivity
            await self.gemini_client.health_check()
            
            # 2. Check Daily.co connectivity
            await self.daily_client.health_check()
            
            # 3. Check pipeline processing
            test_frame = AudioFrame.create_silence(1.0)
            result = await pipeline.process_frame(test_frame)
            
            return result is not None
            
        except Exception as e:
            logger.error(f"Pipeline health check failed: {e}")
            return False
```

## 🔧 Error Handling & Recovery

### Graceful Degradation

```python
class ErrorHandler:
    async def handle_translation_error(self, error: Exception, context: dict):
        """Handle translation errors with graceful degradation"""
        
        if isinstance(error, GeminiAPIError):
            # Fallback to backup translation service
            await self.fallback_to_backup_translator(context)
            
        elif isinstance(error, DailyTransportError):
            # Reconnect to Daily.co room
            await self.reconnect_daily_transport(context)
            
        elif isinstance(error, AudioProcessingError):
            # Skip problematic audio frame
            logger.warning(f"Skipping audio frame due to error: {error}")
            
        else:
            # Log unknown error and continue
            logger.error(f"Unknown translation error: {error}")
```

This architecture provides a robust, scalable, and maintainable solution for real-time bidirectional translation using the exact technology stack you specified.
