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
import { intakeAssistant } from './intakeAssistant';
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

  private async requireProfileIfAuthenticated(userId: string): Promise<void> {
    const profile = await userProfileManager.getProfile(userId);
    if (!profile) {
      const err: any = new Error('OnboardingRequired');
      err.code = 'OnboardingRequired';
      err.httpStatus = 409;
      err.details = { missing: 'profile_row' };
      throw err;
    }

    if (!profile.full_name || !profile.country || !profile.organization_name || !profile.email) {
      const err: any = new Error('OnboardingRequired');
      err.code = 'OnboardingRequired';
      err.httpStatus = 409;
      err.details = { missing: 'required_profile_fields' };
      throw err;
    }
  }

  private mapCountryToGeography(country: string): string | null {
    if (!country) return null;
    const countryLower = country.toLowerCase().trim();
    if (countryLower === 'usa' || countryLower === 'united states' || countryLower === 'united states of america') return 'usa';
    if (countryLower === 'canada') return 'canada';
    return 'worldwide';
  }

  private persistChatMessagesFireAndForget(params: {
    sessionId: string;
    userMessage: string;
    assistantMessage: string;
  }): void {
    const { sessionId, userMessage, assistantMessage } = params;

    void (async () => {
      try {
        const { error } = await this.supabase.from('chatbot_messages').insert([
          { session_id: sessionId, role: 'user', content: userMessage, sources: [] },
          { session_id: sessionId, role: 'assistant', content: assistantMessage, sources: [] },
        ]);

        if (error) logger.warn('chatbot_messages_insert_failed', { session_id: sessionId, error: error.message });
      } catch (e: any) {
        logger.warn('chatbot_messages_insert_unexpected_error', { session_id: sessionId, error: e.message });
      }
    })();
  }

  /**
   * AI-driven readiness check lives in prompt, but we still need a final guard to avoid calling
   * recommendation engine with obviously missing required data.
   */
  private hasMinimumForRecommendations(ctx: any): boolean {
    return !!(
      ctx.user_name &&
      ctx.user_email &&
      ctx.nomination_subject &&
      ctx.geography &&
      ctx.description &&
      ctx.achievement_impact &&
      ctx.achievement_innovation &&
      ctx.achievement_challenges
    );
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
          await this.requireProfileIfAuthenticated(userId);
          const profile = await userProfileManager.getProfile(userId);
          if (profile) {
            initialContext = {
              geography: this.mapCountryToGeography(profile.country),
              organization_name: profile.organization_name,
              job_title: profile.job_title || null,
            };
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

      logger.info('step_1_classifying_context');
      const context = await contextClassifier.classifyContext({
        message,
        conversationHistory,
        currentContext: undefined,
        userContext,
        signal,
      });

      yield { type: 'intent', intent: context.context, confidence: context.confidence };

      if (context.context === 'qa') {
        const extractedFields = await fieldExtractor.extractFields({ message, userContext, conversationHistory, signal });
        if (extractedFields && Object.keys(extractedFields).length > 0) userContext = { ...userContext, ...extractedFields };

        const kbArticles = await this.searchKB(message, signal);

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

        this.persistChatMessagesFireAndForget({ sessionId, userMessage: message, assistantMessage: assistantResponse || '(No response)' });
        logger.info('unified_chat_complete');
        return;
      }

      // Recommendation mode: purely AI-driven intake (required fields live in prompt).
      const intake = await intakeAssistant.run({ message, userContext, conversationHistory, signal });

      const updates = intake.updates || {};
      const updateKeys = Object.keys(updates);
      if (updateKeys.length > 0) {
        userContext = { ...userContext, ...updates };
      }

      const assistantText = (intake.next_question || '').trim() || 'Okay.';
      yield { type: 'chunk', content: assistantText };

      const fullHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [
        ...conversationHistory,
        { role: 'user' as const, content: message },
        { role: 'assistant' as const, content: assistantText },
      ];
      const updatedHistory =
        fullHistory.length > this.MAX_CONVERSATION_HISTORY ? fullHistory.slice(-this.MAX_CONVERSATION_HISTORY) : fullHistory;

      await this.sessionManager.updateSession(
        sessionId,
        { user_context: userContext, conversation_history: updatedHistory },
        session.conversation_state as any
      );

      this.persistChatMessagesFireAndForget({ sessionId, userMessage: message, assistantMessage: assistantText });

      // If AI says ready, we still guard on minimum fields.
      if (intake.ready_for_recommendations && this.hasMinimumForRecommendations(userContext)) {
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

      logger.info('unified_chat_complete', { update_keys: updateKeys, ai_ready: intake.ready_for_recommendations });
    } catch (error: any) {
      if (error?.code === 'OnboardingRequired') throw error;
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
