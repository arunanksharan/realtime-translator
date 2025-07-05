from pydantic_settings import BaseSettings
from typing import List, Optional
from pathlib import Path

class Settings(BaseSettings):
    # Database
    database_url: str
    redis_url: str
    
    # Security
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440
    
    # Google/Gemini APIs
    gemini_multimodal_live_api_key: str  # Main credential for Gemini Live API
    google_client_id: Optional[str] = None     # Optional for OAuth
    google_client_secret: Optional[str] = None # Optional for OAuth
    daily_api_key: str
    daily_domain: str
    
    # App Settings
    debug: bool = False
    cors_origins: List[str] = ["http://localhost:3000"]
    log_level: str = "INFO"
    
    # Rate limiting
    rate_limit_requests: int = 100
    rate_limit_window: int = 60
    
    # Translation settings
    max_translation_sessions: int = 10
    session_timeout_minutes: int = 120
    cleanup_interval_minutes: int = 30
    
    # Audio settings
    audio_sample_rate: int = 16000
    audio_chunk_size: int = 1024
    audio_buffer_size: int = 4096
    
    # Monitoring
    prometheus_port: int = 8001
    enable_metrics: bool = True
    enable_tracing: bool = True
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

# Global settings instance
settings = Settings()
