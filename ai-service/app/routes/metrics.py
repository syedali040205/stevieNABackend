from fastapi import APIRouter, Response
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
import structlog

logger = structlog.get_logger()
router = APIRouter()

# Prometheus metrics
http_requests_total = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status']
)

http_request_duration_seconds = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration in seconds',
    ['method', 'endpoint']
)

llm_requests_total = Counter(
    'llm_requests_total',
    'Total LLM API requests',
    ['operation', 'status']
)

llm_request_duration_seconds = Histogram(
    'llm_request_duration_seconds',
    'LLM API request duration in seconds',
    ['operation']
)

@router.get("/metrics")
async def metrics():
    """
    Prometheus metrics endpoint.
    Exposes application metrics in Prometheus format.
    """
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST
    )
