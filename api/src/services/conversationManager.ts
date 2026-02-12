import { openaiService } from './openaiService';
import logger from '../utils/logger';

/**
 * Conversation Manager Service
 * 
 * Generates natural, streaming responses based on user intent.
 * Handles question answering, information collection, and mixed intents.
 */
export class ConversationManager {
  /**
   * Generate streaming response based on intent
   */
  async *generateResponseStream(params: {
    message: string;
    intent: { intent: string; confidence: number; reasoning?: string };
    conversationHistory: Array<{ role: string; content: string }>;
    userContext: any;
    kbArticles?: Array<any> | null;
  }): AsyncGenerator<string, void, unknown> {
    const { message, intent, conversationHistory, userContext, kbArticles } = params;

    const intentType = intent.intent;

    logger.info('generating_response', {
      intent: intentType,
      has_kb_articles: kbArticles !== null && kbArticles !== undefined && kbArticles.length > 0,
    });

    try {
      // Build system prompt
      const systemPrompt = this.buildSystemPrompt(intentType);

      // Build user prompt
      const userPrompt = this.buildUserPrompt({
        message,
        intentType,
        conversationHistory,
        userContext,
        kbArticles,
      });

      // Stream response
      let chunkCount = 0;
      for await (const chunk of openaiService.chatCompletionStream({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        maxTokens: 500,
      })) {
        chunkCount++;
        yield chunk;
      }

      logger.info('response_stream_complete', { chunks: chunkCount });
    } catch (error: any) {
      logger.error('response_generation_error', { error: error.message });
      yield 'I apologize, but I encountered an error. Could you please try again?';
    }
  }

  /**
   * Build system prompt based on intent
   */
  private buildSystemPrompt(intentType: string): string {
    const basePrompt = `You are a warm, conversational AI assistant for the Stevie Awards.

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
- Tell them to check stevieawards.com or reach out to help@stevieawards.com
- Be honest about your limitations
- NEVER guess or make up facts, dates, deadlines, fees, or eligibility rules

IMPORTANT:
- Never repeat yourself
- Never ask the same question twice
- Keep responses SHORT and conversational
- Let the conversation flow naturally`;

    if (intentType === 'recommendation') {
      return basePrompt + `

RIGHT NOW: They want category recommendations.
- This is great! But we need specific information first
- Ask for missing information in this order:
  1. Their name (if missing)
  2. Their email (if missing)
  3. What they're nominating: individual/team/organization/product (if missing)
  4. Description of the achievement (if missing or too short)
- Ask for ONE thing at a time, naturally
- Once you have all four, I'll generate personalized recommendations
- Keep it conversational and encouraging`;
    } else if (intentType === 'question') {
      return basePrompt + `

RIGHT NOW: They asked a question.
- Answer it naturally using ONLY the KB articles provided
- If no KB articles are provided or they don't cover the question, say you don't have that info and suggest stevieawards.com or help@stevieawards.com
- Keep it conversational and concise
- After answering, continue the conversation naturally`;
    } else if (intentType === 'information') {
      return basePrompt + `

RIGHT NOW: They're sharing information.
- Acknowledge what they shared
- Ask a natural follow-up question if needed
- Don't be robotic or scripted
- Keep it SHORT - 1-2 sentences`;
    } else {
      // mixed
      return basePrompt + `

RIGHT NOW: They asked a question AND shared info.
- Answer their question first using ONLY KB articles provided
- If no KB info available, honestly say so and suggest stevieawards.com or help@stevieawards.com
- Acknowledge the info they shared
- Continue naturally`;
    }
  }

