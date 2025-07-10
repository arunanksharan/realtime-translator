"""
Database health check and cleanup script
"""
import asyncio
import logging
import sys
import os

# Add parent directory to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta
from sqlalchemy import select, update, delete
from app.database import get_async_session
from app.models import User, TranslationSession, SessionStatus

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def health_check_and_cleanup():
    """Comprehensive database health check and cleanup"""
    
    async with get_async_session() as db:
        try:
            # 1. Check users
            users = await db.execute(select(User))
            user_list = users.scalars().all()
            logger.info(f"👥 Users in database: {len(user_list)}")
            
            # 2. Check sessions by status
            sessions = await db.execute(select(TranslationSession))
            session_list = sessions.scalars().all()
            
            status_counts = {}
            for session in session_list:
                status = session.status.value
                status_counts[status] = status_counts.get(status, 0) + 1
            
            logger.info(f"📊 Session status counts: {status_counts}")
            
            # 3. Clean up truly expired sessions (older than 24 hours)
            cleanup_time = datetime.now() - timedelta(hours=24)
            cleanup_result = await db.execute(
                delete(TranslationSession).where(
                    TranslationSession.created_at < cleanup_time,
                    TranslationSession.status == SessionStatus.EXPIRED
                )
            )
            
            await db.commit()
            logger.info(f"🧹 Cleaned up {cleanup_result.rowcount} old expired sessions")
            
            # 4. Update sessions that should be expired but aren't
            current_time = datetime.now()
            expire_result = await db.execute(
                update(TranslationSession)
                .where(
                    TranslationSession.expires_at < current_time,
                    TranslationSession.status.in_([
                        SessionStatus.CREATED, 
                        SessionStatus.WAITING, 
                        SessionStatus.ACTIVE
                    ])
                )
                .values(
                    status=SessionStatus.EXPIRED,
                    ended_at=current_time
                )
            )
            
            await db.commit()
            logger.info(f"⏰ Expired {expire_result.rowcount} overdue sessions")
            
            logger.info("✅ Database health check completed successfully")
            
        except Exception as e:
            logger.error(f"❌ Database health check failed: {e}")
            await db.rollback()
            raise

if __name__ == "__main__":
    asyncio.run(health_check_and_cleanup())