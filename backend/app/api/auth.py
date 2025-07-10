"""
Authentication API routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timedelta

from app.core.security import security
from app.database import get_async_session
from app.models import User
from sqlalchemy import select

router = APIRouter(prefix="/auth", tags=["authentication"])
security_scheme = HTTPBearer()

class UserRegisterRequest(BaseModel):
    email: str = Field(..., description="User email address")
    username: str = Field(..., min_length=3, max_length=50, description="Username")
    password: str = Field(..., min_length=8, description="Password")
    full_name: Optional[str] = Field(None, description="Full name")
    preferred_language: Optional[str] = Field(None, description="Preferred language code")

class UserLoginRequest(BaseModel):
    email: str = Field(..., description="User email address")
    password: str = Field(..., description="Password")

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: str



class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    full_name: Optional[str]
    preferred_language: Optional[str]
    is_active: bool
    is_verified: bool
    created_at: str
    updated_at: str

class AuthResponse(BaseModel):
    user: UserResponse
    tokens: TokenResponse
    

class RefreshTokenRequest(BaseModel):
    refresh_token: str

@router.post("/register", response_model=AuthResponse)
async def register_user(request: UserRegisterRequest):
    """Register a new user"""
    
    async with get_async_session() as db:
        # Check if user already exists
        stmt = select(User).where(User.email == request.email)
        result = await db.execute(stmt)
        existing_user = result.scalar_one_or_none()
        
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        
        # Check if username already exists
        stmt = select(User).where(User.username == request.username)
        result = await db.execute(stmt)
        existing_username = result.scalar_one_or_none()
        
        if existing_username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )
        
        # Create new user
        hashed_password = security.get_password_hash(request.password)
        
        new_user = User(
            email=request.email,
            username=request.username,
            hashed_password=hashed_password,
            full_name=request.full_name,
            preferred_language=request.preferred_language,
            is_active=True,
            is_verified=False,
            created_at=datetime.now()
        )
        
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)
        
        # Create tokens for the new user
        access_token_data = {
            "sub": new_user.id,
            "email": new_user.email,
            "username": new_user.username,
            "type": "access"
        }
        
        access_token = security.create_access_token(access_token_data)
        refresh_token = security.create_refresh_token(new_user.id)
        
        tokens = TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=security.expire_minutes * 60,
            user_id=new_user.id
        )
        
        user_response = UserResponse(
            id=new_user.id,
            email=new_user.email,
            username=new_user.username,
            full_name=new_user.full_name,
            preferred_language=new_user.preferred_language,
            is_active=new_user.is_active,
            is_verified=new_user.is_verified,
            created_at=new_user.created_at.isoformat(),
            updated_at=new_user.updated_at.isoformat()
        )
        
        return AuthResponse(
            user=user_response,
            tokens=tokens
        )

@router.post("/login", response_model=AuthResponse)
async def login_user(request: UserLoginRequest):
    """Authenticate user and return tokens"""

    print(request)  
    
    async with get_async_session() as db:
        # Find user by email
        stmt = select(User).where(User.email == request.email)
        result = await db.execute(stmt)
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Verify password
        if not security.verify_password(request.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Check if user is active
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account is deactivated",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Create tokens
        access_token_data = {
            "sub": user.id,
            "email": user.email,
            "username": user.username,
            "type": "access"
        }
        
        access_token = security.create_access_token(access_token_data)
        refresh_token = security.create_refresh_token(user.id)
        
        tokens = TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=security.expire_minutes * 60,
            user_id=user.id
        )
        
        user_response = UserResponse(
            id=user.id,
            email=user.email,
            username=user.username,
            full_name=user.full_name,
            preferred_language=user.preferred_language,
            is_active=user.is_active,
            is_verified=user.is_verified,
            created_at=user.created_at.isoformat(),
            updated_at=user.updated_at.isoformat()
        )
        
        return AuthResponse(
            user=user_response,
            tokens=tokens
        )

@router.post("/refresh", response_model=AuthResponse)
async def refresh_access_token(request: RefreshTokenRequest):
    """Refresh access token using refresh token"""
    
    try:
        # Verify refresh token
        payload = security.verify_token(request.refresh_token)
        
        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Get user from database
        async with get_async_session() as db:
            user = await db.get(User, user_id)
            
            if not user or not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User not found or inactive",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            
            # Create new access token
            access_token_data = {
                "sub": user.id,
                "email": user.email,
                "username": user.username,
                "type": "access"
            }
            
            access_token = security.create_access_token(access_token_data)
            new_refresh_token = security.create_refresh_token(user.id)
            
            tokens = TokenResponse(
                access_token=access_token,
                refresh_token=new_refresh_token,
                token_type="bearer",
                expires_in=security.expire_minutes * 60,
                user_id=user.id
            )
            
            user_response = UserResponse(
                id=user.id,
                email=user.email,
                username=user.username,
                full_name=user.full_name,
                preferred_language=user.preferred_language,
                is_active=user.is_active,
                is_verified=user.is_verified,
                created_at=user.created_at.isoformat(),
                updated_at=user.updated_at.isoformat()
            )
            
            return AuthResponse(
                user=user_response,
                tokens=tokens
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(credentials: HTTPAuthorizationCredentials = Depends(security_scheme)):
    """Get current user information"""
    
    try:
        # Verify access token
        payload = security.verify_token(credentials.credentials)
        user_id = payload.get("sub")
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Get user from database
        async with get_async_session() as db:
            user = await db.get(User, user_id)
            
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User not found"
                )
            
            return UserResponse(
                id=user.id,
                email=user.email,
                username=user.username,
                full_name=user.full_name,
                preferred_language=user.preferred_language,
                is_active=user.is_active,
                is_verified=user.is_verified,
                created_at=user.created_at.isoformat(),
                updated_at=user.updated_at.isoformat() if user.updated_at else user.created_at.isoformat()
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
            headers={"WWW-Authenticate": "Bearer"},
        )

@router.post("/logout", response_model=dict)
async def logout_user(credentials: HTTPAuthorizationCredentials = Depends(security_scheme)):
    """Logout user (invalidate token)"""
    
    # Note: In a production system, you would typically maintain a blacklist
    # of invalidated tokens or use a token store like Redis
    
    return {"message": "Successfully logged out"}

class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = Field(None, description="Full name")
    preferred_language: Optional[str] = Field(None, description="Preferred language code")

@router.put("/me", response_model=UserResponse)
async def update_user_profile(
    request: UpdateUserRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme)
):
    """Update current user profile"""
    
    try:
        # Verify access token
        payload = security.verify_token(credentials.credentials)
        user_id = payload.get("sub")
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Update user in database
        async with get_async_session() as db:
            user = await db.get(User, user_id)
            
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User not found"
                )
            
            # Update fields if provided
            if request.full_name is not None:
                user.full_name = request.full_name
            if request.preferred_language is not None:
                user.preferred_language = request.preferred_language
            
            user.updated_at = datetime.now()
            
            await db.commit()
            await db.refresh(user)
            
            return UserResponse(
                id=user.id,
                email=user.email,
                username=user.username,
                full_name=user.full_name,
                preferred_language=user.preferred_language,
                is_active=user.is_active,
                is_verified=user.is_verified,
                created_at=user.created_at.isoformat(),
                updated_at=user.updated_at.isoformat() if user.updated_at else user.created_at.isoformat()
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error: {str(e)}"
        )

class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, description="New password")

@router.post("/change-password", response_model=dict)
async def change_password(
    request: ChangePasswordRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme)
):
    """Change user password"""
    
    try:
        # Verify access token
        payload = security.verify_token(credentials.credentials)
        user_id = payload.get("sub")
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Update password in database
        async with get_async_session() as db:
            user = await db.get(User, user_id)
            
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User not found"
                )
            
            # Verify current password
            if not security.verify_password(request.current_password, user.hashed_password):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Current password is incorrect"
                )
            
            # Update password
            user.hashed_password = security.get_password_hash(request.new_password)
            user.updated_at = datetime.now()
            
            await db.commit()
            
            return {"message": "Password changed successfully"}
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal error: {str(e)}"
        )
