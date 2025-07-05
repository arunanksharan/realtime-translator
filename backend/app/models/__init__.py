"""
Database models for the realtime translator
"""
from sqlalchemy import Column, String, DateTime, Text, Integer, Boolean, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
from enum import Enum as PyEnum
from uuid import uuid4

from app.models.base import Base

class SessionStatus(PyEnum):
    CREATED = "created"
    WAITING = "waiting"
    ACTIVE = "active"
    COMPLETED = "completed"
    FAILED = "failed"
    EXPIRED = "expired"

class User(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    preferred_language = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    sessions_as_user_a = relationship("TranslationSession", foreign_keys="TranslationSession.user_a_id", back_populates="user_a")
    sessions_as_user_b = relationship("TranslationSession", foreign_keys="TranslationSession.user_b_id", back_populates="user_b")

class TranslationSession(Base):
    __tablename__ = "translation_sessions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    user_a_id = Column(String, ForeignKey("users.id"), nullable=False)
    user_b_id = Column(String, ForeignKey("users.id"), nullable=True)  # Can be null initially
    
    language_a = Column(String, nullable=False)  # User A's language
    language_b = Column(String, nullable=False)  # User B's language
    
    room_url = Column(String, nullable=False)
    room_name = Column(String, nullable=False)
    
    status = Column(Enum(SessionStatus), default=SessionStatus.CREATED)
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    
    # Session metadata
    session_config = Column(Text, nullable=True)  # JSON config
    error_message = Column(Text, nullable=True)
    
    # Relationships
    user_a = relationship("User", foreign_keys=[user_a_id], back_populates="sessions_as_user_a")
    user_b = relationship("User", foreign_keys=[user_b_id], back_populates="sessions_as_user_b")
    translations = relationship("Translation", back_populates="session")

class Translation(Base):
    __tablename__ = "translations"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    session_id = Column(String, ForeignKey("translation_sessions.id"), nullable=False)
    
    # Translation direction
    from_user_id = Column(String, ForeignKey("users.id"), nullable=False)
    to_user_id = Column(String, ForeignKey("users.id"), nullable=False)
    
    # Translation content
    original_text = Column(Text, nullable=False)
    translated_text = Column(Text, nullable=False)
    original_language = Column(String, nullable=False)
    translated_language = Column(String, nullable=False)
    
    # Audio metadata
    audio_duration = Column(Integer, nullable=True)  # in milliseconds
    processing_time = Column(Integer, nullable=True)  # in milliseconds
    
    # Quality metrics
    confidence_score = Column(Integer, nullable=True)  # 0-100
    
    # Timestamps
    created_at = Column(DateTime, default=func.now())
    
    # Relationships
    session = relationship("TranslationSession", back_populates="translations")
    from_user = relationship("User", foreign_keys=[from_user_id])
    to_user = relationship("User", foreign_keys=[to_user_id])

class SessionInvite(Base):
    __tablename__ = "session_invites"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    session_id = Column(String, ForeignKey("translation_sessions.id"), nullable=False)
    invited_by_id = Column(String, ForeignKey("users.id"), nullable=False)
    invited_user_id = Column(String, ForeignKey("users.id"), nullable=True)  # Can be null for email invites
    invite_email = Column(String, nullable=True)  # For email-based invites
    
    invite_code = Column(String, unique=True, nullable=False)
    is_used = Column(Boolean, default=False)
    expires_at = Column(DateTime, nullable=False)
    
    created_at = Column(DateTime, default=func.now())
    used_at = Column(DateTime, nullable=True)
    
    # Relationships
    session = relationship("TranslationSession")
    invited_by = relationship("User", foreign_keys=[invited_by_id])
    invited_user = relationship("User", foreign_keys=[invited_user_id])

class SessionMetrics(Base):
    __tablename__ = "session_metrics"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    session_id = Column(String, ForeignKey("translation_sessions.id"), nullable=False)
    
    # Performance metrics
    avg_latency_ms = Column(Integer, nullable=True)
    max_latency_ms = Column(Integer, nullable=True)
    min_latency_ms = Column(Integer, nullable=True)
    
    # Translation metrics
    total_translations = Column(Integer, default=0)
    total_audio_duration_ms = Column(Integer, default=0)
    avg_confidence_score = Column(Integer, nullable=True)
    
    # Error metrics
    error_count = Column(Integer, default=0)
    reconnection_count = Column(Integer, default=0)
    
    # Session duration
    session_duration_ms = Column(Integer, nullable=True)
    
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # Relationships
    session = relationship("TranslationSession")
