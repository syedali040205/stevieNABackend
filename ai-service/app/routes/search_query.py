from fastapi import APIRouter, HTTPException
from app.models.requests import GenerateSearchQueryRequest
from app.services.search_query_generator import search_query_generator
from app.middleware.auth import verify_internal_api_key
import structlog

router = APIRouter()
logger = structlog.get_logger()

@router.post("/generate-search-query")
async def generate_search_query(
    request: GenerateSearchQueryRequest,
    api_key: str = verify_internal_api_key
):
    """
    Generate a natural language search query from UserContext.
    Uses LLM to create optimal query for semantic search.
    """
    try:
        logger.info("generate_search_query_request")
        
        query = await search_query_generator.generate_query(request.context)
        
        logger.info("search_query_generated", query_length=len(query))
        
        return {"query": query}
        
    except Exception as e:
        logger.error("search_query_generation_error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
