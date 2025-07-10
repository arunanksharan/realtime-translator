"""
API routes for translation sessions
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta

from app.services.translation_service import translation_service
from app.core.security import security
from app.core.config import settings
from app.database import get_db
from app.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["sessions"])
security_scheme = HTTPBearer()

class CreateSessionRequest(BaseModel):
    language_a: str = Field(..., description="Language code for user A (e.g., 'en', 'es', 'fr')")
    language_b: str = Field(..., description="Language code for user B (e.g., 'en', 'es', 'fr')")
    user_b_id: Optional[str] = Field(None, description="Optional user B ID if known")

class JoinSessionRequest(BaseModel):
    session_id: str = Field(..., description="Session ID to join")

class JoinByCodeRequest(BaseModel):
    invite_code: str = Field(..., description="6-digit invite code")

class ShareLinkRequest(BaseModel):
    expires_hours: int = Field(default=4, description="Hours until share link expires")

class InviteCodeResponse(BaseModel):
    invite_code: str
    expires_at: str

class ShareLinkResponse(BaseModel):
    share_link: str
    expires_at: str

class SessionResponse(BaseModel):
    session_id: str
    status: str
    language_a: str
    language_b: str
    user_a_id: str
    user_b_id: Optional[str]
    room_url: str
    created_at: str
    started_at: Optional[str]
    ended_at: Optional[str]
    expires_at: Optional[str]
    error_message: Optional[str]
    pipeline_status: Optional[Dict[str, Any]]
    is_token_access: Optional[bool] = False

class TokenResponse(BaseModel):
    room_url: str
    token: str
    user_id: str
    session_id: str

class SessionListResponse(BaseModel):
    sessions: List[Dict[str, Any]]
    total: int

# Dependency to get current user from JWT token
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security_scheme)) -> str:
    """Extract user ID from JWT token"""
    try:
        payload = security.verify_token(credentials.credentials)
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: no user ID",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return user_id
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

@router.post("/create", response_model=SessionResponse)
async def create_session(
    request: CreateSessionRequest,
    current_user: str = Depends(get_current_user)
):
    """Create a new translation session"""
    
    try:
        session = await translation_service.create_session(
            user_a_id=current_user,
            language_a=request.language_a,
            language_b=request.language_b,
            user_b_id=request.user_b_id
        )
        
        return SessionResponse(
            session_id=session.id,
            status=session.status.value,
            language_a=session.language_a,
            language_b=session.language_b,
            user_a_id=session.user_a_id,
            user_b_id=session.user_b_id,
            room_url=session.room_url,
            created_at=session.created_at.isoformat(),
            started_at=session.started_at.isoformat() if session.started_at else None,
            ended_at=session.ended_at.isoformat() if session.ended_at else None,
            expires_at=session.expires_at.isoformat() if session.expires_at else None,
            error_message=session.error_message,
            pipeline_status=None
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to create session: {str(e)}"
        )

@router.post("/{session_id}/invite-code", response_model=InviteCodeResponse)
async def generate_invite_code(
    session_id: str,
    current_user: str = Depends(get_current_user)
):
    """Generate 6-digit invite code for session"""
    
    try:
        # Verify user owns this session
        session_status = await translation_service.get_session_status(session_id)
        if not session_status:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
            
        if session_status["user_a_id"] != current_user:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only session owner can generate invite codes"
            )
            
        invite_code = await translation_service.generate_invite_code(session_id)
        expires_at = datetime.utcnow() + timedelta(hours=24)
        
        return InviteCodeResponse(
            invite_code=invite_code,
            expires_at=expires_at.isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate invite code: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate invite code: {str(e)}"
        )

@router.post("/{session_id}/share-link", response_model=ShareLinkResponse)
async def generate_share_link(
    session_id: str,
    request: ShareLinkRequest = ShareLinkRequest(),
    current_user: str = Depends(get_current_user)
):
    """Generate shareable link for session"""
    
    try:
        # Verify user owns this session
        session_status = await translation_service.get_session_status(session_id)
        if not session_status:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
            
        if session_status["user_a_id"] != current_user:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only session owner can generate share links"
            )
            
        share_token = await translation_service.generate_share_token(session_id, request.expires_hours)
        
        # Use the frontend URL from settings
        share_link = f"{settings.frontend_url}/session/{session_id}?token={share_token}&role=userB"
        expires_at = datetime.utcnow() + timedelta(hours=request.expires_hours)
        
        return ShareLinkResponse(
            share_link=share_link,
            expires_at=expires_at.isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate share link: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate share link: {str(e)}"
        )

@router.post("/join-by-code", response_model=dict)
async def join_session_by_code(
    request: JoinByCodeRequest,
    current_user: str = Depends(get_current_user)
):
    """Join session using 6-digit invite code"""
    
    try:
        session_id = await translation_service.join_by_invite_code(
            request.invite_code,
            current_user
        )
        
        return {
            "message": "Successfully joined session",
            "session_id": session_id
        }
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error: {str(e)}"
        )
@router.post("/{session_id}/join", response_model=dict)
async def join_session_by_id(
    session_id: str,
    current_user: str = Depends(get_current_user)
):
    """Join an existing translation session as user B (by session ID in URL)"""
    
    try:
        success = await translation_service.join_session(
            session_id=session_id,
            user_b_id=current_user
        )
        
        if success:
            return {"message": "Successfully joined session", "session_id": session_id}
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to join session"
            )
            
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error: {str(e)}"
        )

@router.post("/join", response_model=dict)
async def join_session(
    request: JoinSessionRequest,
    current_user: str = Depends(get_current_user)
):
    """Join an existing translation session as user B"""
    
    try:
        success = await translation_service.join_session(
            session_id=request.session_id,
            user_b_id=current_user
        )
        
        if success:
            return {"message": "Successfully joined session", "session_id": request.session_id}
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to join session"
            )
            
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error: {str(e)}"
        )

@router.post("/{session_id}/start", response_model=dict)
async def start_session(
    session_id: str,
    current_user: str = Depends(get_current_user)
):
    """Start translation for a session"""
    
    try:
        # Verify user is authorized for this session
        session_status = await translation_service.get_session_status(session_id)
        if not session_status:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
            
        # Check authorization - handle None user_b_id
        authorized_users = [session_status["user_a_id"]]
        if session_status.get("user_b_id"):
            authorized_users.append(session_status["user_b_id"])
            
        if current_user not in authorized_users:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized for this session"
            )
            
        success = await translation_service.start_session(session_id)
        
        if success:
            return {"message": "Session started successfully", "session_id": session_id}
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to start session"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error: {str(e)}"
        )

@router.post("/{session_id}/stop", response_model=dict)
async def stop_session(
    session_id: str,
    current_user: str = Depends(get_current_user)
):
    """Stop translation for a session"""
    
    try:
        # Verify user is authorized for this session
        session_status = await translation_service.get_session_status(session_id)
        if not session_status:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
            
        # Check authorization - handle None user_b_id
        authorized_users = [session_status["user_a_id"]]
        if session_status.get("user_b_id"):
            authorized_users.append(session_status["user_b_id"])
            
        if current_user not in authorized_users:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized for this session"
            )
            
        success = await translation_service.stop_session(session_id)
        
        if success:
            return {"message": "Session stopped successfully", "session_id": session_id}
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to stop session"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error: {str(e)}"
        )

@router.get("/public/{session_id}/by-token", response_model=SessionResponse)
async def get_session_by_share_token(
    session_id: str,
    token: str = Query(..., description="Share token")
):
    """Get session details using share token (for User B joining)"""
    
    logger.info(f"🔑 Token-based session access attempt: {session_id}, token length: {len(token)}")
    
    try:
        # Verify the share token
        is_valid = await translation_service.verify_share_token(session_id, token)
        if not is_valid:
            logger.warning(f"❌ Invalid token for session {session_id}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired share token"
            )
        
        # Return session details
        session_status = await translation_service.get_session_status(session_id)
        if not session_status:
            logger.error(f"❌ Session {session_id} not found")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
        
        # Mark that this is a token-based access (for frontend to know user can join)
        session_status["is_token_access"] = True
        
        logger.info(f"✅ Token verified for session {session_id}")
        return SessionResponse(**session_status)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"💥 Error in token-based session access: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error: {str(e)}"
        )

@router.get("/public/{session_id}", response_model=SessionResponse)
async def get_public_session(session_id: str):
    """Get session details for public access (joining via shared link)"""
    
    try:
        session_status = await translation_service.get_session_status(session_id)
        
        if not session_status:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
            
        # Allow public access to session info for joining
        # Remove sensitive info for public access
        public_session = session_status.copy()
        public_session.pop('user_a_id', None)
        public_session.pop('user_b_id', None)
            
        return SessionResponse(**session_status)  # Return full data for now
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error: {str(e)}"
        )

@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    current_user: str = Depends(get_current_user)
):
    """Get session details by ID"""
    
    try:
        session_status = await translation_service.get_session_status(session_id)
        
        if not session_status:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
            
        # Check authorization - handle None user_b_id
        authorized_users = [session_status["user_a_id"]]
        if session_status.get("user_b_id"):
            authorized_users.append(session_status["user_b_id"])
            
        if current_user not in authorized_users:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized for this session"
            )
            
        return SessionResponse(**session_status)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error: {str(e)}"
        )

@router.get("/{session_id}/status", response_model=SessionResponse)
async def get_session_status(
    session_id: str,
    current_user: str = Depends(get_current_user)
):
    """Get status of a translation session"""
    
    try:
        session_status = await translation_service.get_session_status(session_id)
        
        if not session_status:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
            
        # Check authorization
        # Check authorization - handle None user_b_id
        authorized_users = [session_status["user_a_id"]]
        if session_status.get("user_b_id"):
            authorized_users.append(session_status["user_b_id"])
            
        if current_user not in authorized_users:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized for this session"
            )
            
        return SessionResponse(**session_status)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error: {str(e)}"
        )

@router.get("/debug/auth", response_model=dict)
async def debug_auth(
    current_user: str = Depends(get_current_user)
):
    """Debug endpoint to check authentication"""
    return {
        "authenticated": True,
        "user_id": current_user,
        "message": "Authentication working correctly"
    }

@router.get("/{session_id}/tokens", response_model=TokenResponse)
async def get_session_tokens(
    session_id: str,
    current_user: str = Depends(get_current_user)
):
    """Get Daily.co room token with comprehensive error handling"""
    
    try:
        logger.info(f"🎫 Token request for session: {session_id}, user: {current_user}")
        
        # First check if session exists
        session_status = await translation_service.get_session_status(session_id)
        if not session_status:
            logger.error(f"❌ Session {session_id} not found for token request")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Session {session_id} not found"
            )
        
        logger.info(f"✅ Session {session_id} found with status: {session_status.get('status')}")
        
        # Check authorization
        authorized_users = [session_status["user_a_id"]]
        if session_status.get("user_b_id"):
            authorized_users.append(session_status["user_b_id"])
            
        if current_user not in authorized_users:
            logger.error(f"❌ User {current_user} not authorized for session {session_id}")
            logger.info(f"📋 Authorized users: {authorized_users}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User {current_user} not authorized for session {session_id}"
            )
        
        logger.info(f"✅ User {current_user} authorized for session {session_id}")
        
        # Generate tokens
        token_data = await translation_service.get_user_tokens(session_id, current_user)
        logger.info(f"🎫 Tokens generated successfully for user {current_user}")
        
        return TokenResponse(**token_data)
        
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"❌ ValueError in token generation: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"💥 Unexpected error in token generation: {str(e)}")
        logger.error(f"📍 Error type: {type(e).__name__}")
        import traceback
        logger.error(f"📍 Traceback: {traceback.format_exc()}")
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@router.get("/{session_id}/token", response_model=TokenResponse)
async def get_session_token(
    session_id: str,
    current_user: str = Depends(get_current_user)
):
    """Get Daily.co room token for joining session"""
    
    try:
        token_data = await translation_service.get_user_tokens(session_id, current_user)
        return TokenResponse(**token_data)
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error: {str(e)}"
        )

@router.get("/", response_model=SessionListResponse)
async def list_sessions(
    current_user: str = Depends(get_current_user),
    limit: int = 10
):
    """List sessions for current user"""
    
    try:
        sessions = await translation_service.list_user_sessions(current_user, limit)
        
        return SessionListResponse(
            sessions=sessions,
            total=len(sessions)
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error: {str(e)}"
        )

@router.get("/{session_id}/metrics", response_model=dict)
async def get_session_metrics(
    session_id: str,
    current_user: str = Depends(get_current_user)
):
    """Get detailed metrics for a session"""
    
    try:
        # Verify user is authorized for this session
        session_status = await translation_service.get_session_status(session_id)
        if not session_status:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found"
            )
            
        if current_user not in [session_status["user_a_id"], session_status["user_b_id"]]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized for this session"
            )
            
        metrics = await translation_service.get_session_metrics(session_id)
        
        if not metrics:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Metrics not found for session"
            )
            
        return metrics
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error: {str(e)}"
        )
