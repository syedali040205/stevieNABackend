import { getSupabaseClient } from '../config/supabase';
import logger from '../utils/logger';
import { SessionManager } from './sessionManager';
// import { userProfileManager } from './userProfileManager'; // Removed - not pre-populating from profile
import { recommendationEngine } from './recommendationEngine';
import { cacheManager } from './cacheManager';
import { pineconeClient } from './pineconeClient';
import { openaiService } from './openaiService';
import { contextClassifier } from './contextClassifier';
import { conversationManager } from './conversationManager';
import { fieldExtractor } from './fieldExtractor';
import { intakeAssistant } from './intakeAssistant';
import { applyAnswer, type IntakeField } from './intakeFlow';
import { awardSearchService } from './awardSearchService';
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

  // Note: Profile pre-population removed - we ask for everything fresh in intake flow
  // Keeping these methods for potential future use
  // private async requireProfileIfAuthenticated(userId: string): Promise<void> {
  //   const profile = await userProfileManager.getProfile(userId);
  //   if (!profile) {
  //     const err: any = new Error('OnboardingRequired');
  //     err.code = 'OnboardingRequired';
  //     err.httpStatus = 409;
  //     err.details = { missing: 'profile_row' };
  //     throw err;
  //   }

  //   if (!profile.full_name || !profile.country || !profile.organization_name || !profile.email) {
  //     const err: any = new Error('OnboardingRequired');
  //     err.code = 'OnboardingRequired';
  //     err.httpStatus = 409;
  //     err.details = { missing: 'required_profile_fields' };
  //     throw err;
  //   }
  // }

  // private mapCountryToGeography(country: string): string | null {
  //   if (!country) return null;
  //   const countryLower = country.toLowerCase().trim();
  //   if (countryLower === 'usa' || countryLower === 'united states' || countryLower === 'united states of america') return 'usa';
  //   if (countryLower === 'canada') return 'canada';
  //   return 'worldwide';
  // }

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
    // Require 8 essential fields for recommendations
    return !!(
      ctx.user_name &&
      ctx.user_email &&
      ctx.geography &&
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

        // Start with empty context - we'll ask for everything in the intake flow
        const initialContext: any = {};

        const { data, error } = await this.supabase
          .from('user_sessions')
          .insert({
            id: sessionId,
            user_id: effectiveUserId,
            session_data: { user_context: initialContext, conversation_history: [], pending_field: null, asked_fields: [] },
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
      let askedFields = new Set<string>((session.session_data as any).asked_fields || []);

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

        // First, try KB search
        const kbArticles = await this.searchKB(message, signal);

        // Check if KB articles are sufficient (have good similarity scores)
        const hasGoodKBResults = kbArticles.length > 0 && kbArticles[0].similarity > 0.7;

        let assistantResponse = '';
        let usedAwardSearch = false;

        if (!hasGoodKBResults) {
          // KB didn't have good results, try Award Search crawler
          logger.info('qa_fallback_to_award_search', { 
            message: message.substring(0, 100),
            kb_results: kbArticles.length,
            top_similarity: kbArticles[0]?.similarity || 0
          });

          try {
            const awardSearchResult = await awardSearchService.search(message);
            
            if (awardSearchResult.success) {
              // Use the crawler's answer
              assistantResponse = awardSearchResult.answer;
              usedAwardSearch = true;
              
              logger.info('qa_award_search_success', {
                cache_hit: awardSearchResult.metadata.cacheHit,
                response_time: awardSearchResult.metadata.responseTimeMs,
                sources_used: awardSearchResult.metadata.sourcesUsed
              });

              yield { type: 'chunk', content: assistantResponse };
            } else {
              // Award search failed, fall back to KB with warning
              logger.warn('qa_award_search_failed', { 
                error: awardSearchResult.error?.message 
              });
              
              // Generate response from KB articles even if similarity is low
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
            }
          } catch (error: any) {
            // Award search threw an error, fall back to KB
            logger.error('qa_award_search_error', { error: error.message });
            
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
          }
        } else {
          // KB has good results, use them
          logger.info('qa_using_kb_articles', { 
            kb_results: kbArticles.length,
            top_similarity: kbArticles[0]?.similarity 
          });

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
          { user_context: userContext, conversation_history: updatedHistory, pending_field: pendingField ?? null, asked_fields: Array.from(askedFields) },
          session.conversation_state as any
        );

        this.persistChatMessagesFireAndForget({ sessionId, userMessage: message, assistantMessage: assistantResponse || '(No response)' });
        
        logger.info('unified_chat_complete', { 
          used_award_search: usedAwardSearch,
          kb_results: kbArticles.length 
        });
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
          { user_context: userContext, conversation_history: updatedHistory, pending_field: null, asked_fields: Array.from(askedFields) },
          session.conversation_state as any
        );

        this.persistChatMessagesFireAndForget({ sessionId, userMessage: message, assistantMessage: loopBreakMessage });
        logger.info('conversation_loop_broken');
        return;
      }

      if (pendingField) {
        const applied = applyAnswer({ pendingField, message, userContext });
        if (applied.accepted) {
          userContext = applied.updatedContext;
          logger.info('applied_pending_field_answer', {
            field: pendingField,
            value_preview: String((userContext as any)[pendingField]).substring(0, 50),
            accepted: true
          });
        } else {
          logger.warn('pending_field_answer_rejected', {
            field: pendingField,
            error: applied.error
          });
        }
      } else {
        logger.info('no_pending_field_to_apply', { message_preview: message.substring(0, 50) });
      }

      const plan = await intakeAssistant.planNext({ 
        userContext, 
        message, 
        askedFields, 
        signal 
      } as any);

      // Log what the LLM extracted
      logger.info('intake_assistant_plan_result', {
        updates_count: Object.keys(plan.updates || {}).length,
        updates: plan.updates,
        next_field: plan.next_field,
        ready: plan.ready_for_recommendations
      });

      // Merge extracted updates (LLM) into userContext.
      if (plan.updates && Object.keys(plan.updates).length > 0) {
        userContext = { ...userContext, ...plan.updates };
      }

      // Count how many optional follow-ups have been collected
      const optionalFollowUps = ['achievement_impact', 'achievement_innovation', 'achievement_challenges'];
      const collectedOptionals = optionalFollowUps.filter(field => (userContext as any)[field]).length;

      // Safeguard: don't let the model jump past basic identity fields if they're still missing.
      const missingBasics: IntakeField[] = [];
      if (!userContext.user_name && !askedFields.has('user_name')) missingBasics.push('user_name');
      if (!userContext.user_email && !askedFields.has('user_email')) missingBasics.push('user_email');
      if (!userContext.geography && !askedFields.has('geography')) missingBasics.push('geography');
      if (!userContext.nomination_subject && !askedFields.has('nomination_subject')) missingBasics.push('nomination_subject');
      if (!userContext.org_type && !askedFields.has('org_type')) missingBasics.push('org_type');
      if (userContext.gender_programs_opt_in === undefined && !askedFields.has('gender_programs_opt_in')) missingBasics.push('gender_programs_opt_in');
      if (!userContext.recognition_scope && !askedFields.has('recognition_scope')) missingBasics.push('recognition_scope');
      if (!userContext.description && !askedFields.has('description')) missingBasics.push('description');

      let assistantText = plan.next_question;
      let effectiveNextField: IntakeField | null = plan.next_field;
      let forceReady = false;

      // Force ready state if we have all required fields + 2 optional follow-ups
      if (missingBasics.length === 0 && collectedOptionals >= 2) {
        effectiveNextField = null;
        assistantText = "Perfect! Let me find the best categories for you.";
        forceReady = true;
        logger.info('intake_forced_ready_state', {
          collected_optionals: collectedOptionals,
          model_next_field: plan.next_field
        });
      } else if (missingBasics.length > 0 && plan.ready_for_recommendations !== true) {
        const forced = missingBasics[0];
        if (effectiveNextField !== forced) {
          effectiveNextField = forced;
          if (forced === 'user_name') assistantText = "What's your name?";
          else if (forced === 'user_email') assistantText = 'And your email?';
          else if (forced === 'geography') assistantText = 'Where are you from?';
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

      // Track that we've asked this field
      if (effectiveNextField) {
        askedFields.add(effectiveNextField);
      }

      logger.info('updating_session_with_context', {
        session_id: sessionId,
        user_context_keys: Object.keys(userContext),
        user_name: userContext.user_name ? 'SET' : 'NOT_SET',
        user_email: userContext.user_email ? 'SET' : 'NOT_SET',
        pending_field: pendingField,
        asked_fields_count: askedFields.size
      });

      await this.sessionManager.updateSession(
        sessionId,
        { 
          user_context: userContext, 
          conversation_history: updatedHistory, 
          pending_field: pendingField ?? null,
          asked_fields: Array.from(askedFields)
        },
        session.conversation_state as any
      );

      this.persistChatMessagesFireAndForget({ sessionId, userMessage: message, assistantMessage: assistantText });

      if ((plan.ready_for_recommendations || forceReady) && this.hasMinimumForRecommendations(userContext)) {
        yield { type: 'status', message: 'Generating personalized category recommendations...' };

        // Map recognition_scope to geography using database configuration
        let geography: string | undefined;
        const recognitionScope = (userContext as any).recognition_scope;
        
        if (recognitionScope) {
          try {
            // Fetch geography mapping from database
            const { data: mappingData, error: mappingError } = await this.supabase
              .from('geography_mappings')
              .select('geography_filter')
              .eq('recognition_scope', recognitionScope)
              .single();

            if (mappingError) {
              logger.warn('geography_mapping_fetch_failed', {
                recognition_scope: recognitionScope,
                error: mappingError.message,
              });
              // Fallback: use recognition_scope as-is
              geography = undefined;
            } else if (mappingData?.geography_filter && mappingData.geography_filter.length > 0) {
              // Use first geography from the filter array
              geography = mappingData.geography_filter[0];
            } else {
              // NULL in database means no filter (search all)
              geography = undefined;
            }

            logger.info('mapping_recognition_scope_to_geography', {
              recognition_scope: recognitionScope,
              mapped_geography: geography || 'all',
              source: 'database',
            });
          } catch (error: any) {
            logger.error('geography_mapping_error', {
              recognition_scope: recognitionScope,
              error: error.message,
            });
            geography = undefined;
          }
        }

        // Map gender_programs_opt_in to gender parameter for database filtering
        const gender = (userContext as any).gender_programs_opt_in === false 
          ? 'opt_out'  // Explicitly exclude women's categories
          : (userContext as any).gender_programs_opt_in === true 
            ? 'female'  // Include women's categories
            : null;     // No preference (include all)

        const contextForRecommendations = {
          ...userContext,
          geography: geography, // Add mapped geography field
          gender: gender, // Add mapped gender field
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
