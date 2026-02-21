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
import { applyAnswer, type IntakeField } from './intakeFlow';
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

  private hasMinimumForRecommendations(ctx: any): boolean {
    // Require 7 essential fields for recommendations
    // Optional fields (geography, impact, innovation, challenges) can enhance results but aren't required
    return !!(
      ctx.user_name &&
      ctx.user_email &&
      ctx.nomination_subject &&
      ctx.org_type &&
      ctx.gender_programs_opt_in !== undefined &&
      ctx.recognition_scope &&
      ctx.description
    );
  }

  /**
   * Detect if the conversation is stuck in a loop (asking same question repeatedly).
   * Returns true if we should break the loop and provide fallback guidance.
   */
  private detectConversationLoop(conversationHistory: Array<{ role: string; content: string }>): boolean {
    if (conversationHistory.length < 6) return false;

    // Check last 3 assistant messages for similarity (same question asked multiple times)
    const recentAssistant = conversationHistory
      .filter(msg => msg.role === 'assistant')
      .slice(-3)
      .map(msg => msg.content.toLowerCase().trim());

    if (recentAssistant.length < 3) return false;

    // Simple similarity check: if all 3 messages contain the same key phrases
    const keyPhrases = ['tell me about', 'what', 'describe', 'achievement', 'nomination'];
    const matches = recentAssistant.map(msg => 
      keyPhrases.filter(phrase => msg.includes(phrase)).length
    );

    // If all 3 messages have similar structure (3+ matching key phrases), likely a loop
    const isLoop = matches.every(count => count >= 3) && 
                   recentAssistant[0].substring(0, 50) === recentAssistant[1].substring(0, 50);

    if (isLoop) {
      logger.warn('conversation_loop_detected', { 
        recent_messages: recentAssistant.map(m => m.substring(0, 100))
      });
    }

    return isLoop;
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
            session_data: { user_context: initialContext, conversation_history: [], pending_field: null },
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
      let pendingField = (session.session_data as any).pending_field as IntakeField | null | undefined;

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
          { user_context: userContext, conversation_history: updatedHistory, pending_field: pendingField ?? null },
          session.conversation_state as any
        );

        this.persistChatMessagesFireAndForget({ sessionId, userMessage: message, assistantMessage: assistantResponse || '(No response)' });
        logger.info('unified_chat_complete');
        return;
      }

      // Recommendation mode:
      // - Store raw user answer into pendingField (what we asked last)
      // - In the SAME LLM call, extract any additional fields from the user's message via updates,
      //   decide next missing field, and ask next question.

      // Check for conversation loop before proceeding
      if (this.detectConversationLoop(conversationHistory)) {
        const loopBreakMessage = 
          "I notice we might be going in circles. Let me try a different approach. " +
          "Could you describe your achievement in simpler, more general terms? " +
          "For example, instead of technical jargon, focus on what problem you solved and the impact it had. " +
          "Or, if you prefer, I can show you how to browse all available award categories manually.";
        
        yield { type: 'chunk', content: loopBreakMessage };
        
        const fullHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [
          ...conversationHistory,
          { role: 'user' as const, content: message },
          { role: 'assistant' as const, content: loopBreakMessage },
        ];
        const updatedHistory =
          fullHistory.length > this.MAX_CONVERSATION_HISTORY ? fullHistory.slice(-this.MAX_CONVERSATION_HISTORY) : fullHistory;

        await this.sessionManager.updateSession(
          sessionId,
          { user_context: userContext, conversation_history: updatedHistory, pending_field: null },
          session.conversation_state as any
        );

        this.persistChatMessagesFireAndForget({ sessionId, userMessage: message, assistantMessage: loopBreakMessage });
        logger.info('conversation_loop_broken');
        return;
      }

      if (pendingField) {
        const applied = applyAnswer({ pendingField, message, userContext });
        if (applied.accepted) userContext = applied.updatedContext;
      }

      const plan = await intakeAssistant.planNext({ userContext, message, signal });

      // Merge extracted updates (LLM) into userContext.
      if (plan.updates && Object.keys(plan.updates).length > 0) {
        userContext = { ...userContext, ...plan.updates };
      }

      // Safeguard: don't let the model jump past basic identity fields if they're still missing.
      const missingBasics: IntakeField[] = [];
      if (!userContext.user_name) missingBasics.push('user_name');
      if (!userContext.user_email) missingBasics.push('user_email');
      if (!userContext.nomination_subject) missingBasics.push('nomination_subject');
      if (!userContext.org_type) missingBasics.push('org_type');
      if (userContext.gender_programs_opt_in === undefined) missingBasics.push('gender_programs_opt_in');
      if (!userContext.recognition_scope) missingBasics.push('recognition_scope');
      if (!userContext.description) missingBasics.push('description');

      let assistantText = plan.next_question;
      let effectiveNextField: IntakeField | null = plan.next_field;

      if (missingBasics.length > 0 && plan.ready_for_recommendations !== true) {
        const forced = missingBasics[0];
        if (effectiveNextField !== forced) {
          effectiveNextField = forced;
          if (forced === 'user_name') assistantText = "What's your name?";
          else if (forced === 'user_email') assistantText = 'And your email?';
          else if (forced === 'nomination_subject') {
            assistantText = 'Are we nominating an individual, team, organization, or product?';
          }
          else if (forced === 'org_type') {
            assistantText = 'For-profit or non-profit?';
          }
          else if (forced === 'gender_programs_opt_in') {
            assistantText = 'Interested in women-focused awards too? (yes/no/skip)';
          }
          else if (forced === 'recognition_scope') {
            assistantText = 'US awards, global, or both?';
          }
          else if (forced === 'description') {
            assistantText = 'Tell me about the achievement!';
          }

          logger.info('intake_safeguard_forced_basic_field', {
            forced_field: forced,
            model_next_field: plan.next_field,
            update_keys: Object.keys(plan.updates || {}),
          });
        }
      }

      yield { type: 'chunk', content: assistantText };

      const fullHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [
        ...conversationHistory,
        { role: 'user' as const, content: message },
        { role: 'assistant' as const, content: assistantText },
      ];
      const updatedHistory =
        fullHistory.length > this.MAX_CONVERSATION_HISTORY ? fullHistory.slice(-this.MAX_CONVERSATION_HISTORY) : fullHistory;

      pendingField = plan.ready_for_recommendations ? null : effectiveNextField;

      await this.sessionManager.updateSession(
        sessionId,
        { user_context: userContext, conversation_history: updatedHistory, pending_field: pendingField ?? null },
        session.conversation_state as any
      );

      this.persistChatMessagesFireAndForget({ sessionId, userMessage: message, assistantMessage: assistantText });

      if (plan.ready_for_recommendations && this.hasMinimumForRecommendations(userContext)) {
        yield { type: 'status', message: 'Generating personalized category recommendations...' };

        const contextForRecommendations = {
          ...userContext,
          org_type: userContext.org_type || 'for_profit',
          org_size: userContext.org_size || 'small',
          achievement_focus: (userContext as any).achievement_focus || ['Innovation'],
        };

        const recommendations = await recommendationEngine.generateRecommendations(contextForRecommendations as any, {
          limit: 15,
          includeExplanations: true,
        });

        // Check if RAG returned no results or very low quality results
        if (recommendations.length === 0 || (recommendations.length > 0 && recommendations[0].similarity_score < 0.3)) {
          logger.warn('rag_retrieval_failed_or_low_quality', {
            count: recommendations.length,
            top_score: recommendations[0]?.similarity_score || 0,
            description: userContext.description?.substring(0, 100)
          });

          // Provide helpful fallback guidance
          const fallbackMessage = recommendations.length === 0
            ? "I'm having trouble finding exact category matches for your specific achievement. This might be because your nomination is highly specialized or uses technical terminology. Here are some options:\n\n" +
              "1. Try describing your achievement in more general terms (e.g., instead of 'IoT agricultural sensor calibration', try 'innovative technology solution for agriculture')\n\n" +
              "2. Browse all available categories manually at [categories page]\n\n" +
              "3. Contact our support team who can help identify the best categories for specialized achievements\n\n" +
              "Would you like to try rephrasing your achievement, or would you prefer to browse categories manually?"
            : "I found some potential matches, but they may not be perfect fits. The top matches have lower confidence scores, which suggests your achievement might be highly specialized. Here are your options:\n\n" +
              "1. Review the categories below (they may still be relevant)\n\n" +
              "2. Try rephrasing your achievement description\n\n" +
              "3. Browse all categories manually\n\n" +
              "Would you like to see these results, or try a different approach?";

          yield { type: 'chunk', content: fallbackMessage };
          
          // Still return recommendations if we have any, but with the warning
          if (recommendations.length > 0) {
            yield { type: 'recommendations', data: recommendations, count: recommendations.length, low_confidence: true };
          }
        } else {
          yield { type: 'recommendations', data: recommendations, count: recommendations.length };
        }
      }

      logger.info('unified_chat_complete', {
        intake_pending_field: pendingField,
        intake_ready: plan.ready_for_recommendations,
        intake_next_field: effectiveNextField,
        update_keys: Object.keys(plan.updates || {}),
        basics_present: {
          user_name: !!userContext.user_name,
          user_email: !!userContext.user_email,
          nomination_subject: !!userContext.nomination_subject,
          org_type: !!userContext.org_type,
          gender_programs_opt_in: userContext.gender_programs_opt_in !== undefined,
          recognition_scope: !!userContext.recognition_scope,
          description: !!userContext.description,
        },
      });
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
