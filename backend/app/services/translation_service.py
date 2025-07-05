"""
Main translation service for managing sessions and coordinating pipelines
"""
import asyncio
import uuid
import logging
import secrets
import string
import jwt
from typing import Dict, Optional, List
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from sqlalchemy.orm import selectinload

from app.models import TranslationSession, SessionStatus, User, SessionMetrics
from app.services.pipeline_manager_simple import DualPipelineManager, TranslationConfig
from app.services.daily_service import DailyService
from app.database import get_async_session
from app.core.config import settings

logger = logging.getLogger(__name__)

class TranslationService:
    """Service for managing translation sessions and coordinating all components"""
    
    def __init__(self):
        self.active_sessions: Dict[str, DualPipelineManager] = {}
        self.daily_service = DailyService()
        self.cleanup_task: Optional[asyncio.Task] = None
        self.is_running = False
        
    async def start(self):
        """Start the translation service"""
        if self.is_running:
            return
            
        # Start background cleanup task
        self.cleanup_task = asyncio.create_task(self._cleanup_loop())
        self.is_running = True
        logger.info("Translation service started")
        
    async def stop(self):
        """Stop the translation service"""
        if not self.is_running:
            return
            
        # Cancel cleanup task
        if self.cleanup_task:
            self.cleanup_task.cancel()
            try:
                await self.cleanup_task
            except asyncio.CancelledError:
                pass
                
        # Stop all active sessions
        for session_id in list(self.active_sessions.keys()):
            try:
                await self.stop_session(session_id)
            except Exception as e:
                logger.error(f"Error stopping session {session_id}: {e}")
                
        self.is_running = False
        logger.info("Translation service stopped")
        
    async def create_session(
        self,
        user_a_id: str,
        language_a: str,
        language_b: str,
        user_b_id: Optional[str] = None
    ) -> TranslationSession:
        """Create a new translation session"""
        
        session_id = str(uuid.uuid4())
        
        async with get_async_session() as db:
            # Validate users exist
            user_a = await db.get(User, user_a_id)
            if not user_a:
                raise ValueError(f"User A {user_a_id} not found")
                
            if user_b_id:
                user_b = await db.get(User, user_b_id)
                if not user_b:
                    raise ValueError(f"User B {user_b_id} not found")
                    
            # Create Daily.co room
            room_response = await self.daily_service.create_room(
                name=f"translation_{session_id}",
                properties={
                    "max_participants": 4,  # 2 users + 2 bots
                    "exp": int((datetime.now() + timedelta(hours=2)).timestamp()),
                    "enable_screenshare": False,
                    "enable_chat": False,
                    "start_audio_off": False,
                    "start_video_off": True,
                    "enable_recording": False,
                    "enable_transcription": False,
                    "enable_network_ui": False,
                    "enable_prejoin_ui": False,
                    "autojoin": True
                }
            )
            
            room_url = room_response["url"]
            room_name = room_response["name"]
            
            # Create database record
            session = TranslationSession(
                id=session_id,
                user_a_id=user_a_id,
                user_b_id=user_b_id,
                language_a=language_a,
                language_b=language_b,
                room_url=room_url,
                room_name=room_name,
                status=SessionStatus.CREATED,
                created_at=datetime.now(),
                expires_at=datetime.now() + timedelta(hours=2)
            )
            
            db.add(session)
            await db.commit()
            await db.refresh(session)
            
            logger.info(f"Created translation session {session_id} for {language_a}↔{language_b}")
            return session
            
    async def join_session(self, session_id: str, user_b_id: str) -> bool:
        """Allow user B to join an existing session"""
        
        async with get_async_session() as db:
            # Get session
            session = await db.get(TranslationSession, session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")
                
            if session.user_b_id:
                raise ValueError(f"Session {session_id} already has user B")
                
            if session.status != SessionStatus.CREATED:
                raise ValueError(f"Session {session_id} is not in CREATED status")
                
            # Validate user B exists
            user_b = await db.get(User, user_b_id)
            if not user_b:
                raise ValueError(f"User B {user_b_id} not found")
                
            # Update session
            session.user_b_id = user_b_id
            session.status = SessionStatus.WAITING
            await db.commit()
            
            # Broadcast session status update
            try:
                from app.services.websocket_service import websocket_manager
                await websocket_manager.broadcast_session_status(session_id, {
                    "session_id": session_id,
                    "status": SessionStatus.WAITING.value,
                    "user_b_id": user_b_id,
                    "message": f"User {user_b_id} joined the session"
                })
            except Exception as e:
                logger.warning(f"Failed to broadcast session update: {e}")
            
            logger.info(f"User B {user_b_id} joined session {session_id}")
            return True
            
    async def start_session(self, session_id: str) -> bool:
        """Start translation for a session"""
        
        if session_id in self.active_sessions:
            logger.warning(f"Session {session_id} already active")
            return True
            
        async with get_async_session() as db:
            # Get session with relationships
            stmt = select(TranslationSession).options(
                selectinload(TranslationSession.user_a),
                selectinload(TranslationSession.user_b)
            ).where(TranslationSession.id == session_id)
            
            result = await db.execute(stmt)
            session = result.scalar_one_or_none()
            
            if not session:
                raise ValueError(f"Session {session_id} not found")
                
            if not session.user_b_id:
                raise ValueError(f"Session {session_id} missing user B")
                
            if session.status not in [SessionStatus.CREATED, SessionStatus.WAITING]:
                raise ValueError(f"Session {session_id} cannot be started from status {session.status}")
                
            # Create translation configuration
            config = TranslationConfig(
                session_id=session_id,
                room_url=session.room_url,
                language_a=session.language_a,
                language_b=session.language_b,
                user_a_id=session.user_a_id,
                user_b_id=session.user_b_id,
                gemini_multimodal_live_api_key=settings.gemini_multimodal_live_api_key
            )
            
            # Create and initialize pipeline manager
            try:
                pipeline_manager = DualPipelineManager(config)
                await pipeline_manager.initialize()
                
                # Start pipelines
                await pipeline_manager.start()
                
                # Store active session
                self.active_sessions[session_id] = pipeline_manager
                
                # Update database status
                session.status = SessionStatus.ACTIVE
                session.started_at = datetime.now()
                await db.commit()
                
                # Broadcast session status update
                try:
                    from app.services.websocket_service import websocket_manager
                    await websocket_manager.broadcast_session_status(session_id, {
                        "session_id": session_id,
                        "status": SessionStatus.ACTIVE.value,
                        "started_at": session.started_at.isoformat(),
                        "message": "Translation started"
                    })
                except Exception as e:
                    logger.warning(f"Failed to broadcast session update: {e}")
                
                # Initialize metrics
                metrics = SessionMetrics(
                    session_id=session_id,
                    total_translations=0,
                    session_duration_ms=0
                )
                db.add(metrics)
                await db.commit()
                
                logger.info(f"Started translation session {session_id}")
                return True
                
            except Exception as e:
                logger.error(f"Failed to start session {session_id}: {e}")
                
                # Update session status to failed
                session.status = SessionStatus.FAILED
                session.error_message = str(e)
                await db.commit()
                
                # Cleanup pipeline manager if created
                if session_id in self.active_sessions:
                    try:
                        await self.active_sessions[session_id].cleanup()
                        del self.active_sessions[session_id]
                    except Exception as cleanup_error:
                        logger.error(f"Error cleaning up failed session: {cleanup_error}")
                        
                return False
                
    async def stop_session(self, session_id: str) -> bool:
        """Stop translation for a session"""
        
        if session_id not in self.active_sessions:
            logger.warning(f"Session {session_id} not active")
            return True
            
        pipeline_manager = self.active_sessions[session_id]
        
        try:
            # Get session metrics before stopping
            metrics = await pipeline_manager.get_metrics()
            
            # Stop pipeline manager
            await pipeline_manager.stop()
            del self.active_sessions[session_id]
            
            # Update database
            async with get_async_session() as db:
                session = await db.get(TranslationSession, session_id)
                if session:
                    session.status = SessionStatus.COMPLETED
                    session.ended_at = datetime.now()
                    
                    # Update metrics
                    session_metrics = await db.get(SessionMetrics, session_id)
                    if session_metrics:
                        session_metrics.total_translations = metrics.get("total_translations", 0)
                        if session.started_at:
                            duration = (datetime.now() - session.started_at).total_seconds() * 1000
                            session_metrics.session_duration_ms = int(duration)
                            
                    await db.commit()
                    
            # Clean up Daily.co room
            try:
                await self.daily_service.delete_room(session.room_name)
            except Exception as e:
                logger.warning(f"Failed to delete Daily.co room: {e}")
                
            logger.info(f"Stopped translation session {session_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to stop session {session_id}: {e}")
            return False
            
    async def get_session_status(self, session_id: str) -> Optional[Dict[str, any]]:
        """Get comprehensive status of a translation session"""
        
        async with get_async_session() as db:
            session = await db.get(TranslationSession, session_id)
            if not session:
                return None
                
            status = {
                "session_id": session_id,
                "status": session.status.value,
                "language_a": session.language_a,
                "language_b": session.language_b,
                "user_a_id": session.user_a_id,
                "user_b_id": session.user_b_id,
                "room_url": session.room_url,
                "created_at": session.created_at.isoformat(),
                "started_at": session.started_at.isoformat() if session.started_at else None,
                "ended_at": session.ended_at.isoformat() if session.ended_at else None,
                "expires_at": session.expires_at.isoformat() if session.expires_at else None,
                "error_message": session.error_message,
                "pipeline_status": None
            }
            
            # Add pipeline status if session is active
            if session_id in self.active_sessions:
                pipeline_manager = self.active_sessions[session_id]
                status["pipeline_status"] = await pipeline_manager.get_status()
                
            return status
            
    async def get_user_tokens(self, session_id: str, user_id: str) -> Dict[str, str]:
        """Get Daily.co tokens for user to join session"""
        
        async with get_async_session() as db:
            session = await db.get(TranslationSession, session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")
                
            if user_id not in [session.user_a_id, session.user_b_id]:
                raise ValueError(f"User {user_id} not authorized for session {session_id}")
                
            if session.status == SessionStatus.EXPIRED:
                raise ValueError(f"Session {session_id} has expired")
                
        # Create user token
        user_token = await self.daily_service.create_token(
            room_name=session.room_name,
            user_name=user_id,
            is_owner=False,
            exp_time=7200,  # 2 hours
            properties={
                "enable_recording": False,
                "enable_transcription": False,
                "enable_chat": False,
                "enable_screenshare": False
            }
        )
        
        return {
            "room_url": session.room_url,
            "token": user_token,
            "user_id": user_id,
            "session_id": session_id
        }
        
    async def list_user_sessions(self, user_id: str, limit: int = 10) -> List[Dict[str, any]]:
        """List sessions for a user"""
        
        async with get_async_session() as db:
            stmt = select(TranslationSession).where(
                (TranslationSession.user_a_id == user_id) |
                (TranslationSession.user_b_id == user_id)
            ).order_by(TranslationSession.created_at.desc()).limit(limit)
            
            result = await db.execute(stmt)
            sessions = result.scalars().all()
            
            return [
                {
                    "session_id": session.id,
                    "status": session.status.value,
                    "language_a": session.language_a,
                    "language_b": session.language_b,
                    "created_at": session.created_at.isoformat(),
                    "started_at": session.started_at.isoformat() if session.started_at else None,
                    "ended_at": session.ended_at.isoformat() if session.ended_at else None,
                    "is_user_a": session.user_a_id == user_id
                }
                for session in sessions
            ]
            
    async def get_session_metrics(self, session_id: str) -> Optional[Dict[str, any]]:
        """Get detailed metrics for a session"""
        
        async with get_async_session() as db:
            session_metrics = await db.get(SessionMetrics, session_id)
            if not session_metrics:
                return None
                
            metrics = {
                "session_id": session_id,
                "total_translations": session_metrics.total_translations,
                "session_duration_ms": session_metrics.session_duration_ms,
                "avg_latency_ms": session_metrics.avg_latency_ms,
                "max_latency_ms": session_metrics.max_latency_ms,
                "min_latency_ms": session_metrics.min_latency_ms,
                "avg_confidence_score": session_metrics.avg_confidence_score,
                "error_count": session_metrics.error_count,
                "reconnection_count": session_metrics.reconnection_count,
                "total_audio_duration_ms": session_metrics.total_audio_duration_ms
            }
            
            # Add real-time metrics if session is active
            if session_id in self.active_sessions:
                pipeline_manager = self.active_sessions[session_id]
                real_time_metrics = await pipeline_manager.get_metrics()
                metrics.update(real_time_metrics)
                
            return metrics
            
    async def health_check(self) -> Dict[str, any]:
        """Perform health check on the translation service"""
        
        health = {
            "service_healthy": True,
            "active_sessions": len(self.active_sessions),
            "daily_service_healthy": False,
            "database_healthy": False,
            "pipeline_health": {}
        }
        
        # Check Daily.co service
        try:
            health["daily_service_healthy"] = await self.daily_service.health_check()
        except Exception as e:
            logger.error(f"Daily.co health check failed: {e}")
            health["service_healthy"] = False
            
        # Check database
        try:
            async with get_async_session() as db:
                await db.execute(select(1))
                health["database_healthy"] = True
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            health["service_healthy"] = False
            
        # Check active pipelines
        for session_id, pipeline_manager in self.active_sessions.items():
            try:
                pipeline_health = await pipeline_manager.health_check()
                health["pipeline_health"][session_id] = pipeline_health
                
                if not pipeline_health.get("overall_healthy", False):
                    health["service_healthy"] = False
                    
            except Exception as e:
                logger.error(f"Pipeline health check failed for {session_id}: {e}")
                health["pipeline_health"][session_id] = {"overall_healthy": False}
                health["service_healthy"] = False
                
        return health
        
    async def _cleanup_loop(self):
        """Background task to cleanup expired sessions"""
        
        while True:
            try:
                await asyncio.sleep(settings.cleanup_interval_minutes * 60)
                await self._cleanup_expired_sessions()
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in cleanup loop: {e}")
                
    async def _cleanup_expired_sessions(self):
        """Clean up expired sessions"""
        
        expired_sessions = []
        current_time = datetime.now()
        
        async with get_async_session() as db:
            # Find expired sessions
            stmt = select(TranslationSession).where(
                TranslationSession.expires_at < current_time,
                TranslationSession.status.in_([SessionStatus.CREATED, SessionStatus.WAITING, SessionStatus.ACTIVE])
            )
            
            result = await db.execute(stmt)
            sessions = result.scalars().all()
            
            for session in sessions:
                expired_sessions.append(session.id)
                
                # Update status to expired
                session.status = SessionStatus.EXPIRED
                session.ended_at = current_time
                
            await db.commit()
            
        # Stop active expired sessions
        for session_id in expired_sessions:
            if session_id in self.active_sessions:
                try:
                    await self.stop_session(session_id)
                    logger.info(f"Cleaned up expired session {session_id}")
                except Exception as e:
                    logger.error(f"Error cleaning up expired session {session_id}: {e}")
                    
        if expired_sessions:
            logger.info(f"Cleaned up {len(expired_sessions)} expired sessions")
            
    async def get_service_stats(self) -> Dict[str, any]:
        """Get overall service statistics"""
        
        async with get_async_session() as db:
            # Count sessions by status
            stmt = select(
                TranslationSession.status,
                db.func.count(TranslationSession.id).label("count")
            ).group_by(TranslationSession.status)
            
            result = await db.execute(stmt)
            status_counts = {row.status.value: row.count for row in result}
            
            # Get total metrics
            total_sessions = sum(status_counts.values())
            
            return {
                "total_sessions": total_sessions,
                "active_sessions": len(self.active_sessions),
                "status_counts": status_counts,
                "is_running": self.is_running,
                "max_concurrent_sessions": settings.max_translation_sessions
            }

    async def generate_invite_code(self, session_id: str) -> str:
        """Generate a 6-digit invite code for session"""
        
        # Generate 6-digit alphanumeric code (excluding confusing characters)
        alphabet = string.ascii_uppercase + string.digits
        alphabet = alphabet.replace('0', '').replace('O', '').replace('I', '').replace('1')
        invite_code = ''.join(secrets.choice(alphabet) for _ in range(6))
        
        # Store in database
        async with get_async_session() as db:
            session = await db.get(TranslationSession, session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")
                
            session.invite_code = invite_code
            session.invite_expires_at = datetime.utcnow() + timedelta(hours=24)
            await db.commit()
            
        logger.info(f"Generated invite code {invite_code} for session {session_id}")
        return invite_code
        
    async def generate_share_token(self, session_id: str, expires_hours: int = 4) -> str:
        """Generate a JWT share token for session"""
        
        payload = {
            "session_id": session_id,
            "type": "share_token",
            "exp": datetime.utcnow() + timedelta(hours=expires_hours),
            "iat": datetime.utcnow()
        }
        
        token = jwt.encode(payload, settings.jwt_secret, algorithm="HS256")
        
        # Store in database
        async with get_async_session() as db:
            session = await db.get(TranslationSession, session_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")
                
            session.guest_access_token = token
            await db.commit()
            
        logger.info(f"Generated share token for session {session_id}")
        return token
        
    async def join_by_invite_code(self, invite_code: str, user_id: str) -> str:
        """Join session using invite code"""
        
        async with get_async_session() as db:
            stmt = select(TranslationSession).where(
                TranslationSession.invite_code == invite_code,
                TranslationSession.invite_expires_at > datetime.utcnow()
            )
            
            result = await db.execute(stmt)
            session = result.scalar_one_or_none()
            
            if not session:
                raise ValueError("Invalid or expired invite code")
                
            if session.user_b_id:
                raise ValueError("Session already has a second user")
                
            # Join the session
            success = await self.join_session(session.id, user_id)
            if not success:
                raise ValueError("Failed to join session")
                
            return session.id
            
    async def validate_share_token(self, token: str) -> Optional[str]:
        """Validate share token and return session ID"""
        
        try:
            payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
            session_id = payload.get("session_id")
            
            if not session_id or payload.get("type") != "share_token":
                return None
                
            # Check if session exists and token matches
            async with get_async_session() as db:
                session = await db.get(TranslationSession, session_id)
                if not session or session.guest_access_token != token:
                    return None
                    
            return session_id
            
        except jwt.InvalidTokenError:
            return None

# Global service instance
translation_service = TranslationService()
