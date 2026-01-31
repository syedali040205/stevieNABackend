from app.models.user_context import UserContext
from app.services.openai_client import openai_client
import structlog
from typing import Dict, Any, List

logger = structlog.get_logger()

class ExplanationGenerator:
    """
    Generates match explanations for recommended categories.
    Provides 2-3 concise reasons why a category matches the user's context.
    """
    
    def __init__(self):
        self.client = openai_client
    
    def _build_context_description(self, context: UserContext) -> str:
        """
        Build a human-readable description of the user context.
        
        Args:
            context: User context
            
        Returns:
            str: Description of the user's nomination
        """
        parts = []
        
        if context.organization_name:
            parts.append(f"Organization: {context.organization_name}")
        
        if context.geography:
            parts.append(f"Location: {context.geography}")
        
        if context.org_type:
            parts.append(f"Type: {context.org_type}")
        
        if context.org_size:
            parts.append(f"Size: {context.org_size}")
        
        if context.nomination_subject:
            parts.append(f"Nominating: {context.nomination_subject}")
        
        if context.description:
            parts.append(f"Achievement: {context.description}")
        
        if context.achievement_focus:
            parts.append(f"Focus areas: {', '.join(context.achievement_focus)}")
        
        if context.tech_orientation:
            parts.append(f"Tech orientation: {context.tech_orientation}")
        
        if context.operating_scope:
            parts.append(f"Operating scope: {context.operating_scope}")
        
        return "\n".join(parts)
    
    async def generate_explanation(
        self,
        context: UserContext,
        category: Dict[str, Any]
    ) -> List[str]:
        """
        Generate match reasons for a single category.
        
        Args:
            context: User context
            category: Category information (name, description, eligibility criteria)
            
        Returns:
            list: 2-3 concise match reasons
        """
        context_desc = self._build_context_description(context)
        
        category_name = category.get("category_name", "Unknown Category")
        category_desc = category.get("description", "")
        program_name = category.get("program_name", "")
        
        # Create prompt for explanation generation
        system_prompt = """You are an expert at explaining why Stevie Awards categories match user nominations.
Generate 2-3 concise, specific reasons why this category is a good match.
Each reason should be one sentence and focus on specific alignment between the nomination and category.
Be encouraging and positive."""
        
        user_prompt = f"""User's Nomination:
{context_desc}

Matched Category:
Name: {category_name}
Program: {program_name}
Description: {category_desc}

Generate 2-3 specific reasons why this category matches the user's nomination.
Return only the reasons, one per line, without numbering or bullet points."""
        
        try:
            response = await self.client.chat_completion(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,
                max_tokens=200
            )
            
            # Parse reasons from response
            reasons = [
                line.strip().lstrip("-•*").strip()
                for line in response.strip().split("\n")
                if line.strip() and not line.strip().startswith("#")
            ]
            
            # Limit to 2-3 reasons
            reasons = reasons[:3]
            
            # Ensure we have at least 2 reasons
            if len(reasons) < 2:
                reasons.append(f"This category aligns with your {context.nomination_subject} nomination.")
            
            logger.info(
                "explanation_generated",
                category_name=category_name,
                reason_count=len(reasons)
            )
            
            return reasons
            
        except Exception as e:
            logger.error(
                "explanation_generation_error",
                error=str(e),
                category_name=category_name
            )
            
            # Fallback reasons
            return [
                f"This category matches your {context.nomination_subject} nomination.",
                f"Your achievement in {context.achievement_focus[0] if context.achievement_focus else 'this area'} aligns well with this category."
            ]
    
    async def generate_explanations(
        self,
        context: UserContext,
        categories: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Generate match explanations for multiple categories.
        
        Args:
            context: User context
            categories: List of category information
            
        Returns:
            list: List of explanations with category_id and match_reasons
        """
        logger.info(
            "generating_explanations",
            category_count=len(categories)
        )
        
        explanations = []
        
        for category in categories:
            category_id = category.get("category_id")
            
            try:
                match_reasons = await self.generate_explanation(context, category)
                
                explanations.append({
                    "category_id": category_id,
                    "match_reasons": match_reasons
                })
                
            except Exception as e:
                logger.error(
                    "category_explanation_error",
                    error=str(e),
                    category_id=category_id
                )
                # Continue with other categories
                continue
        
        logger.info(
            "explanations_complete",
            success_count=len(explanations)
        )
        
        return explanations

# Global instance
explanation_generator = ExplanationGenerator()
