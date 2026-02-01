"""
Answer Generator Service

Generates streaming answers to user questions using retrieved knowledge base context.
Uses RAG (Retrieval Augmented Generation) pattern with OpenAI.
"""

from app.services.openai_client import openai_client
import structlog
from typing import List, Dict, Any

logger = structlog.get_logger()


class AnswerGenerator:
    """
    Generates natural language answers based on retrieved KB articles with streaming.
    """
    
    def __init__(self):
        self.client = openai_client
    
    def generate_answer_stream(
        self,
        question: str,
        context_articles: List[Dict[str, Any]],
        max_tokens: int = 500
    ):
        """
        Generate a streaming answer to a question using retrieved KB context.
        
        Args:
            question: User's question
            context_articles: List of relevant KB articles with title, content, similarity_score
            max_tokens: Maximum tokens for the answer
            
        Yields:
            str: Chunks of the answer text
        """
        logger.info(
            "generating_answer_stream",
            question_length=len(question),
            context_count=len(context_articles)
        )
        
        if not context_articles:
            yield "I don't have enough information to answer that question. Could you please rephrase or ask about a specific Stevie Awards program?"
            return
        
        # Build context from articles
        context_text = self._build_context(context_articles)
        
        # Create system prompt
        system_prompt = """You are a helpful assistant for the Stevie Awards, answering questions about their various awards programs.

Your role:
- Answer questions accurately based ONLY on the provided context
- Be concise but informative
- If the context doesn't contain the answer, say so politely
- Mention specific program names when relevant
- Use a friendly, professional tone

Important guidelines:
- DO NOT make up information not in the context
- DO NOT provide outdated information
- If asked about deadlines or dates, emphasize checking the official website for current information
- If multiple programs are relevant, mention them all"""
        
        # Create user prompt with context
        user_prompt = f"""Context from Stevie Awards knowledge base:

{context_text}

Question: {question}

Please provide a helpful answer based on the context above. If the context doesn't contain enough information, say so."""
        
        try:
            # Stream answer using OpenAI
            for chunk in self.client.chat_completion_stream(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,
                max_tokens=max_tokens
            ):
                yield chunk
            
            logger.info("answer_stream_complete")
            
        except Exception as e:
            logger.error("answer_stream_error", error=str(e))
            yield "I apologize, but I encountered an error generating an answer. Please try again or contact support."
    
    def _build_context(self, articles: List[Dict[str, Any]]) -> str:
        """
        Build context text from retrieved articles.
        
        Args:
            articles: List of KB articles
            
        Returns:
            str: Formatted context text
        """
        context_parts = []
        
        for i, article in enumerate(articles[:5], 1):  # Use top 5 articles
            title = article.get("title", "Untitled")
            content = article.get("content", "")
            program = article.get("program", "General")
            
            context_parts.append(f"[Source {i} - {program}]")
            context_parts.append(f"Title: {title}")
            context_parts.append(f"Content: {content}")
            context_parts.append("")  # Empty line between sources
        
        return "\n".join(context_parts)
    
    def _calculate_confidence(self, articles: List[Dict[str, Any]]) -> str:
        """
        Calculate confidence level based on similarity scores.
        
        Args:
            articles: List of KB articles with similarity_score
            
        Returns:
            str: Confidence level (high, medium, low)
        """
        if not articles:
            return "low"
        
        top_score = articles[0].get("similarity_score", 0)
        
        if top_score >= 0.8:
            return "high"
        elif top_score >= 0.6:
            return "medium"
        else:
            return "low"
    
    def _extract_sources(self, articles: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Extract source information from articles.
        
        Args:
            articles: List of KB articles
            
        Returns:
            list: List of source metadata
        """
        sources = []
        
        for article in articles[:3]:  # Return top 3 sources
            sources.append({
                "title": article.get("title", "Untitled"),
                "program": article.get("program", "General"),
                "similarity_score": round(article.get("similarity_score", 0), 3)
            })
        
        return sources


# Global instance
answer_generator = AnswerGenerator()
