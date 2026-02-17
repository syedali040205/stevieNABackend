import { openaiService } from './openaiService';
import logger from '../utils/logger';
import { getFirstMissingStep } from './demographicQuestions';

export class ConversationManager {
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

    // Deterministic questionnaire for recommendation mode.
    if (contextType === 'recommendation') {
      const next = getFirstMissingStep(userContext);
      if (next) {
        // Keep it short; avoid LLM drift.
        const alreadyChatted = (conversationHistory?.length ?? 0) > 0;
        const ack = alreadyChatted ? 'Got it. ' : '';
        yield `${ack}${next.question}`;
        return;
      }

      // All required intake complete. The service will generate recommendations.
      yield "Perfect — I’ve got everything I need. Give me a moment to pull the best matching categories.";
      return;
    }

    // QA mode remains LLM-driven but grounded on KB context.
    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt({ message, conversationHistory, userContext, kbArticles });

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

  private buildSystemPrompt(): string {
    return `You are a warm, conversational AI assistant for the Stevie Awards.
- Answer using ONLY the KB articles provided.
- If the KB doesn’t cover the question, say you don’t have that info and suggest stevieawards.com or help@stevieawards.com.
- Keep responses SHORT (2-3 sentences).`;
  }

  private buildUserPrompt(params: {
    message: string;
    conversationHistory: Array<{ role: string; content: string }>;
    userContext: any;
    kbArticles?: Array<any> | null;
  }): string {
    const { message, conversationHistory, userContext, kbArticles } = params;

    const contextParts: string[] = [];
    if (userContext.user_name) contextParts.push(`Name: ${userContext.user_name}`);
    if (userContext.user_email) contextParts.push(`Email: ${userContext.user_email}`);
    if (userContext.geography) contextParts.push(`Geography: ${userContext.geography}`);

    const contextSummary = contextParts.length > 0 ? contextParts.join('\n') : 'No context';

    const historyLines = conversationHistory.slice(-6).map((msg) => {
      const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
      return `${role}: ${msg.content}`;
    });
    const historySummary = historyLines.length > 0 ? historyLines.join('\n') : 'No previous messages';

    const hasRelevantKB = kbArticles !== null && kbArticles !== undefined && kbArticles.length > 0;
    const kbText = hasRelevantKB ? this.buildKBContext(kbArticles) : 'No relevant articles found';

    return `WHAT WE KNOW:\n${contextSummary}\n\nRECENT CONVERSATION:\n${historySummary}\n\nTHEIR QUESTION: "${message}"\n\nKNOWLEDGE BASE INFO:\n${kbText}\n\nAnswer using ONLY the KB info. If not covered, redirect to stevieawards.com or help@stevieawards.com.`;
  }

  private buildKBContext(articles?: Array<any> | null): string {
    if (!articles || articles.length === 0) return 'No relevant articles found';

    const top = articles.slice(0, 3);
    return top
      .map((a, idx) => {
        const title = a.title || 'Untitled';
        const program = a.program || 'General';
        const content = (a.content || '').substring(0, 500);
        return `[Source ${idx + 1} - ${program}]\nTitle: ${title}\nContent: ${content}`;
      })
      .join('\n\n');
  }
}

export const conversationManager = new ConversationManager();
