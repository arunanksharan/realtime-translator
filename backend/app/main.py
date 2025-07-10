"""
Main FastAPI application
"""
import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
import uvicorn

from app.core.config import settings
from app.database import create_tables
from app.services.translation_service import translation_service
from app.services.websocket_service import websocket_manager
from app.api.auth import router as auth_router
from app.api.sessions import router as sessions_router

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    
    # Startup
    logger.info("Starting Realtime Translator API")
    
    try:
        # Create database tables
        await create_tables()
        logger.info("Database tables created/verified")
        
        # Start translation service
        await translation_service.start()
        logger.info("Translation service started")
        
        yield
        
    except Exception as e:
        logger.error(f"Startup error: {e}")
        raise
    finally:
        # Shutdown
        logger.info("Shutting down Realtime Translator API")
        
        try:
            # Stop translation service
            await translation_service.stop()
            logger.info("Translation service stopped")
            
        except Exception as e:
            logger.error(f"Shutdown error: {e}")

# Create FastAPI app
app = FastAPI(
    title="Realtime Language Translator",
    description="Production-grade real-time bidirectional language translator API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/openapi.json" if settings.debug else None,
)

# Add CORS middleware FIRST - before any routes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Add trusted host middleware
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["*"] if settings.debug else ["localhost", "127.0.0.1"]
)

# Include routers AFTER middleware
app.include_router(auth_router, prefix="/api/v1")
app.include_router(sessions_router, prefix="/api/v1")

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler"""
    logger.error(f"Global exception: {exc}", exc_info=True)
    
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "message": "An unexpected error occurred" if not settings.debug else str(exc)
        }
    )

# Health check endpoints
@app.get("/health", tags=["health"])
async def health_check():
    """Basic health check"""
    return {"status": "healthy", "service": "realtime-translator"}

@app.get("/health/detailed", tags=["health"])
async def detailed_health_check():
    """Detailed health check including dependencies"""
    
    try:
        health_status = await translation_service.health_check()
        
        return {
            "status": "healthy" if health_status["service_healthy"] else "unhealthy",
            "service": "realtime-translator",
            "details": health_status
        }
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "service": "realtime-translator",
            "error": str(e)
        }

# Service statistics endpoint
@app.get("/stats", tags=["monitoring"])
async def get_service_stats():
    """Get service statistics"""
    
    try:
        stats = await translation_service.get_service_stats()
        return stats
        
    except Exception as e:
        logger.error(f"Failed to get service stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to get service statistics")

# Root endpoint
@app.get("/", tags=["root"])
async def root():
    """Root endpoint"""
    return {
        "message": "Realtime Language Translator API",
        "version": "1.0.0",
        "docs": "/docs" if settings.debug else None,
        "health": "/health",
        "api_prefix": "/api/v1"
    }

# WebSocket endpoint for real-time updates
@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint with comprehensive error handling"""
    
    logger.info(f"🔌 WebSocket connection attempt for session: {session_id}")
    
    try:
        # Accept connection first - required by ASGI spec
        await websocket.accept()
        logger.info(f"✅ WebSocket connection accepted for session {session_id}")
        
        # Then verify session exists
        logger.info(f"🔍 Checking session status for: {session_id}")
        session_status = await translation_service.get_session_status(session_id)
        
        if not session_status:
            logger.error(f"❌ Session {session_id} not found in database")
            await websocket.send_json({
                "type": "error",
                "error": "Session not found",
                "session_id": session_id
            })
            await websocket.close(code=4004, reason="Session not found")
            return
        
        logger.info(f"✅ Session {session_id} found with status: {session_status.get('status')}")
        
        # Connect to WebSocket manager
        await websocket_manager.connect(websocket, session_id)
        logger.info(f"📡 WebSocket manager connected for session {session_id}")
        
        # Send initial status
        await websocket.send_json({
            "type": "session_status",
            "data": session_status
        })
        logger.info(f"📤 Initial status sent for session {session_id}")
        
        # Keep connection alive and handle messages
        while True:
            try:
                # Wait for messages or timeout
                message = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                logger.debug(f"📨 Received WebSocket message: {message}")
                
                # Update ping time
                await websocket_manager.ping_connection(websocket)
                
                # Handle different message types
                if message == "ping":
                    await websocket.send_text("pong")
                elif message == "get_status":
                    current_status = await translation_service.get_session_status(session_id)
                    if current_status:
                        await websocket.send_json({
                            "type": "session_status",
                            "data": current_status
                        })
                    else:
                        await websocket.send_json({
                            "type": "error",
                            "error": "Session no longer exists"
                        })
                        break
                elif message == "get_metrics":
                    metrics = await translation_service.get_session_metrics(session_id)
                    await websocket.send_json({
                        "type": "session_metrics",
                        "data": metrics
                    })
                elif message == "get_participants":
                    participants = await websocket_manager.get_session_participants(session_id)
                    await websocket.send_json({
                        "type": "participants",
                        "data": participants
                    })
                    
            except asyncio.TimeoutError:
                # Send periodic status updates
                current_status = await translation_service.get_session_status(session_id)
                if current_status:
                    await websocket.send_json({
                        "type": "session_status", 
                        "data": current_status
                    })
                else:
                    logger.warning(f"⚠️ Session {session_id} no longer exists, closing WebSocket")
                    await websocket.close(code=4004, reason="Session no longer exists")
                    break
                    
            except WebSocketDisconnect:
                logger.info(f"🔌 WebSocket disconnected for session {session_id}")
                break
                
    except Exception as e:
        logger.error(f"💥 WebSocket error for session {session_id}: {e}")
        import traceback
        logger.error(f"📍 Traceback: {traceback.format_exc()}")
        
        try:
            # Only try to send/close if we have an active connection
            await websocket.send_json({
                "type": "error",
                "error": "Internal server error",
                "message": str(e)
            })
            await websocket.close(code=4000, reason="Internal server error")
        except Exception as close_error:
            logger.error(f"❌ Error during WebSocket cleanup: {close_error}")
    finally:
        # Clean up connection
        try:
            await websocket_manager.disconnect(websocket)
            logger.info(f"🧹 WebSocket cleanup completed for session {session_id}")
        except Exception as e:
            logger.error(f"❌ WebSocket cleanup error: {e}")

