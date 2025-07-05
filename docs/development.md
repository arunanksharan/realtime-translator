# Development Guide

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- Docker & Docker Compose (optional)

### 1. Clone and Setup

```bash
cd /Users/paruljuniwal/kuzushi_labs/mcp-servers/realtime-translator

# Backend setup
cd backend
poetry install
poetry shell
cp .env.example .env
# Edit .env with your credentials

# Frontend setup
cd ../frontend
npm install
cp .env.example .env.local
# Edit .env.local with your settings
```

### 2. Database Setup

```bash
# Create PostgreSQL database
createdb realtime_translator

# Run migrations (if using Alembic)
cd backend
alembic upgrade head
```

### 3. Environment Variables

#### Backend (.env)
```env
DATABASE_URL=postgresql://user:password@localhost/realtime_translator
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key-here
GOOGLE_API_KEY=your-google-api-key-here
DAILY_API_KEY=your-daily-api-key-here
DAILY_DOMAIN=your-daily-domain.daily.co
DEBUG=True
```

#### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
NEXT_PUBLIC_DAILY_DOMAIN=your-daily-domain.daily.co
```

### 4. Running the Application

#### Option A: Manual Setup
```bash
# Terminal 1: Redis
redis-server

# Terminal 2: PostgreSQL
postgres -D /usr/local/var/postgres

# Terminal 3: Backend
cd backend
poetry run uvicorn app.main:app --reload --port 8000

# Terminal 4: Frontend
cd frontend
npm run dev
```

#### Option B: Docker Compose
```bash
# Set environment variables
export GOOGLE_API_KEY=your-google-api-key-here
export DAILY_API_KEY=your-daily-api-key-here
export DAILY_DOMAIN=your-daily-domain.daily.co

# Start all services
docker-compose up -d
```

### 5. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

## 🔧 Development Workflow

### Backend Development

```bash
cd backend

# Install dependencies
poetry install

# Run tests
poetry run pytest

# Format code
poetry run black .
poetry run isort .

# Type checking
poetry run mypy .

# Run linting
poetry run flake8 .
```

### Frontend Development

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm run test

# Type checking
npm run type-check

# Linting
npm run lint

# Build for production
npm run build
```

## 📋 API Usage Examples

### 1. User Registration

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "username": "testuser",
    "password": "securepassword123",
    "full_name": "Test User",
    "preferred_language": "en"
  }'
```

### 2. User Login

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123"
  }'
```

### 3. Create Translation Session

```bash
curl -X POST http://localhost:8000/api/v1/sessions/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "language_a": "en",
    "language_b": "es"
  }'
```

### 4. Join Session

```bash
curl -X POST http://localhost:8000/api/v1/sessions/join \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "session_id": "session-uuid-here"
  }'
```

### 5. Start Translation

```bash
curl -X POST http://localhost:8000/api/v1/sessions/{session_id}/start \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 6. Get Session Token

```bash
curl -X GET http://localhost:8000/api/v1/sessions/{session_id}/token \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🔍 Debugging

### Backend Debugging

1. **Enable Debug Logging**:
   ```python
   # In .env
   LOG_LEVEL=DEBUG
   DEBUG=True
   ```

2. **Check Pipeline Status**:
   ```bash
   curl http://localhost:8000/api/v1/sessions/{session_id}/status
   ```

3. **Monitor Health**:
   ```bash
   curl http://localhost:8000/health/detailed
   ```

4. **View Logs**:
   ```bash
   docker-compose logs -f backend
   ```

### Frontend Debugging

1. **Enable Debug Mode**:
   ```bash
   npm run dev
   ```

2. **Check Network Requests**:
   - Open browser DevTools
   - Monitor Network tab for API calls
   - Check Console for errors

3. **React Query DevTools**:
   - Available in development mode
   - Shows query states and cache

### Common Issues

1. **Connection Issues**:
   - Check if all services are running
   - Verify environment variables
   - Test network connectivity

2. **Audio Issues**:
   - Check Daily.co credentials
   - Verify browser permissions
   - Test microphone access

3. **Translation Issues**:
   - Verify Google API key
   - Check Gemini API quotas
   - Monitor pipeline logs

## 🧪 Testing

### Backend Testing

```bash
cd backend

# Run all tests
poetry run pytest

# Run with coverage
poetry run pytest --cov=app --cov-report=html

# Run specific test file
poetry run pytest tests/test_translation_service.py

# Run integration tests
poetry run pytest tests/integration/
```

### Frontend Testing

```bash
cd frontend

# Run unit tests
npm run test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch

# Run e2e tests
npm run test:e2e
```

### Testing Translation Pipeline

```python
# Example test script
import asyncio
from app.services.pipeline_manager import DualPipelineManager, TranslationConfig

async def test_pipeline():
    config = TranslationConfig(
        session_id="test-session",
        room_url="https://test.daily.co/room",
        language_a="en",
        language_b="es",
        user_a_id="user-a",
        user_b_id="user-b",
        gemini_api_key="your-api-key"
    )
    
    manager = DualPipelineManager(config)
    await manager.initialize()
    
    # Test pipeline status
    status = await manager.get_status()
    print(f"Pipeline status: {status}")
    
    await manager.cleanup()

# Run test
asyncio.run(test_pipeline())
```

