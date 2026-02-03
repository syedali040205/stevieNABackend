"""
Unified Chatbot Routes

Handles unified conversational AI that can both ask questions and answer questions.
Replaces separate conversation and chatbot routes with one intelligent system.
"""

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from app.models.requests import UnifiedChatRequest, IntentClassificationResponse
from app.services.intent_classifier import intent_classifier
from app.services.conversation_manager import conversation_manager
from app.middleware.auth import verify_internal_api_key
import structlog
import json

logger = structlog.get_logger()
router = APIRouter()


@router.post(
    "/classify-intent",
    response_model=IntentClassificationResponse,
    dependencies=[Depends(verify_internal_api_key)]
)
async def classify_intent(request: UnifiedChatRequest):
    """
    Classify user intent (question, information, or mixed).
    
    This endpoint analyzes the user's message and determines whether they're:
    - Asking a question about Stevie Awards
    - Providing nomination information
    - Both (mixed intent)
    
    Args:
        request: Contains message, conversation history, and user context
        
    Returns:
        IntentClassificationResponse: Intent type, confidence, and reasoning
        
    Raises:
        500: If intent classification fails
    """
    try:
        logger.info(
            "classify_intent_request",
            message_length=len(request.message),
            session_id=request.session_id
        )
        
        result = await intent_classifier.classify_intent(
            message=request.message,
            conversation_history=request.conversation_history,
            user_context=request.user_context
        )
        
        return IntentClassificationResponse(**result)
        
    except Exception as e:
        logger.error("classify_intent_error", error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"Failed to classify intent: {str(e)}"
        )


@router.post("/chat")
async def unified_chat(
    request: UnifiedChatRequest,
    _: None = Depends(verify_internal_api_key)
):
    """
    Unified chatbot conversation with streaming response.
    
    This endpoint handles all conversation types:
    - Question answering (uses KB articles)
    - Information collection (asks follow-up questions)
    - Mixed (both)
    
    Flow:
    1. Classify user intent
    2. Generate natural streaming response based on intent
    3. Stream SSE events to client
    
    Args:
        request: Contains message, history, context, and optional KB articles
        
    Returns:
        StreamingResponse: SSE stream with intent, chunks, and completion
        
    Raises:
        500: If chat generation fails
    """
    try:
        logger.info(
            "unified_chat_request",
            message_length=len(request.message),
            session_id=request.session_id,
            has_kb_articles=request.kb_articles is not None
        )
        
        # Step 1: Classify intent
        intent = await intent_classifier.classify_intent(
            message=request.message,
            conversation_history=request.conversation_history,
            user_context=request.user_context
        )
        
        logger.info(
            "intent_classified",
            intent=intent["intent"],
            confidence=intent["confidence"]
        )
        
        # Step 2: Generate streaming response
        async def event_generator():
            """Generate SSE events"""
            try:
                # Send intent classification first
                intent_event = {
                    "type": "intent",
                    "intent": intent["intent"],
                    "confidence": intent["confidence"]
                }
                yield f"data: {json.dumps(intent_event)}\n\n"
                
                # Stream response chunks
                chunk_count = 0
                for chunk in conversation_manager.generate_response_stream(
                    message=request.message,
                    intent=intent,
                    conversation_history=request.conversation_history,
                    user_context=request.user_context,
                    kb_articles=request.kb_articles
                ):
                    chunk_count += 1
                    data = {
                        "type": "chunk",
                        "content": chunk
                    }
                    yield f"data: {json.dumps(data)}\n\n"
                
                logger.info(f"Streamed {chunk_count} chunks")
                
                # Send completion event
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
                logger.info("unified_chat_stream_complete")
                
            except Exception as e:
                logger.error(f"Error in event_generator: {str(e)}")
                # Send error event
                error_data = {
                    "type": "error",
                    "message": "Failed to generate response"
                }
                yield f"data: {json.dumps(error_data)}\n\n"
        
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
        logger.error(f"Error in unified chat: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate chat response: {str(e)}"
        )
