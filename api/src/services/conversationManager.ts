import { openaiService } from './openaiService';
import logger from '../utils/logger';
import {
  DEMOGRAPHIC_STEPS,
  getFirstMissingStep,
  STEP_TO_CONTEXT_KEY,
} from './demographicQuestions';

/**
 * Conversation Manager Service
 * 
 * Generates natural, streaming responses based on user intent.
 * Handles question answering, information collection, and mixed intents.
 */
export class ConversationManager {
  /**
   * Generate streaming response based on context
   */
  async *generateResponseStream(params: {
    message: string;
    context: { context: string; confidence: number; reasoning?: string };
    conversationHistory: Array<{ role: string; content: string }>;
    userContext: any;
    kbArticles?: Array<any> | null;
  }): AsyncGenerator<string, void, unknown> {
    const { message, context, conversationHistory, userContext, kbArticles } = params;

    const contextType = context.context;

    logger.info('generating_response', {
      context: contextType,
      has_kb_articles: kbArticles !== null && kbArticles !== undefined && kbArticles.length > 0,
    });

    try {
      // Build system prompt
      const systemPrompt = this.buildSystemPrompt(contextType);

      // Build user prompt
      const userPrompt = this.buildUserPrompt({
        message,
        contextType,
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
   * Build system prompt based on context
   */
  private buildSystemPrompt(contextType: string): string {
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
- NEVER ask for information we already have - check "WHAT WE KNOW" section carefully

INFORMATION GATHERING (conversational demographic layer — do NOT feel like a form):
- Ask ONE question at a time, in the exact order the system specifies
- Use the umbrella-style question phrasing provided (e.g. "Where are you based, and where does most of your work or business happen?")
- Acknowledge what they said before asking the next thing
- Don't ask for info they've already given - ALWAYS check what we know first
- When all required demographics are collected, offer to find matching categories (and optionally a brief achievement description for better matches)

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

    if (contextType === 'recommendation') {
      return basePrompt + `

RIGHT NOW: They want category recommendations.
- We collect demographics in a set order so we can recommend the right Stevie programs (American, International, Technology Excellence, Women in Business, etc.).
- The system will tell you EXACTLY which piece of info to ask for next and the umbrella question to use. Ask for ONE thing at a time.
- Use the exact umbrella phrasing when given — it's designed to feel natural and get the right info for program routing.
- Optional question (women-in-business programs): ask only when it's the next in order; if they skip or say no, that's fine.
- ACHIEVEMENT DESCRIPTION: When asking about achievements, encourage them to share 3-4 key points: (1) What they accomplished, (2) Impact/results, (3) Innovation/uniqueness, (4) Challenges overcome. Let them answer naturally over multiple messages if needed.
- Once we have all required demographics INCLUDING achievement description, the system will auto-generate recommendations.
- Keep it conversational and encouraging. Never number your questions or sound like a form.`;
    } else {
      // qa context
      return basePrompt + `

RIGHT NOW: They asked a question about Stevie Awards.
- Answer using ONLY the KB articles provided
- If no KB articles or they don't cover the question, say you don't have that info and suggest stevieawards.com or help@stevieawards.com
- Keep it conversational and concise
- After answering, continue naturally`;
    }
  }

  /**
   * Build user prompt with context
   */
  private buildUserPrompt(params: {
    message: string;
    contextType: string;
    conversationHistory: Array<{ role: string; content: string }>;
    userContext: any;
    kbArticles?: Array<any> | null;
  }): string {
    const { message, contextType, conversationHistory, userContext, kbArticles } = params;

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

    // Build context summary (include all demographic + optional fields we have)
    const contextParts: string[] = [];
    if (userContext.user_name) contextParts.push(`Name: ${userContext.user_name}`);
    if (userContext.user_email) contextParts.push(`Email: ${userContext.user_email}`);
    if (userContext.geography) contextParts.push(`Location/region: ${userContext.geography}`);
    if (userContext.org_type) contextParts.push(`Org type: ${userContext.org_type}`);
    if (userContext.career_stage) contextParts.push(`Career stage: ${userContext.career_stage}`);
    if (userContext.gender_programs_opt_in !== undefined) contextParts.push(`Consider women-in-business programs: ${userContext.gender_programs_opt_in ? 'yes' : 'no'}`);
    if (userContext.company_age) contextParts.push(`Company age: ${userContext.company_age}`);
    if (userContext.org_size) contextParts.push(`Team size: ${userContext.org_size}`);
    if (userContext.tech_orientation) contextParts.push(`Tech orientation: ${userContext.tech_orientation}`);
    if (userContext.recognition_scope) contextParts.push(`Recognition scope: ${userContext.recognition_scope}`);
    if (userContext.nomination_subject) contextParts.push(`Nominating: ${userContext.nomination_subject}`);
    if (userContext.organization_name) contextParts.push(`Organization: ${userContext.organization_name}`);
    if (userContext.description) contextParts.push(`About: ${userContext.description.substring(0, 150)}`);
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

    // Build prompt based on context
    if (contextType === 'recommendation') {
      const nextStep = getFirstMissingStep(userContext, true);
      const missingLabels: string[] = [];
      for (const step of DEMOGRAPHIC_STEPS) {
        const key = STEP_TO_CONTEXT_KEY[step.id];
        const val = userContext[key];
        if (val === undefined || val === null || val === '') missingLabels.push(step.label);
      }

      logger.info('conversation_manager_state', {
        next_step: nextStep?.id || 'none',
        missing_count: missingLabels.length,
        has_fields: Object.keys(userContext).filter(k => userContext[k] !== undefined && userContext[k] !== null && userContext[k] !== ''),
      });

      if (nextStep !== null) {
        // Build a very strict, simple prompt that forces exact question usage
        return `CONTEXT: User is in recommendation flow. They just said: "${message}"

WHAT WE ALREADY HAVE:
${contextSummary}

NEXT REQUIRED FIELD: ${nextStep.label}

YOUR RESPONSE MUST BE EXACTLY:
1. One sentence acknowledging their answer
2. Then ask this EXACT question (copy it word-for-word):

"${nextStep.umbrellaQuestion}"

DO NOT:
- Ask about "maturity level" or any other field not listed
- Rephrase the question
- Ask for information we already have
- Repeat questions

EXAMPLE RESPONSE:
"Thanks for sharing that! ${nextStep.umbrellaQuestion}"

NOW RESPOND:`;
      }

      return `WHAT WE KNOW:
${contextSummary}

RECENT CONVERSATION:
${historySummary}

THEY SAID: "${message}"

We have all required info (name, email, nomination subject, achievement description) to generate category recommendations!

Respond warmly in 1-2 sentences. Tell them you have what you need and ASK if they'd like you to find matching categories now. Make it a clear yes/no question.

Example: "Perfect! I have everything I need. Would you like me to find the best matching Stevie Award categories for your nomination?"`;
    } else {
      // qa context
      const kbContext = this.buildKBContext(kbArticles);
      const hasRelevantKB = kbArticles !== null && kbArticles !== undefined && kbArticles.length > 0;

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
