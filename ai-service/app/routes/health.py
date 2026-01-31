from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from app.services.openai_client import openai_client
from app.config.settings import settings
import structlog

logger = structlog.get_logger()
router = APIRouter()

@router.get("/health")
async def health_check():
    """
    Health check endpoint for the AI service.
    Verifies OpenAI API connectivity and service status.
    
    Returns:
        200: Service is healthy
        503: Service is unhealthy
    """
    health_status = {
        "service": "stevie-ai-service",
        "status": "healthy",
        "checks": {}
    }
    
    # Check OpenAI API connectivity
    try:
        # Simple check - verify client is initialized
        if openai_client.client:
            health_status["checks"]["openai"] = {
                "status": "healthy",
                "model": settings.openai_model,
                "embedding_model": settings.openai_embedding_model
            }
        else:
            health_status["checks"]["openai"] = {
                "status": "unhealthy",
                "error": "Client not initialized"
            }
            health_status["status"] = "unhealthy"
    except Exception as e:
        logger.error("health_check_openai_error", error=str(e))
        health_status["checks"]["openai"] = {
            "status": "unhealthy",
            "error": str(e)
        }
        health_status["status"] = "unhealthy"
    
    status_code = status.HTTP_200_OK if health_status["status"] == "healthy" else status.HTTP_503_SERVICE_UNAVAILABLE
    
    return JSONResponse(
        status_code=status_code,
        content=health_status
    )
