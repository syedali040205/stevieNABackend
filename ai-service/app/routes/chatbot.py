"""
Chatbot Routes

Handles answer generation for the Stevie Awards chatbot with streaming.
Node.js handles KB search, Python generates answers using LLM.
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from app.services.answer_generator import answer_generator
from app.middleware.auth import verify_internal_api_key
import logging
import json

router = APIRouter()
logger = logging.getLogger(__name__)


class KBArticle(BaseModel):
    """KB article from semantic search"""
    title: str
    content: str
    program: Optional[str] = "General"
    category: Optional[str] = None
    similarity_score: float


class AnswerRequest(BaseModel):
    """Request to generate an answer"""
    question: str
    context_articles: List[KBArticle]
    max_tokens: Optional[int] = 500


@router.post("/answer")
async def generate_answer_stream(
    request: AnswerRequest,
    _: None = Depends(verify_internal_api_key)
):
    """
    Generate a streaming answer to a user question using retrieved KB context.
    
    This endpoint receives KB articles from Node.js (after semantic search)
    and streams a natural language answer using OpenAI.
    
    Flow:
    1. Node receives user question
    2. Node generates embedding (via /api/generate-embedding)
    3. Node searches KB in Supabase (pgvector)
    4. Node calls this endpoint with question + retrieved articles
    5. Python streams answer using LLM
    6. Node streams answer to user
    """
    try:
        logger.info(f"Generating streaming answer for question: {request.question[:100]}...")
        logger.info(f"Context articles: {len(request.context_articles)}")
        
        # Convert Pydantic models to dicts
        articles_dict = [article.model_dump() for article in request.context_articles]
        
        # Calculate metadata upfront
        confidence = answer_generator._calculate_confidence(articles_dict)
        sources = answer_generator._extract_sources(articles_dict)
        
        async def event_generator():
            """Generate SSE events"""
            # Send metadata first
            metadata = {
                "type": "metadata",
                "confidence": confidence,
                "sources": sources
            }
            yield f"data: {json.dumps(metadata)}\n\n"
            
            # Stream answer chunks
            for chunk in answer_generator.generate_answer_stream(
                question=request.question,
                context_articles=articles_dict,
                max_tokens=request.max_tokens
            ):
                data = {
                    "type": "chunk",
                    "content": chunk
                }
                yield f"data: {json.dumps(data)}\n\n"
            
            # Send completion event
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        
        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"  # Disable nginx buffering
            }
        )
        
    except Exception as e:
        logger.error(f"Error generating streaming answer: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate streaming answer: {str(e)}"
        )