## 📦 Deployment

### Development Deployment

```bash
# Using Docker Compose
docker-compose up -d

# Check all services are healthy
docker-compose ps
```

### Production Deployment

1. **Environment Variables**:
   ```bash
   # Set production environment variables
   export DATABASE_URL=postgresql://user:pass@prod-db:5432/translator
   export REDIS_URL=redis://prod-redis:6379
   export JWT_SECRET=super-secure-production-secret
   export GOOGLE_API_KEY=production-google-key
   export DAILY_API_KEY=production-daily-key
   export DEBUG=False
   ```

2. **Build and Deploy**:
   ```bash
   # Build production images
   docker-compose -f docker-compose.prod.yml build
   
   # Deploy to production
   docker-compose -f docker-compose.prod.yml up -d
   ```

3. **Database Migration**:
   ```bash
   # Run migrations on production
   docker-compose exec backend alembic upgrade head
   ```

4. **Health Checks**:
   ```bash
   # Check application health
   curl https://your-domain.com/health/detailed
   ```

## 📊 Monitoring

### Application Metrics

```bash
# View service statistics
curl http://localhost:8000/stats

# View session metrics
curl http://localhost:8000/api/v1/sessions/{session_id}/metrics
```

### Logs

```bash
# View backend logs
docker-compose logs -f backend

# View frontend logs
docker-compose logs -f frontend

# View database logs
docker-compose logs -f postgres
```

### Performance Monitoring

1. **Translation Latency**:
   - Monitor pipeline processing times
   - Track Gemini API response times
   - Measure end-to-end latency

2. **Resource Usage**:
   - CPU and memory utilization
   - Database connection pool
   - Redis memory usage

3. **Error Rates**:
   - Translation failures
   - WebRTC connection issues
   - API error rates

## 🔒 Security Considerations

### Development Security

1. **Environment Variables**:
   - Never commit `.env` files
   - Use different secrets for development
   - Rotate API keys regularly

2. **Database Security**:
   - Use strong passwords
   - Enable SSL connections
   - Regular backups

3. **API Security**:
   - Validate all inputs
   - Rate limiting enabled
   - CORS properly configured

### Production Security

1. **HTTPS Only**:
   - All traffic encrypted
   - Secure cookies
   - HSTS headers

2. **Database Encryption**:
   - Encrypted at rest
   - Encrypted in transit
   - Regular security updates

3. **Access Control**:
   - Principle of least privilege
   - Regular access reviews
   - Multi-factor authentication

## 🐛 Troubleshooting

### Common Issues and Solutions

1. **Pipeline Won't Start**:
   ```bash
   # Check Gemini API key
   export GOOGLE_API_KEY=your-valid-key
   
   # Verify Daily.co credentials
   curl -H "Authorization: Bearer $DAILY_API_KEY" https://api.daily.co/v1/
   
   # Check database connection
   psql $DATABASE_URL -c "SELECT 1;"
   ```

2. **Audio Not Working**:
   ```javascript
   // Check browser permissions
   navigator.mediaDevices.getUserMedia({ audio: true })
     .then(stream => console.log('Audio permission granted'))
     .catch(err => console.error('Audio permission denied:', err));
   ```

3. **Translation Delays**:
   ```python
   # Check pipeline metrics
   metrics = await pipeline_manager.get_metrics()
   print(f"Average latency: {metrics['avg_latency_ms']}ms")
   ```

4. **Memory Issues**:
   ```bash
   # Monitor memory usage
   docker stats
   
   # Check for memory leaks
   docker-compose exec backend ps aux --sort=-%mem
   ```

### Getting Help

1. **Documentation**: Check the comprehensive documentation in `/docs`
2. **Logs**: Always check application logs first
3. **Health Checks**: Use `/health/detailed` endpoint
4. **Community**: Submit issues with detailed reproduction steps

## 📝 Code Style Guide

### Backend (Python)

```python
# Use type hints
async def create_session(user_id: str, config: TranslationConfig) -> TranslationSession:
    pass

# Use descriptive variable names
translation_pipeline_manager = DualPipelineManager(config)

# Add docstrings
async def process_audio_frame(self, frame: AudioFrame) -> Optional[AudioFrame]:
    """Process audio frame through translation pipeline.
    
    Args:
        frame: Input audio frame to translate
        
    Returns:
        Translated audio frame or None if processing failed
    """
    pass
```

### Frontend (TypeScript/React)

```typescript
// Use TypeScript interfaces
interface SessionState {
  sessionId: string;
  status: SessionStatus;
  isConnected: boolean;
}

// Use descriptive component names
const TranslationSessionDashboard: React.FC<Props> = ({ sessionId }) => {
  return <div>...</div>;
};

// Use custom hooks for logic
const useTranslationSession = (sessionId: string) => {
  // Hook logic here
};
```

This development guide provides comprehensive instructions for setting up, developing, testing, and deploying the realtime translator application. Follow these guidelines to ensure consistent and efficient development workflow.
