import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    
    # OpenAI Configuration
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = "gpt-4o-mini"
    openai_embedding_model: str = "text-embedding-3-small"
    openai_timeout: int = 30
    
    # Internal API Security
    internal_api_key: str = os.getenv("INTERNAL_API_KEY", "")
    
    # Service Configuration
    service_name: str = "stevie-ai-service"
    log_level: str = "INFO"
    
    class Config:
        env_file = "../.env"  # Load from root .env file
        case_sensitive = False
        extra = "ignore"  # Ignore extra fields from .env

settings = Settings()
