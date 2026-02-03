from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from app.models.user_context import UserContext

class GenerateQuestionRequest(BaseModel):
    """Request model for question generation"""
    user_context: UserContext
    conversation_state: Optional[str] = Field(None, description="Current state of the conversation")
    
    class Config:
        json_schema_extra = {
            "example": {
                "user_context": {
                    "geography": "usa",
                    "organization_name": "Acme Corp",
                    "job_title": "Marketing Director"
                },
                "conversation_state": "initial"
            }
        }

class GenerateQuestionResponse(BaseModel):
    """Response model for question generation"""
    question: str = Field(..., description="The generated question to ask the user")
    message: Optional[str] = Field(None, description="Additional context or instructions")
    conversation_state: str = Field(..., description="Updated conversation state")
    extracted_fields: Optional[Dict[str, Any]] = Field(None, description="Any fields extracted from context")
    
    class Config:
        json_schema_extra = {
            "example": {
                "question": "What type of organization are you nominating?",
                "message": "Let's start by understanding your organization",
                "conversation_state": "collecting_org_type",
                "extracted_fields": {}
            }
        }

class ExtractFieldsRequest(BaseModel):
    """Request model for field extraction"""
    user_context: UserContext
    user_message: str = Field(..., description="The user's response message")
    conversation_state: Optional[str] = Field(None, description="Current conversation state")
    
    class Config:
        json_schema_extra = {
            "example": {
                "user_context": {
                    "geography": "usa",
                    "organization_name": "Acme Corp"
                },
                "user_message": "We're a for-profit company with about 500 employees",
                "conversation_state": "collecting_org_info"
            }
        }

class ExtractFieldsResponse(BaseModel):
    """Response model for field extraction"""
    extracted_fields: Dict[str, Any] = Field(..., description="Fields extracted from user message")
    is_complete: bool = Field(..., description="Whether all required fields have been collected")
    updated_context: UserContext = Field(..., description="Updated user context with extracted fields")
    
    class Config:
        json_schema_extra = {
            "example": {
                "extracted_fields": {
                    "org_type": "for_profit",
                    "org_size": "medium"
                },
                "is_complete": False,
                "updated_context": {
                    "geography": "usa",
                    "organization_name": "Acme Corp",
                    "org_type": "for_profit",
                    "org_size": "medium"
                }
            }
        }

class GenerateExplanationsRequest(BaseModel):
    """Request model for match explanation generation"""
    user_context: UserContext
    categories: List[Dict[str, Any]] = Field(..., description="List of matched categories with details")
    
    class Config:
        json_schema_extra = {
            "example": {
                "user_context": {
                    "geography": "usa",
                    "org_type": "for_profit",
                    "nomination_subject": "team"
                },
                "categories": [
                    {
                        "category_id": "cat_123",
                        "category_name": "Marketing Team of the Year",
                        "description": "For outstanding marketing teams"
                    }
                ]
            }
        }

class GenerateExplanationsResponse(BaseModel):
    """Response model for match explanation generation"""
    explanations: List[Dict[str, Any]] = Field(..., description="Match explanations for each category")
    
    class Config:
        json_schema_extra = {
            "example": {
                "explanations": [
                    {
                        "category_id": "cat_123",
                        "match_reasons": [
                            "Your team's marketing achievement aligns with this category",
                            "This category is open to for-profit organizations in the USA"
                        ]
                    }
                ]
            }
        }

class GenerateSearchQueryRequest(BaseModel):
    """Request model for search query generation"""
    context: UserContext = Field(..., description="User context to generate search query from")
    
    class Config:
        json_schema_extra = {
            "example": {
                "context": {
                    "description": "Our product gained 9.8/10 ratings globally on WHO rating polls",
                    "achievement_focus": ["Healthcare", "Quality Management"],
                    "nomination_subject": "product",
                    "org_type": "for_profit"
                }
            }
        }

class GenerateSearchQueryResponse(BaseModel):
    """Response model for search query generation"""
    query: str = Field(..., description="Natural language search query for semantic matching")
    
    class Config:
        json_schema_extra = {
            "example": {
                "query": "Healthcare product with exceptional WHO quality ratings and global recognition for excellence in quality management"
            }
        }



# ============================================================================
# Unified Chatbot Models
# ============================================================================

class UnifiedChatRequest(BaseModel):
    """Request for unified chatbot conversation"""
    message: str = Field(..., description="User's message")
    session_id: str = Field(..., description="Session ID")
    conversation_history: List[Dict[str, str]] = Field(default=[], description="Previous messages")
    user_context: UserContext = Field(..., description="Current user context")
    kb_articles: Optional[List[Dict[str, Any]]] = Field(None, description="KB articles for question answering")
    
    class Config:
        json_schema_extra = {
            "example": {
                "message": "I want to nominate my company",
                "session_id": "uuid-here",
                "conversation_history": [],
                "user_context": {
                    "geography": "usa",
                    "organization_name": "Acme Corp"
                },
                "kb_articles": None
            }
        }


class IntentClassificationResponse(BaseModel):
    """Intent classification result"""
    intent: str = Field(..., description="Intent type: question, information, or mixed")
    confidence: float = Field(..., description="Confidence score 0-1")
    reasoning: str = Field(..., description="Brief explanation")
    
    class Config:
        json_schema_extra = {
            "example": {
                "intent": "information",
                "confidence": 0.95,
                "reasoning": "User is providing nomination details"
            }
        }