  /**
   * Build user prompt with context
   */
  private buildUserPrompt(params: {
    message: string;
    intentType: string;
    conversationHistory: Array<{ role: string; content: string }>;
    userContext: any;
    kbArticles?: Array<any> | null;
  }): string {
    const { message, intentType, conversationHistory, userContext, kbArticles } = params;

    // Check if recommendations were just shown
    const recent = conversationHistory.slice(-4);
    const recommendationsShown = recent.some(
      (msg) =>
        msg.role === 'assistant' &&
        msg.content.length > 100 &&
        (msg.content.toLowerCase().includes('matching categories') ||
          msg.content.includes('✨') ||
          msg.content.toLowerCase().includes('here are'))
    );

    // Build context summary
    const contextParts: string[] = [];
    if (userContext.organization_name) {
      contextParts.push(`Organization: ${userContext.organization_name}`);
    }
    if (userContext.nomination_subject) {
      contextParts.push(`Nominating: ${userContext.nomination_subject}`);
    }
    if (userContext.description) {
      contextParts.push(`About: ${userContext.description.substring(0, 150)}`);
    }
    const contextSummary = contextParts.length > 0 ? contextParts.join('\n') : 'Just started conversation';

    // Build recent conversation
    const historyLines = conversationHistory.slice(-6).map((msg) => {
      const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
      return `${role}: ${msg.content}`;
    });
    const historySummary = historyLines.length > 0 ? historyLines.join('\n') : 'No previous messages';

    // If recommendations were just shown
    if (recommendationsShown) {
      return `RECOMMENDATIONS WERE JUST SHOWN!

WHAT WE KNOW:
${contextSummary}

RECENT CONVERSATION:
${historySummary}

THEY SAID: "${message}"

The user just received category recommendations. DO NOT ask if they want recommendations again!

Instead:
- Ask if they want more details about any category
- Ask if they want to see more categories
- Ask if they have questions about the nomination process
- Offer to help with next steps

Keep it SHORT and helpful.`;
    }

    // Build prompt based on intent
    if (intentType === 'recommendation') {
      // Special handling for recommendation intent - guide through required fields
      const missing: string[] = [];
      if (!userContext.user_name) missing.push('name');
      if (!userContext.user_email) missing.push('email');
      if (!userContext.nomination_subject) missing.push('nomination subject (individual/team/org/product)');
      if (!userContext.description || userContext.description.length < 20) missing.push('achievement description');

      if (missing.length > 0) {
        return `WHAT WE KNOW:
${contextSummary}

RECENT CONVERSATION:
${historySummary}

THEY SAID: "${message}"

THEY WANT RECOMMENDATIONS!

STILL NEED: ${missing.join(', ')}

Ask for the FIRST missing item from this list in order:
1. Name
2. Email  
3. What they're nominating (individual/team/organization/product)
4. Achievement description

Ask naturally and conversationally. ONE question at a time. Keep it SHORT (1-2 sentences).`;
      } else {
        return `WHAT WE KNOW:
${contextSummary}

RECENT CONVERSATION:
${historySummary}

THEY SAID: "${message}"

GREAT NEWS: We have all required info (name, email, nomination subject, description)!

Respond with: "Perfect! Let me find the best matching categories for you." 

Keep it SHORT and positive. The system will automatically generate recommendations after your response.`;
      }
    } else if (intentType === 'question') {
      const kbContext = this.buildKBContext(kbArticles);
      const hasRelevantKB = kbArticles && kbArticles.length > 0;

      if (hasRelevantKB) {
        return `WHAT WE KNOW:
${contextSummary}

RECENT CONVERSATION:
${historySummary}

THEIR QUESTION: "${message}"

KNOWLEDGE BASE INFO:
${kbContext}

Answer their question naturally and conversationally using ONLY the KB info above. Keep it SHORT (2-3 sentences). If the KB info doesn't fully cover the question, say so and suggest checking stevieawards.com.`;
      } else {
        return `WHAT WE KNOW:
${contextSummary}

RECENT CONVERSATION:
${historySummary}

THEIR QUESTION: "${message}"

NO RELEVANT KB ARTICLES FOUND.

You do NOT have information to answer this question. DO NOT guess or use general knowledge.

Respond naturally with something like: "I don't have specific information about that in my knowledge base. I'd recommend checking stevieawards.com or reaching out to help@stevieawards.com for the most accurate details."

DO NOT provide specific facts, dates, deadlines, fees, or eligibility details. You have NO knowledge base articles — so provide NO specifics. Just politely decline and redirect.`;
      }
    } else if (intentType === 'information') {
      // What info are we still missing?
      const missing: string[] = [];
      if (!userContext.user_name) missing.push('their name');
      if (!userContext.user_email) missing.push('their email');
      if (!userContext.nomination_subject) missing.push('what they\'re nominating (individual/team/org/product)');
      if (!userContext.description) missing.push('their achievement/story');

      const missingText = missing.length > 0 ? missing.join(', ') : 'nothing - we have the basics!';

      return `WHAT WE KNOW:
${contextSummary}

RECENT CONVERSATION:
${historySummary}

THEY JUST SAID: "${message}"

STILL NEED: ${missingText}

Respond naturally:
1. Acknowledge what they just shared (briefly!)
2. If we still need info, ask ONE natural follow-up question
3. If we have enough, offer to find matching categories
4. Keep it SHORT - 1-2 sentences max`;
    } else {
      // mixed
      const kbContext = this.buildKBContext(kbArticles);
      const hasRelevantKB = kbArticles && kbArticles.length > 0;

      if (hasRelevantKB) {
        return `WHAT WE KNOW:
${contextSummary}

RECENT CONVERSATION:
${historySummary}

THEY SAID: "${message}"

KB INFO:
${kbContext}

They asked a question AND shared info. Respond naturally:
1. Answer their question first (use ONLY the KB info above)
2. Acknowledge the info they shared
3. Continue the conversation naturally
Keep it SHORT and conversational.`;
      } else {
        return `WHAT WE KNOW:
${contextSummary}

RECENT CONVERSATION:
${historySummary}

THEY SAID: "${message}"

NO RELEVANT KB ARTICLES FOUND.

They asked a question AND shared info. Respond naturally:
1. For the question: You do NOT have knowledge base information to answer it. DO NOT guess. Say you don't have that info and suggest stevieawards.com or help@stevieawards.com.
2. Acknowledge the info they shared.
3. Continue the conversation naturally.
Keep it SHORT. DO NOT invent facts, dates, deadlines, or eligibility details.`;
      }
    }
  }

  /**
   * Build KB context from articles
   */
  private buildKBContext(articles?: Array<any> | null): string {
    if (!articles || articles.length === 0) {
      return 'No relevant articles found';
    }

    const contextParts: string[] = [];
    const topArticles = articles.slice(0, 3);

    for (let i = 0; i < topArticles.length; i++) {
      const article = topArticles[i];
      const title = article.title || 'Untitled';
      const content = article.content || '';
      const program = article.program || 'General';

      contextParts.push(`[Source ${i + 1} - ${program}]`);
      contextParts.push(`Title: ${title}`);
      contextParts.push(`Content: ${content.substring(0, 500)}`);
      contextParts.push('');
    }

    return contextParts.join('\n');
  }
}

// Export singleton instance
export const conversationManager = new ConversationManager();
