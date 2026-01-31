from app.models.user_context import UserContext
from app.services.openai_client import openai_client
import structlog
from typing import Dict, Any, Optional

logger = structlog.get_logger()

class QuestionGenerator:
    """
    Generates contextual questions to collect user information.
    Skips pre-populated fields and determines the next field to collect.
    """
    
    # Define the order of fields to collect
    FIELD_ORDER = [
        "org_type",
        "org_size",
        "nomination_subject",
        "description",
        "achievement_focus",
        "tech_orientation",
        "operating_scope"
    ]
    
    # Field descriptions for context
    FIELD_DESCRIPTIONS = {
        "org_type": "organization type (for-profit, non-profit, or government)",
        "org_size": "organization size (small: up to 100 employees, medium: 101-2,500, large: 2,501+)",
        "nomination_subject": "what you're nominating (organization, team, individual, or product)",
        "description": "a description of the achievement or accomplishment",
        "achievement_focus": "areas of achievement focus (e.g., Marketing, Innovation, Customer Service)",
        "tech_orientation": "technology orientation (tech company, tech user, or non-tech)",
        "operating_scope": "operating scope (local, regional, national, or international)"
    }
    
    def __init__(self):
        self.client = openai_client
    
    def _get_next_field_to_collect(self, context: UserContext) -> Optional[str]:
        """
        Determine the next field that needs to be collected.
        
        Args:
            context: Current user context
            
        Returns:
            str: Name of the next field to collect, or None if all fields are collected
        """
        context_dict = context.model_dump(exclude_none=True)
        
        for field in self.FIELD_ORDER:
            if field not in context_dict or context_dict[field] is None:
                return field
        
        return None
    
    def _build_context_summary(self, context: UserContext) -> str:
        """
        Build a summary of what we already know about the user.
        
        Args:
            context: Current user context
            
        Returns:
            str: Summary of known information
        """
        context_dict = context.model_dump(exclude_none=True)
        
        summary_parts = []
        
        if context.geography:
            summary_parts.append(f"Location: {context.geography}")
        if context.organization_name:
            summary_parts.append(f"Organization: {context.organization_name}")
        if context.job_title:
            summary_parts.append(f"Job Title: {context.job_title}")
        if context.org_type:
            summary_parts.append(f"Organization Type: {context.org_type}")
        if context.org_size:
            summary_parts.append(f"Organization Size: {context.org_size}")
        if context.nomination_subject:
            summary_parts.append(f"Nominating: {context.nomination_subject}")
        if context.description:
            summary_parts.append(f"Achievement: {context.description}")
        if context.achievement_focus:
            summary_parts.append(f"Focus Areas: {', '.join(context.achievement_focus)}")
        if context.tech_orientation:
            summary_parts.append(f"Tech Orientation: {context.tech_orientation}")
        if context.operating_scope:
            summary_parts.append(f"Operating Scope: {context.operating_scope}")
        
        return "\n".join(summary_parts) if summary_parts else "No information collected yet."
    
    async def generate_question(
        self,
        context: UserContext,
        conversation_state: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate the next contextual question based on current user context.
        
        Args:
            context: Current user context
            conversation_state: Current conversation state
            
        Returns:
            dict: Contains question, message, conversation_state, and extracted_fields
        """
        logger.info("generating_question", conversation_state=conversation_state)
        
        # Determine next field to collect
        next_field = self._get_next_field_to_collect(context)
        
        if not next_field:
            logger.info("all_fields_collected")
            return {
                "question": None,
                "message": "Thank you! I have all the information needed to find the best Stevie Awards categories for you.",
                "conversation_state": "complete",
                "extracted_fields": {}
            }
        
        # Build context summary
        context_summary = self._build_context_summary(context)
        field_description = self.FIELD_DESCRIPTIONS[next_field]
        
        # Create prompt for question generation
        system_prompt = """You are a helpful assistant for the Stevie Awards recommendation system.
Your job is to ask natural, conversational questions to collect information from users.
Keep questions friendly, clear, and concise. Make the user feel comfortable."""
        
        user_prompt = f"""Based on the following information about the user, generate a natural, conversational question to ask about their {field_description}.

What we know so far:
{context_summary}

Next field to collect: {next_field}
Field description: {field_description}

Generate a single, clear question that asks about this field. Be conversational and friendly.
Do NOT ask about information we already have (geography, organization_name, job_title, or any other fields listed above).

Question:"""
        
        try:
            # Call OpenAI to generate question
            question = await self.client.chat_completion(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,
                max_tokens=150
            )
            
            # Clean up the question
            question = question.strip().strip('"').strip("'")
            
            logger.info(
                "question_generated",
                next_field=next_field,
                question_length=len(question)
            )
            
            return {
                "question": question,
                "message": None,
                "conversation_state": f"collecting_{next_field}",
                "extracted_fields": {}
            }
            
        except Exception as e:
            logger.error("question_generation_error", error=str(e), next_field=next_field)
            
            # Fallback to template questions
            fallback_questions = {
                "org_type": "What type of organization are you nominating? (for-profit, non-profit, or government)",
                "org_size": "What is the size of your organization? (small: up to 100 employees, medium: 101-2,500, or large: 2,501+)",
                "nomination_subject": "What are you nominating? (organization, team, individual, or product)",
                "description": "Please describe the achievement or accomplishment you'd like to nominate.",
                "achievement_focus": "What areas does this achievement focus on? (e.g., Marketing, Innovation, Customer Service, Technology)",
                "tech_orientation": "How would you describe your organization's relationship with technology? (tech company, tech user, or non-tech)",
                "operating_scope": "What is your organization's operating scope? (local, regional, national, or international)"
            }
            
            return {
                "question": fallback_questions.get(next_field, "Could you tell me more about your nomination?"),
                "message": None,
                "conversation_state": f"collecting_{next_field}",
                "extracted_fields": {}
            }

# Global instance
question_generator = QuestionGenerator()
