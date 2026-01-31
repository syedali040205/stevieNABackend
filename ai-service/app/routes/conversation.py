from fastapi import APIRouter, Depends, HTTPException, status
from app.models.requests import (
    GenerateQuestionRequest,
    GenerateQuestionResponse,
    ExtractFieldsRequest,
    ExtractFieldsResponse,
    GenerateExplanationsRequest,
    GenerateExplanationsResponse
)
from app.services.question_generator import question_generator
from app.services.field_extractor import field_extractor
from app.services.explanation_generator import explanation_generator
from app.middleware.auth import verify_internal_api_key
import structlog

logger = structlog.get_logger()
router = APIRouter()

@router.post(
    "/generate-question",
    response_model=GenerateQuestionResponse,
    dependencies=[Depends(verify_internal_api_key)]
)
async def generate_question(request: GenerateQuestionRequest):
    """
    Generate the next contextual question based on user context.
    
    This endpoint analyzes the current user context and determines what
    information is still needed, then generates a natural, conversational
    question to collect that information.
    
    Args:
        request: Contains user_context and optional conversation_state
        
    Returns:
        GenerateQuestionResponse: Contains the generated question and updated state
        
    Raises:
        500: If question generation fails
    """
    try:
        logger.info(
            "generate_question_request",
            has_geography=request.user_context.geography is not None,
            has_org_name=request.user_context.organization_name is not None,
            conversation_state=request.conversation_state
        )
        
        result = await question_generator.generate_question(
            context=request.user_context,
            conversation_state=request.conversation_state
        )
        
        return GenerateQuestionResponse(**result)
        
    except Exception as e:
        logger.error("generate_question_error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate question: {str(e)}"
        )

@router.post(
    "/extract-fields",
    response_model=ExtractFieldsResponse,
    dependencies=[Depends(verify_internal_api_key)]
)
async def extract_fields(request: ExtractFieldsRequest):
    """
    Extract structured fields from user's message.
    
    This endpoint uses LLM to parse the user's natural language response
    and extract relevant structured fields (org_type, org_size, etc.).
    It validates extracted fields against allowed enum values and merges
    them with the existing context.
    
    Args:
        request: Contains user_context, user_message, and optional conversation_state
        
    Returns:
        ExtractFieldsResponse: Contains extracted fields, completeness flag, and updated context
        
    Raises:
        500: If field extraction fails
    """
    try:
        logger.info(
            "extract_fields_request",
            message_length=len(request.user_message),
            conversation_state=request.conversation_state
        )
        
        result = await field_extractor.extract_fields(
            context=request.user_context,
            user_message=request.user_message,
            conversation_state=request.conversation_state
        )
        
        return ExtractFieldsResponse(**result)
        
    except Exception as e:
        logger.error("extract_fields_error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to extract fields: {str(e)}"
        )

@router.post(
    "/generate-explanations",
    response_model=GenerateExplanationsResponse,
    dependencies=[Depends(verify_internal_api_key)]
)
async def generate_explanations(request: GenerateExplanationsRequest):
    """
    Generate match explanations for recommended categories.
    
    This endpoint generates 2-3 concise reasons why each recommended
    category matches the user's nomination context.
    
    Args:
        request: Contains user_context and list of categories
        
    Returns:
        GenerateExplanationsResponse: Contains explanations for each category
        
    Raises:
        500: If explanation generation fails
    """
    try:
        logger.info(
            "generate_explanations_request",
            category_count=len(request.categories)
        )
        
        explanations = await explanation_generator.generate_explanations(
            context=request.user_context,
            categories=request.categories
        )
        
        return GenerateExplanationsResponse(explanations=explanations)
        
    except Exception as e:
        logger.error("generate_explanations_error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate explanations: {str(e)}"
        )
