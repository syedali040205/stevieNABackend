from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from app.services.openai_client import openai_client
from app.middleware.auth import verify_internal_api_key
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


class EmbeddingRequest(BaseModel):
    text: str
    model: Optional[str] = "text-embedding-3-small"


class EmbeddingResponse(BaseModel):
    embedding: list[float]
    dimension: int
    tokens_used: int


@router.post("/generate-embedding", response_model=EmbeddingResponse)
async def generate_embedding(
    request: EmbeddingRequest,
    _: None = Depends(verify_internal_api_key)
):
    """
    Generate embedding for text using OpenAI.
    
    This endpoint centralizes all embedding generation in the Python AI service,
    allowing Node.js to focus on database operations and semantic search.
    """
    try:
        logger.info(f"Generating embedding for text of length {len(request.text)}")
        
        # Call OpenAI to generate embedding
        response = await openai_client.create_embedding(
            text=request.text,
            model=request.model
        )
        
        embedding = response["embedding"]
        tokens_used = response["tokens_used"]
        
        logger.info(f"Embedding generated successfully. Dimension: {len(embedding)}, Tokens: {tokens_used}")
        
        return EmbeddingResponse(
            embedding=embedding,
            dimension=len(embedding),
            tokens_used=tokens_used
        )
        
    except Exception as e:
        logger.error(f"Error generating embedding: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate embedding: {str(e)}")
