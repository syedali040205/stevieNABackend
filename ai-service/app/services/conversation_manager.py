"""
Conversation Manager Service

Generates natural, streaming responses based on user intent.
Handles question answering, information collection, and mixed intents.
"""

from app.services.openai_client import openai_client
from app.models.user_context import UserContext
import structlog
from typing import List, Dict, Any, Optional

logger = structlog.get_logger()


class ConversationManager:
    """
    Manages conversation flow and generates natural responses.
    """
    
    def __init__(self):
        self.client = openai_client
    
    def generate_response_stream(
        self,
        message: str,
        intent: Dict[str, Any],
        conversation_history: List[Dict[str, str]],
        user_context: UserContext,
        kb_articles: Optional[List[Dict[str, Any]]] = None
    ):
        """
        Generate natural streaming response based on intent.
        
        Args:
            message: User's latest message
            intent: Classified intent with type and confidence
            conversation_history: Previous messages
            user_context: Current context
            kb_articles: KB articles (for question intent)
            
        Yields:
            str: Chunks of response text
        """
        intent_type = intent.get("intent", "information")
        
        logger.info(
            "generating_response",
            intent=intent_type,
            has_kb_articles=kb_articles is not None and len(kb_articles) > 0
        )
        
        try:
            # Build system prompt based on intent
            system_prompt = self._build_system_prompt(intent_type)
            
            # Build user prompt based on intent
            user_prompt = self._build_user_prompt(
                message=message,
                intent_type=intent_type,
                conversation_history=conversation_history,
                user_context=user_context,
                kb_articles=kb_articles
            )
            
            # Stream response
            chunk_count = 0
            for chunk in self.client.chat_completion_stream(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7,
                max_tokens=500
            ):
                chunk_count += 1
                yield chunk
            
            logger.info("response_stream_complete", chunks=chunk_count)
            
        except Exception as e:
            logger.error("response_generation_error", error=str(e))
            yield "I apologize, but I encountered an error. Could you please try again?"
    
    def _build_system_prompt(self, intent_type: str) -> str:
        """Build system prompt based on intent type."""
        
        base_prompt = """You are a warm, conversational AI assistant for the Stevie Awards.

YOUR PERSONALITY:
- Natural and friendly - like ChatGPT, not a scripted bot
- Conversational - use natural language, contractions, casual tone
- Helpful and knowledgeable about Stevie Awards
- Adaptive - follow the user's lead, don't force a script
- Memory-keeper - remember what they've told you

CONVERSATION STYLE:
- Talk like a human having a real conversation
- Use "I", "you", "we" naturally
- Don't number your questions or use bullet points unless listing categories
- Flow naturally between topics
- Acknowledge what they say before moving forward
- Be concise - 2-3 sentences max per response

INFORMATION GATHERING (do this naturally, not like a form):
- Start with: name, what they want to nominate (individual/team/org/product)
- Then: what's the achievement/story
- Naturally ask follow-up questions based on what they share
- Don't ask for info they've already given
- When you have enough, offer to find matching categories

WHEN YOU DON'T KNOW THE ANSWER:
- If you can't find information in the knowledge base or don't know the answer
- Tell them you can reach out to help@stevieawards.com for more detailed assistance
- Be honest about your limitations

IMPORTANT:
- Never repeat yourself
- Never ask the same question twice
- Keep responses SHORT and conversational
- Let the conversation flow naturally"""
        
        if intent_type == "question":
            return base_prompt + """

RIGHT NOW: They asked a question.
- Answer it naturally using the KB articles
- Keep it conversational and concise
- After answering, continue the conversation naturally"""
        
        elif intent_type == "information":
            return base_prompt + """

RIGHT NOW: They're sharing information.
- Acknowledge what they shared
- Ask a natural follow-up question if needed
- Don't be robotic or scripted
- Keep it SHORT - 1-2 sentences"""
        
        else:  # mixed
            return base_prompt + """

RIGHT NOW: They asked a question AND shared info.
- Answer their question first
- Acknowledge the info they shared
- Continue naturally"""
    
    def _build_user_prompt(
        self,
        message: str,
        intent_type: str,
        conversation_history: List[Dict[str, str]],
        user_context: UserContext,
        kb_articles: Optional[List[Dict[str, Any]]]
    ) -> str:
        """Build user prompt with context."""
        
        # Check if recommendations were just shown
        # Only check assistant messages that actually showed recommendations (long messages with category info)
        recent_messages = conversation_history[-4:] if len(conversation_history) >= 4 else conversation_history
        recommendations_shown = any(
            msg.get('role') == 'assistant' and 
            len(msg.get('content', '')) > 100 and
            ('matching categories' in msg.get('content', '').lower() or 
             '✨' in msg.get('content', '') or
             'here are' in msg.get('content', '').lower())
            for msg in recent_messages
        )
        
        # Build context summary (what we know so far)
        context_parts = []
        if user_context.organization_name:
            context_parts.append(f"Organization: {user_context.organization_name}")
        if user_context.nomination_subject:
            context_parts.append(f"Nominating: {user_context.nomination_subject}")
        if user_context.description:
            context_parts.append(f"About: {user_context.description[:150]}")
        
        context_summary = "\n".join(context_parts) if context_parts else "Just started conversation"
        
        # Build recent conversation (last 3 exchanges)
        history_lines = []
        for msg in conversation_history[-6:]:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            history_lines.append(f"{role.capitalize()}: {content}")
        
        history_summary = "\n".join(history_lines) if history_lines else "No previous messages"
        
        # If recommendations were just shown, change the prompt
        if recommendations_shown:
            return f"""RECOMMENDATIONS WERE JUST SHOWN!

WHAT WE KNOW:
{context_summary}

RECENT CONVERSATION:
{history_summary}

THEY SAID: "{message}"

The user just received category recommendations. DO NOT ask if they want recommendations again!

Instead:
- Ask if they want more details about any category
- Ask if they want to see more categories
- Ask if they have questions about the nomination process
- Offer to help with next steps

Keep it SHORT and helpful."""
        
        # Build prompt based on intent
        if intent_type == "question":
            kb_context = self._build_kb_context(kb_articles) if kb_articles else "No KB articles found"
            
            # Check if we have relevant KB articles
            has_relevant_kb = kb_articles is not None and len(kb_articles) > 0
            
            if has_relevant_kb:
                return f"""WHAT WE KNOW:
{context_summary}

RECENT CONVERSATION:
{history_summary}

THEIR QUESTION: "{message}"

KNOWLEDGE BASE INFO:
{kb_context}

Answer their question naturally and conversationally using the KB info above. Keep it SHORT (2-3 sentences)."""
            else:
                return f"""WHAT WE KNOW:
{context_summary}

RECENT CONVERSATION:
{history_summary}

THEIR QUESTION: "{message}"

NO RELEVANT KB ARTICLES FOUND.

The knowledge base doesn't have specific information about this question. Answer from your general knowledge about the Stevie Awards and business awards in general. Be helpful and conversational. Keep it SHORT (2-3 sentences).

If you don't know the answer, be honest and suggest they contact support or check the official Stevie Awards website."""
        
        elif intent_type == "information":
            # What info are we still missing?
            missing = []
            if not user_context.user_name:
                missing.append("their name")
            if not user_context.user_email:
                missing.append("their email")
            if not user_context.nomination_subject:
                missing.append("what they're nominating (individual/team/org/product)")
            if not user_context.description:
                missing.append("their achievement/story")
            
            missing_text = ", ".join(missing) if missing else "nothing - we have the basics!"
            
            return f"""WHAT WE KNOW:
{context_summary}

RECENT CONVERSATION:
{history_summary}

THEY JUST SAID: "{message}"

STILL NEED: {missing_text}

Respond naturally:
1. Acknowledge what they just shared (briefly!)
2. If we still need info, ask ONE natural follow-up question
3. If we have enough, offer to find matching categories
4. Keep it SHORT - 1-2 sentences max"""
        
        else:  # mixed
            kb_context = self._build_kb_context(kb_articles) if kb_articles else "No KB articles"
            has_relevant_kb = kb_articles is not None and len(kb_articles) > 0
            
            if has_relevant_kb:
                return f"""WHAT WE KNOW:
{context_summary}

RECENT CONVERSATION:
{history_summary}

THEY SAID: "{message}"

KB INFO:
{kb_context}

They asked a question AND shared info. Respond naturally:
1. Answer their question first (use KB info)
2. Acknowledge the info they shared
3. Continue the conversation naturally
Keep it SHORT and conversational."""
            else:
                return f"""WHAT WE KNOW:
{context_summary}

RECENT CONVERSATION:
{history_summary}

THEY SAID: "{message}"

NO RELEVANT KB ARTICLES FOUND.

They asked a question AND shared info. Respond naturally:
1. Answer their question first (use general knowledge about Stevie Awards)
2. Acknowledge the info they shared
3. Continue the conversation naturally
Keep it SHORT and conversational.

If you don't know the answer to their question, be honest and suggest they check the official Stevie Awards website."""
    
    def _build_kb_context(self, articles: Optional[List[Dict[str, Any]]]) -> str:
        """Build KB context from articles."""
        if not articles:
            return "No relevant articles found"
        
        context_parts = []
        for i, article in enumerate(articles[:3], 1):  # Top 3 articles
            title = article.get("title", "Untitled")
            content = article.get("content", "")
            program = article.get("program", "General")
            
            context_parts.append(f"[Source {i} - {program}]")
            context_parts.append(f"Title: {title}")
            context_parts.append(f"Content: {content[:500]}")  # Truncate long content
            context_parts.append("")
        
        return "\n".join(context_parts)


# Global instance
conversation_manager = ConversationManager()
