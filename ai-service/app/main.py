from fastapi import FastAPI, Request, Depends
from fastapi.responses import JSONResponse
import structlog
import os
from dotenv import load_dotenv
from app.middleware.auth import verify_internal_api_key
from app.routes import health, metrics, conversation, embeddings, chatbot

# Load environment variables
load_dotenv('../scripts/.env')

# Configure structured logging
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer()
    ]
)

logger = structlog.get_logger()

app = FastAPI(
    title="Stevie Awards AI Service",
    description="LLM-powered question generation, field extraction, and match explanations",
    version="1.0.0"
)

# Middleware for request logging
@app.middleware("http")
async def log_requests(request: Request, call_next):
    correlation_id = request.headers.get("x-correlation-id", "unknown")
    logger.info(
        "request_received",
        method=request.method,
        path=request.url.path,
        correlation_id=correlation_id
    )
    
    response = await call_next(request)
    
    logger.info(
        "request_completed",
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        correlation_id=correlation_id
    )
    
    return response

# Include routers
app.include_router(health.router, tags=["health"])
app.include_router(metrics.router, tags=["metrics"])
app.include_router(conversation.router, prefix="/api", tags=["conversation"])
app.include_router(embeddings.router, prefix="/api", tags=["embeddings"])
app.include_router(chatbot.router, prefix="/api/chatbot", tags=["chatbot"])
# Root endpoint
@app.get("/")
async def root():
    return {
        "service": "Stevie Awards AI Service",
        "version": "1.0.0",
        "status": "running"
    }

# Error handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        "unhandled_exception",
        error=str(exc),
        path=request.url.path,
        method=request.method
    )
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "InternalServerError",
            "message": "An unexpected error occurred"
        }
    )
