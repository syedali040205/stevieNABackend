from fastapi import Request, HTTPException, status
from fastapi.security import APIKeyHeader
from app.config.settings import settings
import structlog

logger = structlog.get_logger()

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def verify_internal_api_key(request: Request, api_key: str = None):
    """
    Middleware to verify internal API key for service-to-service authentication.
    
    Args:
        request: FastAPI request object
        api_key: API key from X-API-Key header
        
    Raises:
        HTTPException: 401 if API key is missing or invalid
    """
    api_key = request.headers.get("X-API-Key")
    
    if not api_key:
        logger.warning("missing_api_key", path=request.url.path)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key"
        )
    
    if api_key != settings.internal_api_key:
        logger.warning("invalid_api_key", path=request.url.path)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key"
        )
    
    return True
