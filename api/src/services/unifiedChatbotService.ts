import { getSupabaseClient } from '../config/supabase';
import logger from '../utils/logger';
import { SessionManager } from './sessionManager';
import { userProfileManager } from './userProfileManager';
import { recommendationEngine } from './recommendationEngine';
import { cacheManager } from './cacheManager';
import { pineconeClient } from './pineconeClient';
import { openaiService } from './openaiService';
import { contextClassifier } from './contextClassifier';
import { conversationManager } from './conversationManager';
import { fieldExtractor } from './fieldExtractor';
import { hasRequiredDemographics, normalizeSkippableAnswer } from './demographicQuestions';
import crypto from 'crypto';

export class UnifiedChatbotService {
  private supabase = getSupabaseClient();
  private sessionManager = new SessionManager();
  private readonly KB_CACHE_PREFIX = 'kb_search:';
  private readonly KB_CACHE_TTL = 3600;
  private readonly MAX_CONVERSATION_HISTORY = 40;

  private getKBCacheKey(message: string): string {
    const normalized = message
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '');

    const hash = crypto.createHash('md5').update(normalized).digest('hex');
    return `${this.KB_CACHE_PREFIX}${hash}`;
  }

  private enrichContextFromConversation(context: any, currentMessage: string, conversationHistory: any[]): any {
    const enrichedContext = { ...context };
    const messageLower = currentMessage.toLowerCase();

    // nomination_subject
    const setNomination = (value: 'individual' | 'team' | 'organization' | 'product') => {
      if (!enrichedContext.nomination_subject) {
        enrichedContext.nomination_subject = value;
        logger.info('enriched_nomination_subject', { value, source: 'keyword' });
      }
    };

    if (messageLower === 'team' || messageLower.includes(' our team') || messageLower.includes('my team')) {
      setNomination('team');
    } else if (messageLower === 'product' || messageLower.includes(' our product')) {
      setNomination('product');
    } else if (messageLower.includes('nominate myself') || messageLower === 'individual') {
      setNomination('individual');
    } else if (messageLower.includes('organization')) {
      setNomination('organization');
    }

    // geography
    if (!enrichedContext.geography) {
      const commonCountries = [
        'india',
        'pakistan',
        'usa',
        'united states',
        'uk',
        'united kingdom',
        'canada',
        'australia',
        'germany',
        'france',
        'uae',
        'dubai',
        'china',
        'japan',
        'singapore',
      ];
      for (const country of commonCountries) {
        if (
          messageLower === country ||
          messageLower.includes(`from ${country}`) ||
          messageLower.includes(`in ${country}`) ||
          messageLower.includes(`based in ${country}`)
        ) {
          enrichedContext.geography = country.charAt(0).toUpperCase() + country.slice(1);
          logger.info('enriched_geography', { value: enrichedContext.geography, source: 'keyword' });
          break;
        }
      }
    }

    const sizeNumber = (txt: string): number | null => {
      const m = txt.trim().match(/(\d{1,6})/);
      if (!m) return null;
      const n = parseInt(m[1], 10);
      return Number.isFinite(n) ? n : null;
    };

    // team_size + company_size
    if (!enrichedContext.team_size) {
      const n = sizeNumber(currentMessage);
      if (n !== null && currentMessage.trim().length <= 40) {
        enrichedContext.team_size = n;
        logger.info('enriched_team_size', { value: n, source: 'pattern_match' });
      }
    } else if (!enrichedContext.company_size) {
      const n = sizeNumber(currentMessage);
      if (n !== null && currentMessage.trim().length <= 40) {
        enrichedContext.company_size = n;
        logger.info('enriched_company_size', { value: n, source: 'pattern_match' });
      }
    }

    // description
    const hasAskedForDescription = conversationHistory.some(
      (msg) => msg.role === 'assistant' && msg.content.toLowerCase().includes('tell me about the achievement')
    );
    if (hasAskedForDescription && (!enrichedContext.description || enrichedContext.description.length < 50)) {
      const userMessages = conversationHistory
        .filter((m) => m.role === 'user')
        .map((m) => m.content)
        .join(' ');
      const fullDescription = `${userMessages} ${currentMessage}`.trim();
      if (fullDescription.length > 50) {
        enrichedContext.description = fullDescription.substring(0, 800);
      }
    }

    return enrichedContext;
  }

  /**
   * If the last assistant message was a follow-up question and the user says skip/n/a/etc,
   * persist __skipped__ so the deterministic flow can move on.
   */
  private applySkipForFollowups(userContext: any, message: string, conversationHistory: any[]): any {
    if (!conversationHistory || conversationHistory.length === 0) return userContext;

    const lastAssistant = [...conversationHistory].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) return userContext;

    const { skipped, value } = normalizeSkippableAnswer(message);
    if (!skipped) return userContext;

    const q = lastAssistant.content.toLowerCase();

    const updated = { ...userContext };
    if (q.includes('measurable impact') && !updated.achievement_impact) updated.achievement_impact = value;
    if (q.includes('innovative or unique') && !updated.achievement_innovation) updated.achievement_innovation = value;
    if (q.includes('challenges you overcame') && !updated.achievement_challenges) updated.achievement_challenges = value;

    return updated;
  }

  private mapCountryToGeography(country: string): string | null {
    if (!country) return null;
    const countryLower = country.toLowerCase().trim();
    if (countryLower === 'usa' || countryLower === 'united states' || countryLower === 'united states of america') return 'usa';
    if (countryLower === 'canada') return 'canada';
    return 'worldwide';
  }

  async *chat(params: { sessionId: string; message: string; userId?: string; signal?: AbortSignal }): AsyncGenerator<any, void, unknown> {
    const { sessionId, message, userId, signal } = params;

    logger.info('unified_chat_request', { session_id: sessionId, message_length: message.length });

    try {
      let session = await this.sessionManager.getSession(sessionId);

      if (!session) {
        const effectiveUserId = userId || null;
        const expiresAt = new Date(Date.now() + 3600000);

        let initialContext: any = { geography: null, organization_name: null, job_title: null };
        if (userId) {
          try {
            const profile = await userProfileManager.getProfile(userId);
            if (profile) {
              initialContext = {
                geography: this.mapCountryToGeography(profile.country),
                organization_name: profile.organization_name,
                job_title: profile.job_title || null,
              };
            }
          } catch (e: any) {
            logger.error('failed_to_load_profile', { user_id: userId, error: e.message });
          }
        }

        const { data, error } = await this.supabase
          .from('user_sessions')
          .insert({
            id: sessionId,
            user_id: effectiveUserId,
            session_data: { user_context: initialContext, conversation_history: [] },
            conversation_state: 'collecting_org_type',
            expires_at: expiresAt.toISOString(),
          })
          .select()
          .single();

        if (error) throw new Error(`Failed to create session: ${error.message}`);
        if (!data) throw new Error('Failed to create session: No data returned');
        session = data as any;
      }

      if (!session) throw new Error('Session creation failed unexpectedly');

      let userContext = session.session_data.user_context;
      const conversationHistory = session.session_data.conversation_history || [];

      logger.info('step_1_parallel_processing');
      const [context, extractedFields] = await Promise.all([
        contextClassifier.classifyContext({ message, conversationHistory, currentContext: undefined, userContext, signal }),
        fieldExtractor.extractFields({ message, userContext, conversationHistory, signal }),
      ]);

      if (context.context === 'recommendation') {
        userContext = { ...userContext };
      }

      yield { type: 'intent', intent: context.context, confidence: context.confidence };

      let kbArticles: any[] | null = null;
      if (context.context === 'qa') kbArticles = await this.searchKB(message, signal);

      if (extractedFields && Object.keys(extractedFields).length > 0) {
        userContext = { ...userContext, ...extractedFields };
      }

      userContext = this.applySkipForFollowups(userContext, message, conversationHistory);
      userContext = this.enrichContextFromConversation(userContext, message, conversationHistory);

      let assistantResponse = '';
      for await (const chunk of conversationManager.generateResponseStream({
        message,
        context,
        conversationHistory,
        userContext,
        kbArticles,
        signal,
      })) {
        assistantResponse += chunk;
        yield { type: 'chunk', content: chunk };
      }

      const ready = context.context === 'recommendation' && hasRequiredDemographics(userContext);
      if (ready) {
        yield { type: 'status', message: 'Generating personalized category recommendations...' };

        const contextForRecommendations = {
          ...userContext,
          org_type: userContext.org_type || 'for_profit',
          org_size: userContext.org_size || 'small',
          achievement_focus: userContext.achievement_focus || ['Innovation'],
        };

        const recommendations = await recommendationEngine.generateRecommendations(contextForRecommendations as any, {
          limit: 15,
          includeExplanations: true,
        });

        yield { type: 'recommendations', data: recommendations, count: recommendations.length };
      }

      const fullHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [
        ...conversationHistory,
        { role: 'user' as const, content: message },
        { role: 'assistant' as const, content: assistantResponse || '(No response)' },
      ];
      const updatedHistory =
        fullHistory.length > this.MAX_CONVERSATION_HISTORY ? fullHistory.slice(-this.MAX_CONVERSATION_HISTORY) : fullHistory;

      await this.sessionManager.updateSession(
        sessionId,
        { user_context: userContext, conversation_history: updatedHistory },
        session.conversation_state as any
      );

      logger.info('unified_chat_complete');
    } catch (error: any) {
      if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') throw error;
      logger.error('unified_chat_error', { error: error.message, stack: error.stack });
      throw new Error(`Failed to process chat: ${error.message}`);
    }
  }

  private async searchKB(message: string, signal?: AbortSignal): Promise<any[]> {
    const cacheKey = this.getKBCacheKey(message);

    try {
      const cachedResults = await cacheManager.get<any[]>(cacheKey);
      if (cachedResults) return cachedResults;

      const embedding = await openaiService.generateEmbedding(message, 'text-embedding-ada-002', { signal });
      const pineconeResults = await pineconeClient.query(embedding, 10, { content_type: 'kb_article' });

      const results = pineconeResults.map((r) => ({
        id: r.metadata.document_id,
        title: r.metadata.title || 'Untitled',
        content: r.metadata.chunk_text || '',
        program: r.metadata.program || 'general',
        similarity: r.score,
      }));

      await cacheManager.set(cacheKey, results, this.KB_CACHE_TTL);
      return results;
    } catch (error: any) {
      if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') throw error;
      logger.error('kb_search_error', { error: error.message });
      return [];
    }
  }
}

export const unifiedChatbotService = new UnifiedChatbotService();