# Custom OpenAPI schema
def custom_openapi():
    """Custom OpenAPI schema with additional information"""
    if app.openapi_schema:
        return app.openapi_schema
    
    openapi_schema = get_openapi(
        title="Realtime Language Translator API",
        version="1.0.0",
        description="""
        ## Real-time Bidirectional Language Translation API
        
        This API provides real-time bidirectional translation between users speaking different languages.
        
        ### Features:
        - **Real-time Translation**: Uses Google Gemini Multimodal Live API for instant translation
        - **Bidirectional**: Supports simultaneous translation in both directions
        - **WebRTC Audio**: High-quality audio streaming via Daily.co
        - **Session Management**: Complete session lifecycle management
        - **Authentication**: JWT-based authentication system
        - **Monitoring**: Health checks and metrics endpoints
        
        ### Architecture:
        - **Dual Pipeline System**: Separate translation pipelines for each direction
        - **Audio Isolation**: Prevents feedback and ensures clean audio routing
        - **Production Ready**: Scalable architecture with proper error handling
        
        ### Supported Languages:
        - English (en)
        - Spanish (es)
        - French (fr)
        - German (de)
        - Italian (it)
        - Portuguese (pt)
        - Japanese (ja)
        - Korean (ko)
        - Chinese (zh)
        - And many more...
        
        ### Usage Flow:
        1. **Register/Login** - Create account and get JWT token
        2. **Create Session** - Create translation session with language pair
        3. **Join Session** - Second user joins the session
        4. **Start Translation** - Begin real-time translation
        5. **Get Tokens** - Get Daily.co room tokens for WebRTC connection
        6. **Connect Audio** - Users connect to Daily.co room for audio
        7. **Translate** - Real-time bidirectional translation begins
        8. **Stop Session** - End translation session
        
        ### WebSocket Updates:
        Connect to `/ws/{session_id}` for real-time session status updates.
        """,
        routes=app.routes,
    )
    
    # Add custom tags
    openapi_schema["tags"] = [
        {
            "name": "authentication",
            "description": "User authentication and authorization"
        },
        {
            "name": "sessions",
            "description": "Translation session management"
        },
        {
            "name": "health",
            "description": "Health check and monitoring endpoints"
        },
        {
            "name": "monitoring",
            "description": "Service monitoring and statistics"
        },
        {
            "name": "root",
            "description": "Root and information endpoints"
        }
    ]
    
    # Add server information
    openapi_schema["servers"] = [
        {
            "url": "http://localhost:8000",
            "description": "Development server"
        },
        {
            "url": "https://api.translator.example.com",
            "description": "Production server"
        }
    ]
    
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi

# Development server
if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
        access_log=settings.debug
    )
