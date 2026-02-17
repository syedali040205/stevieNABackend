import { openaiService } from './openaiService';
import logger from '../utils/logger';
import { getFirstMissingStep } from './demographicQuestions';

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
    signal?: AbortSignal;
  }): AsyncGenerator<string, void, unknown> {
    const { message, context, conversationHistory, userContext, kbArticles, signal } = params;

    const contextType = context.context;

    logger.info('generating_response', {
      context: contextType,
      has_kb_articles: kbArticles !== null && kbArticles !== undefined && kbArticles.length > 0,
    });

    try {
      const systemPrompt = this.buildSystemPrompt(contextType);

      const userPrompt = this.buildUserPrompt({
        message,
        contextType,
        conversationHistory,
        userContext,
        kbArticles,
      });

      let chunkCount = 0;
      for await (const chunk of openaiService.chatCompletionStream({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        maxTokens: 500,
        signal,
      })) {
        chunkCount++;
        yield chunk;
      }

      logger.info('response_stream_complete', { chunks: chunkCount });
    } catch (error: any) {
      if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
        logger.info('response_generation_aborted');
        return;
      }
      logger.error('response_generation_error', { error: error.message });
      yield 'I apologize, but I encountered an error. Could you please try again?';
    }
  }

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
- Use the umbrella-style question phrasing provided
- Acknowledge what they said before asking the next thing
- Don't ask for info they've already given - ALWAYS check what we know first

WHEN YOU DON'T KNOW THE ANSWER:
- Answer from the KB articles when provided
- If you don't have the info, redirect to stevieawards.com or help@stevieawards.com
- NEVER guess or make up facts

IMPORTANT:
- Never repeat yourself
- Never ask the same question twice
- Keep responses SHORT and conversational`;

    if (contextType === 'recommendation') {
      return (
        basePrompt +
        `

RIGHT NOW: They want category recommendations.
- Collect demographics in the system-defined order.
- Use the exact umbrella phrasing when given.
- Ask ONE question at a time.`
      );
    }

    return (
      basePrompt +
      `

RIGHT NOW: They asked a question about Stevie Awards.
- Answer using ONLY the KB articles provided.
- If no KB articles, politely decline and redirect.`
    );
  }

  private buildUserPrompt(params: {
    message: string;
    contextType: string;
    conversationHistory: Array<{ role: string; content: string }>;
    userContext: any;
    kbArticles?: Array<any> | null;
  }): string {
    const { message, contextType, conversationHistory, userContext, kbArticles } = params;

    const recent = conversationHistory.slice(-4);
    const recommendationsShown = recent.some(
      (msg) =>
        msg.role === 'assistant' &&
        msg.content.length > 100 &&
        (msg.content.toLowerCase().includes('matching categories') ||
          msg.content.includes('✨') ||
          msg.content.toLowerCase().includes('here are'))
    );

    const contextParts: string[] = [];
    if (userContext.user_name) contextParts.push(`Name: ${userContext.user_name}`);
    if (userContext.user_email) contextParts.push(`Email: ${userContext.user_email}`);
    if (userContext.geography) contextParts.push(`Location/region: ${userContext.geography}`);
    if (userContext.org_type) contextParts.push(`Org type: ${userContext.org_type}`);
    if (userContext.career_stage) contextParts.push(`Career stage: ${userContext.career_stage}`);
    if (userContext.gender_programs_opt_in !== undefined)
      contextParts.push(
        `Consider women-in-business programs: ${userContext.gender_programs_opt_in ? 'yes' : 'no'}`
      );
    if (userContext.company_age) contextParts.push(`Company age: ${userContext.company_age}`);
    if (userContext.org_size) contextParts.push(`Team size: ${userContext.org_size}`);
    if (userContext.tech_orientation) contextParts.push(`Tech orientation: ${userContext.tech_orientation}`);
    if (userContext.recognition_scope) contextParts.push(`Recognition scope: ${userContext.recognition_scope}`);
    if (userContext.nomination_subject) contextParts.push(`Nominating: ${userContext.nomination_subject}`);
    if (userContext.organization_name) contextParts.push(`Organization: ${userContext.organization_name}`);
    if (userContext.description) contextParts.push(`About: ${userContext.description.substring(0, 150)}`);
    const contextSummary = contextParts.length > 0 ? contextParts.join('\n') : 'Just started conversation';

    const historyLines = conversationHistory.slice(-6).map((msg) => {
      const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
      return `${role}: ${msg.content}`;
    });
    const historySummary = historyLines.length > 0 ? historyLines.join('\n') : 'No previous messages';

    if (recommendationsShown) {
      return `RECOMMENDATIONS WERE JUST SHOWN!

WHAT WE KNOW:
${contextSummary}

RECENT CONVERSATION:
${historySummary}

THEY SAID: "${message}"

The user just received category recommendations. Do NOT ask if they want recommendations again.
Ask if they want more details on any category or next steps.`;
    }

    if (contextType === 'recommendation') {
      const nextStep = getFirstMissingStep(userContext, true);

      if (nextStep !== null) {
        return `CONTEXT: User is in recommendation flow. They just said: "${message}"

WHAT WE ALREADY HAVE:
${contextSummary}

NEXT REQUIRED FIELD: ${nextStep.label}

YOUR RESPONSE MUST BE:
1) One sentence acknowledging their answer
2) Then ask this EXACT question (copy word-for-word):
"${nextStep.umbrellaQuestion}"

NOW RESPOND:`;
      }

      return `WHAT WE KNOW:
${contextSummary}

RECENT CONVERSATION:
${historySummary}

THEY SAID: "${message}"

We have all required info. Ask if they'd like you to find matching categories now (yes/no).`;
    }

    // qa
    const hasRelevantKB = kbArticles !== null && kbArticles !== undefined && kbArticles.length > 0;

    if (hasRelevantKB) {
      const kbContext = this.buildKBContext(kbArticles);
      return `WHAT WE KNOW:
${contextSummary}

RECENT CONVERSATION:
${historySummary}

THEIR QUESTION: "${message}"

KNOWLEDGE BASE INFO:
${kbContext}

Answer using ONLY the KB info. Keep it SHORT (2-3 sentences).`;
    }

    return `WHAT WE KNOW:
${contextSummary}

RECENT CONVERSATION:
${historySummary}

THEIR QUESTION: "${message}"

NO RELEVANT KB ARTICLES FOUND.

Politely say you don't have that info in your KB and redirect to stevieawards.com or help@stevieawards.com. Do NOT guess.`;
  }

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

export const conversationManager = new ConversationManager();
