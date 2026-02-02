from app.models.user_context import UserContext
from app.services.openai_client import openai_client
import structlog

logger = structlog.get_logger()

class SearchQueryGenerator:
    """
    Generates natural language search queries from UserContext using LLM.
    This produces better embeddings than manual string formatting.
    """
    
    def __init__(self):
        self.client = openai_client
    
    async def generate_query(self, context: UserContext) -> str:
        """
        Generate a natural language search query optimized for semantic search.
        
        Args:
            context: User context with nomination details
            
        Returns:
            str: Natural language search query
        """
        logger.info("generating_search_query")
        
        # Build context summary
        context_dict = context.model_dump(exclude_none=True)
        
        # Create prompt for query generation
        system_prompt = """You are an expert at creating search queries for Stevie Awards category matching.

Given user information about their nomination, create a natural language search query that will find the most relevant award categories.

IMPORTANT: Award categories belong to specific Stevie Awards programs (e.g., "Stevie Awards for Sales & Customer Service", "American Business Awards", "International Business Awards"). A single achievement can qualify for categories across MULTIPLE programs - don't limit the query to just one program area. Be inclusive and comprehensive.

Include ALL relevant information from the user context:
1. The achievement/accomplishment (MOST IMPORTANT - be specific and detailed)
2. What they're nominating (product, organization, team, individual)
3. ALL focus areas and technologies mentioned
4. Organization type (for-profit, non-profit, government)
5. Organization size (small, medium, large)
6. Geographic location/scope (if relevant)
7. Tech orientation (tech company, tech user, non-tech)
8. Operating scope (local, regional, national, international)

Create a natural, descriptive query that captures the full context and could match categories across different Stevie Awards programs. Be comprehensive but fluent.
Keep it under 80 words. Use natural language, not bullet points."""

        user_prompt = f"""User Context:
{self._format_context(context_dict)}

Generate a natural search query to find relevant award categories:"""
        
        try:
            # Call OpenAI to generate query
            query = await self.client.chat_completion(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,  # Slightly creative for natural language
                max_tokens=150  # Increased for more comprehensive queries
            )
            
            query = query.strip()
            
            logger.info("search_query_generated", query=query)
            
            return query
            
        except Exception as e:
            logger.error("query_generation_error", error=str(e))
            # Fallback to simple concatenation
            return self._fallback_query(context_dict)
    
    def _format_context(self, context_dict: dict) -> str:
        """Format ALL context fields for LLM prompt."""
        parts = []
        
        # Achievement description (MOST IMPORTANT - put first)
        if "description" in context_dict:
            parts.append(f"Achievement: {context_dict['description']}")
        
        # Focus areas (CRITICAL for matching)
        if "achievement_focus" in context_dict and context_dict["achievement_focus"]:
            focus = ", ".join(context_dict["achievement_focus"])
            parts.append(f"Focus areas: {focus}")
        
        # Nomination subject
        if "nomination_subject" in context_dict:
            parts.append(f"Nominating: {context_dict['nomination_subject']}")
        
        # Organization details
        if "organization_name" in context_dict:
            parts.append(f"Organization: {context_dict['organization_name']}")
        
        if "org_type" in context_dict:
            parts.append(f"Organization type: {context_dict['org_type']}")
        
        if "org_size" in context_dict:
            parts.append(f"Organization size: {context_dict['org_size']}")
        
        # Geography
        if "geography" in context_dict:
            parts.append(f"Geography: {context_dict['geography']}")
        
        # Tech orientation
        if "tech_orientation" in context_dict:
            parts.append(f"Tech orientation: {context_dict['tech_orientation']}")
        
        # Operating scope
        if "operating_scope" in context_dict:
            parts.append(f"Operating scope: {context_dict['operating_scope']}")
        
        # Job title (can indicate expertise area)
        if "job_title" in context_dict:
            parts.append(f"Nominator role: {context_dict['job_title']}")
        
        return "\n".join(parts)
    
    def _fallback_query(self, context_dict: dict) -> str:
        """Simple fallback if LLM fails."""
        parts = []
        
        if "description" in context_dict:
            parts.append(context_dict["description"])
        
        if "achievement_focus" in context_dict and context_dict["achievement_focus"]:
            parts.append(" ".join(context_dict["achievement_focus"]))
        
        if "nomination_subject" in context_dict:
            parts.append(f"for {context_dict['nomination_subject']}")
        
        return " ".join(parts)

# Global instance
search_query_generator = SearchQueryGenerator()
