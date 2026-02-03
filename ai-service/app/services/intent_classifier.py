"""
Intent Classifier Service

Classifies user intent to determine if they're asking a question,
providing information, or both (mixed intent).
"""

from app.services.openai_client import openai_client
from app.models.user_context import UserContext
import structlog
from typing import List, Dict, Any
import json

logger = structlog.get_logger()


class IntentClassifier:
    """
    Classifies user intent using GPT-4o-mini.
    
    Intent types:
    - question: User is asking about Stevie Awards
    - information: User is providing nomination details
    - mixed: User is both asking and providing info
    """
    
    def __init__(self):
        self.client = openai_client
    
    async def classify_intent(
        self,
        message: str,
        conversation_history: List[Dict[str, str]],
        user_context: UserContext
    ) -> Dict[str, Any]:
        """
        Classify user intent.
        
        Args:
            message: User's latest message
            conversation_history: Previous messages in conversation
            user_context: Current user context (fields collected so far)
            
        Returns:
            {
                "intent": "question" | "information" | "mixed",
                "confidence": 0.0-1.0,
                "reasoning": "brief explanation",
                "question_topic": "..." (if question intent),
                "info_provided": {...} (if information intent)
            }
        """
        logger.info(
            "classifying_intent",
            message_length=len(message),
            history_length=len(conversation_history)
        )
        
        try:
            # Build context summary
            context_summary = self._build_context_summary(user_context)
            history_summary = self._build_history_summary(conversation_history)
            
            # Create classification prompt
            system_prompt = """You are an intent classifier for a Stevie Awards nomination assistant.

Analyze the user's message and classify their intent:

1. "question" - User is asking about Stevie Awards, categories, deadlines, eligibility, etc.
   Examples: "What is the Stevie Awards?", "When is the deadline?", "What categories are available?"

2. "information" - User is providing nomination details or wants to nominate something.
   Examples: "I want to nominate my company", "We're a tech startup", "Our product won awards"

3. "mixed" - User is both asking a question AND providing information.
   Examples: "What categories are for marketing? We're a B2B company", "I want to nominate my team. What do I need?"

Respond ONLY with valid JSON in this exact format:
{
  "intent": "question|information|mixed",
  "confidence": 0.95,
  "reasoning": "brief explanation"
}"""
            
            user_prompt = f"""Current context collected:
{context_summary}

Recent conversation:
{history_summary}

User's latest message: "{message}"

Classify the intent of this message."""
            
            # Call LLM
            response = await self.client.chat_completion(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,  # Low temperature for consistent classification
                max_tokens=150
            )
            
            # Parse JSON response
            try:
                result = json.loads(response.strip())
                
                # Validate intent value
                if result.get("intent") not in ["question", "information", "mixed"]:
                    logger.warning("invalid_intent_value", intent=result.get("intent"))
                    result["intent"] = "information"  # Default fallback
                
                # Ensure confidence is between 0 and 1
                confidence = float(result.get("confidence", 0.8))
                result["confidence"] = max(0.0, min(1.0, confidence))
                
                logger.info(
                    "intent_classified",
                    intent=result["intent"],
                    confidence=result["confidence"]
                )
                
                return result
                
            except json.JSONDecodeError as e:
                logger.error("intent_json_parse_error", error=str(e), response=response)
                # Fallback: default to information intent
                return {
                    "intent": "information",
                    "confidence": 0.5,
                    "reasoning": "Failed to parse LLM response, defaulting to information intent"
                }
        
        except Exception as e:
            logger.error("intent_classification_error", error=str(e))
            # Fallback: default to information intent
            return {
                "intent": "information",
                "confidence": 0.5,
                "reasoning": f"Classification failed: {str(e)}"
            }
    
    def _build_context_summary(self, context: UserContext) -> str:
        """Build human-readable summary of collected context."""
        fields = []
        
        if context.geography:
            fields.append(f"- Geography: {context.geography}")
        if context.organization_name:
            fields.append(f"- Organization: {context.organization_name}")
        if context.org_type:
            fields.append(f"- Org Type: {context.org_type}")
        if context.org_size:
            fields.append(f"- Org Size: {context.org_size}")
        if context.nomination_subject:
            fields.append(f"- Nominating: {context.nomination_subject}")
        if context.job_title:
            fields.append(f"- Job Title: {context.job_title}")
        if context.description:
            fields.append(f"- Description: {context.description[:100]}...")
        
        if not fields:
            return "No context collected yet"
        
        return "\n".join(fields)
    
    def _build_history_summary(self, history: List[Dict[str, str]]) -> str:
        """Build summary of recent conversation history."""
        if not history:
            return "No previous conversation"
        
        # Get last 3 exchanges
        recent = history[-6:] if len(history) > 6 else history
        
        lines = []
        for msg in recent:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            
            # Truncate long messages
            if len(content) > 100:
                content = content[:100] + "..."
            
            lines.append(f"{role.capitalize()}: {content}")
        
        return "\n".join(lines)


# Global instance
intent_classifier = IntentClassifier()
