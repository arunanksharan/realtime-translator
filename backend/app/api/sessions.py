"""
API routes for translation sessions
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

from app.services.translation_service import translation_service
from app.core.security import security
from app.database import get_db
from app.models import User

router = APIRouter(prefix="/sessions", tags=["sessions"])
security_scheme = HTTPBearer()

class CreateSessionRequest(BaseModel):
    language_a: str = Field(..., description="Language code for user A (e.g., 'en', 'es', 'fr')")
    language_b: str = Field(..., description="Language code for user B (e.g., 'en', 'es', 'fr')")
    user_b_id: Optional[str] = Field(None, description="Optional user B ID if known")

class JoinSessionRequest(BaseModel):
    session_id: str = Field(..., description="Session ID to join")

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
            
        if current_user not in [session_status["user_a_id"], session_status["user_b_id"]]:
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
            
        if current_user not in [session_status["user_a_id"], session_status["user_b_id"]]:
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
        if current_user not in [session_status["user_a_id"], session_status["user_b_id"]]:
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
