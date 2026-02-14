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
import crypto from 'crypto';

/**
 * Unified Chatbot Service
 * 
 * Handles conversational AI that can both ask questions AND answer questions.
 * Replaces separate conversation and chatbot services with one intelligent system.
 * 
 * Flow:
 * 1. Get session + context
 * 2. Classify intent (Python)
 * 3. If question: Search KB
 * 4. Generate response (Python, streaming)
 * 5. Update context if info extracted
 * 6. Stream to user
 */
export class UnifiedChatbotService {
  private supabase = getSupabaseClient();
  private sessionManager = new SessionManager();
  private readonly KB_CACHE_PREFIX = 'kb_search:';
  private readonly KB_CACHE_TTL = 3600; // 1 hour (KB articles rarely change)
  /** Max conversation turns to store (user+assistant pairs). Keeps session_data bounded for scale. */
  private readonly MAX_CONVERSATION_HISTORY = 40;

  /**
   * Generate cache key for KB search
   * Normalizes the query to improve cache hit rate
   */
  private getKBCacheKey(message: string): string {
    // Normalize: lowercase, trim, remove extra spaces, remove punctuation
    const normalized = message
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '');
    
    // Hash the normalized query for consistent key length
    const hash = crypto.createHash('md5').update(normalized).digest('hex');
    return `${this.KB_CACHE_PREFIX}${hash}`;
  }

  /**
   * Manually enrich context from conversation as workaround for weak field extraction.
   * Analyzes conversation history and current message to extract key information.
   */
  private enrichContextFromConversation(
    context: any,
    currentMessage: string,
    conversationHistory: any[]
  ): any {
    const enrichedContext = { ...context };
    const messageLower = currentMessage.toLowerCase();
    
    // Extract nomination_subject from keywords (including short answers to "what are you nominating?" / "company or non-profit?")
    const setNomination = (value: 'individual' | 'team' | 'organization' | 'product') => {
      if (!enrichedContext.nomination_subject) {
        enrichedContext.nomination_subject = value;
        logger.info('enriched_nomination_subject', { value, source: 'keyword' });
      }
    };
    if (messageLower.includes('it is a team') || messageLower === 'team' || messageLower.includes('our team') || messageLower.includes('my team') || (messageLower.includes('team') && messageLower.length < 30)) {
      setNomination('team');
    } else if (messageLower.includes('it is a product') || messageLower === 'product' || messageLower.includes('our product') || (messageLower.includes('product') && messageLower.length < 30)) {
      setNomination('product');
    } else if (messageLower.includes('myself') || messageLower.includes('i want to nominate me') || messageLower.includes('nominate myself') || messageLower === 'individual') {
      setNomination('individual');
    } else if (messageLower.includes('organization') || messageLower.includes('our organization') || messageLower.includes('my organization')) {
      setNomination('organization');
    }

    // Extract geography from simple country names
    if (!enrichedContext.geography) {
      const commonCountries = ['india', 'pakistan', 'usa', 'united states', 'uk', 'united kingdom', 'canada', 'australia', 'germany', 'france', 'uae', 'dubai', 'china', 'japan', 'singapore'];
      for (const country of commonCountries) {
        if (messageLower === country || messageLower.includes(`from ${country}`) || messageLower.includes(`in ${country}`) || messageLower.includes(`based in ${country}`)) {
          enrichedContext.geography = country.charAt(0).toUpperCase() + country.slice(1);
          logger.info('enriched_geography', { value: enrichedContext.geography, source: 'keyword' });
          break;
        }
      }
    }

    // Auto-fill recognition_scope based on geography if not set
    // Non-US countries typically want global recognition
    if (!enrichedContext.recognition_scope && enrichedContext.geography) {
      const geoLower = enrichedContext.geography.toLowerCase();
      if (geoLower === 'usa' || geoLower === 'united states') {
        enrichedContext.recognition_scope = 'both'; // US can do both
      } else {
        enrichedContext.recognition_scope = 'global'; // Non-US typically wants global
      }
      logger.info('enriched_recognition_scope', { 
        value: enrichedContext.recognition_scope, 
        geography: enrichedContext.geography,
        source: 'geography_inference' 
      });
    }

    // Extract org_type from short answers to "company, non-profit, or something else?"
    if (!enrichedContext.org_type) {
      const trimmed = messageLower.trim();
      if (trimmed.includes('non-profit') || trimmed.includes('nonprofit') || trimmed === 'non profit') {
        enrichedContext.org_type = 'non_profit';
        logger.info('enriched_org_type', { value: 'non_profit', source: 'keyword' });
      } else if (trimmed.includes('startup') || trimmed === 'we\'re a startup') {
        enrichedContext.org_type = 'startup';
        logger.info('enriched_org_type', { value: 'startup', source: 'keyword' });
      } else if (trimmed.includes('government') || trimmed.includes('public sector')) {
        enrichedContext.org_type = 'government';
        logger.info('enriched_org_type', { value: 'government', source: 'keyword' });
      } else if (trimmed === 'company' || trimmed === 'it\'s a company' || trimmed === 'a company' || (trimmed.includes('company') && trimmed.length < 40)) {
        enrichedContext.org_type = 'for_profit';
        logger.info('enriched_org_type', { value: 'for_profit', source: 'keyword' });
      }
    }

    // Extract company_age from short answers like "12 years", "5 years", "2 months"
    if (!enrichedContext.company_age) {
      const trimmed = currentMessage.trim();
      // Match patterns like "12 years", "5 years", "2 months", "1 year"
      const agePattern = /(\d+)\s*(year|years|month|months|yr|yrs)/i;
      const match = trimmed.match(agePattern);
      if (match && trimmed.length < 50) {
        enrichedContext.company_age = trimmed;
        logger.info('enriched_company_age', { value: trimmed, source: 'pattern_match' });
      }
    }

    // Extract career_stage from short answers like "5 years", "10 years"
    if (!enrichedContext.career_stage) {
      const trimmed = currentMessage.trim();
      const careerPattern = /(\d+)\s*(year|years|yr|yrs)/i;
      const match = trimmed.match(careerPattern);
      if (match && trimmed.length < 50) {
        enrichedContext.career_stage = trimmed;
        logger.info('enriched_career_stage', { value: trimmed, source: 'pattern_match' });
      }
    }

    // Extract org_size from short answers like "3 people", "5 peeps", "10 employees"
    if (!enrichedContext.org_size) {
      const trimmed = currentMessage.trim();
      const sizePattern = /(\d+)\s*(people|peeps|person|employees|employee|members|member|staff)/i;
      const match = trimmed.match(sizePattern);
      if (match && trimmed.length < 50) {
        enrichedContext.org_size = trimmed;
        logger.info('enriched_org_size', { value: trimmed, source: 'pattern_match' });
      }
    }

    // Extract tech_orientation from short answers like "AI based", "tech focused", "minimal tech"
    if (!enrichedContext.tech_orientation) {
      const trimmed = messageLower.trim();
      if (trimmed.includes('ai') || trimmed.includes('artificial intelligence') || trimmed.includes('machine learning')) {
        enrichedContext.tech_orientation = 'AI/ML focused';
        logger.info('enriched_tech_orientation', { value: 'AI/ML focused', source: 'keyword' });
      } else if (trimmed.includes('tech') && (trimmed.includes('central') || trimmed.includes('core') || trimmed.includes('based') || trimmed.includes('focused'))) {
        enrichedContext.tech_orientation = 'Technology-centric';
        logger.info('enriched_tech_orientation', { value: 'Technology-centric', source: 'keyword' });
      } else if (trimmed.includes('minimal') || trimmed.includes('not really') || trimmed.includes('not much')) {
        enrichedContext.tech_orientation = 'Minimal technology';
        logger.info('enriched_tech_orientation', { value: 'Minimal technology', source: 'keyword' });
      }
    }
    
    // Build comprehensive description from conversation history if missing or too short
    // BUT: Don't auto-fill if we haven't explicitly asked for achievement_description yet
    const hasAskedForDescription = conversationHistory.some(msg => 
      msg.role === 'assistant' && 
      (msg.content.toLowerCase().includes('achievement') || 
       msg.content.toLowerCase().includes('what makes this nomination special'))
    );
    
    if (hasAskedForDescription && (!enrichedContext.description || enrichedContext.description.length < 50)) {
      const userMessages = conversationHistory
        .filter(m => m.role === 'user')
        .map(m => m.content)
        .join(' ');
      
      // Combine with current message
      const fullDescription = `${userMessages} ${currentMessage}`.trim();
      
      if (fullDescription.length > 50) {
        enrichedContext.description = fullDescription.substring(0, 500);
        logger.info('enriched_description', { 
          length: enrichedContext.description.length,
          source: 'conversation_history'
        });
      }
    }
    
    // Extract achievement_focus from keywords in message and history
    const allText = `${conversationHistory.filter(m => m.role === 'user').map(m => m.content).join(' ')} ${currentMessage}`.toLowerCase();
    const focusAreas: string[] = enrichedContext.achievement_focus || [];
    
    // Technology keywords
    if ((allText.includes('ai') || allText.includes('artificial intelligence')) && !focusAreas.includes('Artificial Intelligence')) {
      focusAreas.push('Artificial Intelligence');
    }
    if ((allText.includes('smart') || allText.includes('iot')) && !focusAreas.includes('Smart Technology')) {
      focusAreas.push('Smart Technology');
    }
    if (allText.includes('mirror') && !focusAreas.includes('Consumer Electronics')) {
      focusAreas.push('Consumer Electronics');
    }
    if ((allText.includes('assistant') || allText.includes('personal assistant')) && !focusAreas.includes('Product Innovation')) {
      focusAreas.push('Product Innovation');
    }
    
    // Product/Business keywords
    if ((allText.includes('innovation') || allText.includes('innovative')) && !focusAreas.includes('Innovation')) {
      focusAreas.push('Innovation');
    }
    if ((allText.includes('product') || allText.includes('developed')) && !focusAreas.includes('Product Development')) {
      focusAreas.push('Product Development');
    }
    if ((allText.includes('luxury') || allText.includes('premium')) && !focusAreas.includes('Luxury Goods')) {
      focusAreas.push('Luxury Goods');
    }
    if (allText.includes('customer') && !focusAreas.includes('Customer Experience')) {
      focusAreas.push('Customer Experience');
    }
    
    // Achievement keywords
    if ((allText.includes('top 5') || allText.includes('winner') || allText.includes('award')) && !focusAreas.includes('Recognition')) {
      focusAreas.push('Recognition');
    }
    if (allText.includes('ideathon') && !focusAreas.includes('Competition Success')) {
      focusAreas.push('Competition Success');
    }
    
    if (focusAreas.length > 0) {
      enrichedContext.achievement_focus = focusAreas;
      logger.info('enriched_achievement_focus', { 
        areas: focusAreas,
        source: 'keyword_extraction'
      });
    }
    
    return enrichedContext;
  }

  /**
   * Map country name to Python Geography enum value.
   * Python expects: worldwide, asia_pacific_middle_east_north_africa, europe, latin_america, usa, canada
   */
  private mapCountryToGeography(country: string): string | null {
    if (!country) return null;
    
    const countryLower = country.toLowerCase().trim();
    
    // Direct matches
    if (countryLower === 'usa' || countryLower === 'united states' || countryLower === 'united states of america') {
      return 'usa';
    }
    if (countryLower === 'canada') {
      return 'canada';
    }
    
    // European countries
    const europeanCountries = [
      'uk', 'united kingdom', 'england', 'scotland', 'wales', 'ireland', 'northern ireland',
      'france', 'germany', 'italy', 'spain', 'portugal', 'netherlands', 'belgium', 'switzerland',
      'austria', 'sweden', 'norway', 'denmark', 'finland', 'poland', 'czech republic', 'hungary',
      'romania', 'greece', 'bulgaria', 'croatia', 'serbia', 'ukraine', 'russia'
    ];
    if (europeanCountries.includes(countryLower)) {
      return 'europe';
    }
    
    // Latin American countries
    const latinAmericanCountries = [
      'mexico', 'brazil', 'argentina', 'colombia', 'chile', 'peru', 'venezuela', 'ecuador',
      'guatemala', 'cuba', 'bolivia', 'haiti', 'dominican republic', 'honduras', 'paraguay',
      'nicaragua', 'el salvador', 'costa rica', 'panama', 'uruguay', 'puerto rico'
    ];
    if (latinAmericanCountries.includes(countryLower)) {
      return 'latin_america';
    }
    
    // Asia Pacific, Middle East, North Africa
    const apacMenaCountries = [
      'china', 'japan', 'india', 'south korea', 'indonesia', 'thailand', 'malaysia', 'singapore',
      'philippines', 'vietnam', 'pakistan', 'bangladesh', 'australia', 'new zealand',
      'saudi arabia', 'uae', 'united arab emirates', 'dubai', 'qatar', 'kuwait', 'bahrain',
      'egypt', 'morocco', 'tunisia', 'algeria', 'israel', 'turkey', 'iran', 'iraq', 'jordan', 'lebanon'
    ];
    if (apacMenaCountries.includes(countryLower)) {
      return 'asia_pacific_middle_east_north_africa';
    }
    
    // Default to worldwide for unknown countries
    return 'worldwide';
  }

  /**
   * Unified chat conversation with streaming.
   */
  async *chat(
    sessionId: string,
    message: string,
    userId?: string
  ): AsyncGenerator<any, void, unknown> {
    logger.info('unified_chat_request', {
      session_id: sessionId,
      message_length: message.length,
    });

    try {
      // Step 1: Get or create session
      let session = await this.sessionManager.getSession(sessionId);
      
      if (!session) {
        logger.info('session_not_found_creating_new', { session_id: sessionId });
        
        // Create new session with the provided sessionId
        // For anonymous users (no auth), user_id will be null
        const effectiveUserId = userId || null;
        const expiresAt = new Date(Date.now() + 3600000); // 1 hour
        
        // Initialize user context
        let initialContext: any = {
          geography: null,
          organization_name: null,
          job_title: null,
        };
        
        // If authenticated user, fetch profile and populate context
        if (userId) {
          try {
            const profile = await userProfileManager.getProfile(userId);
            if (profile) {
              // Map country to geography enum
              const geography = this.mapCountryToGeography(profile.country);
              
              initialContext = {
                geography: geography,
                organization_name: profile.organization_name,
                job_title: profile.job_title || null,
              };
              
              logger.info('user_profile_loaded', {
                user_id: userId,
                geography: geography,
              });
            } else {
              // User doesn't have a profile yet - they haven't completed onboarding
              // Create a basic user record so the foreign key constraint is satisfied
              logger.warn('user_profile_not_found_creating_basic_record', {
                user_id: userId,
              });
              
              // Insert basic user record
              const { error: userInsertError } = await this.supabase
                .from('users')
                .insert({
                  id: userId,
                  email: 'unknown@example.com', // Placeholder
                  full_name: 'Guest User',
                  country: 'Unknown',
                  organization_name: 'Unknown',
                })
                .select()
                .single();
              
              if (userInsertError) {
                // If error is duplicate key, that's fine - user exists
                if (!userInsertError.message.includes('duplicate key')) {
                  logger.error('failed_to_create_basic_user_record', {
                    user_id: userId,
                    error: userInsertError.message,
                  });
                }
              }
            }
          } catch (error: any) {
            logger.error('failed_to_load_profile', {
              user_id: userId,
              error: error.message,
            });
            // Continue with null values if profile fetch fails
          }
        }
        
        const { data, error } = await this.supabase
          .from('user_sessions')
          .insert({
            id: sessionId, // Use the provided sessionId
            user_id: effectiveUserId,
            session_data: {
              user_context: initialContext,
              conversation_history: []
            },
            conversation_state: 'collecting_org_type',
            expires_at: expiresAt.toISOString()
          })
          .select()
          .single();
        
        if (error) {
          logger.error('session_creation_error', { error: error.message });
          throw new Error(`Failed to create session: ${error.message}`);
        }
        
        if (!data) {
          throw new Error('Failed to create session: No data returned');
        }
        
        session = data as any;
        
        logger.info('session_created', { 
          session_id: session!.id,
          user_id: effectiveUserId 
        });
      }

      // Session is guaranteed to exist at this point
      if (!session) {
        throw new Error('Session creation failed unexpectedly');
      }

      let userContext = session.session_data.user_context;
      const conversationHistory = session.session_data.conversation_history || [];

      // Detect previous context from conversation history
      const previousContext = conversationHistory.length > 0
        ? conversationHistory[conversationHistory.length - 1].role === 'assistant'
          ? conversationHistory[conversationHistory.length - 2]?.content.toLowerCase().includes('stevie awards')
            ? 'qa'
            : 'recommendation'
          : undefined
        : undefined;

      // Step 2: Classify context (recommendation vs qa)
      logger.info('step_1_classifying_context');
      const context = await contextClassifier.classifyContext({
        message,
        conversationHistory,
        currentContext: undefined, // Context is determined dynamically, not stored in session
        userContext,
      });

      // Detect context switch
      const contextSwitched = previousContext && previousContext !== context.context;

      logger.info('context_classified', {
        context: context.context,
        confidence: context.confidence,
        previousContext,
        switched: contextSwitched,
      });

      // If switching TO recommendation context OR first time in recommendation, clear demographics to start fresh
      if (context.context === 'recommendation' && (contextSwitched || !previousContext)) {
        logger.info('entering_recommendation_context_clearing_demographics', {
          from: previousContext || 'none',
          to: context.context,
          is_switch: contextSwitched,
          is_first_time: !previousContext,
        });
        
        // Clear ALL demographic fields to force starting from name
        // Keep only profile fields (geography, organization_name, job_title)
        userContext = {
          geography: userContext.geography,
          organization_name: userContext.organization_name,
          job_title: userContext.job_title,
        };
      }

      // Yield context to client (frontend expects 'intent' field for backward compatibility)
      yield {
        type: 'intent',
        intent: context.context,
        confidence: context.confidence,
      };

      // Step 3: If qa context, search KB
      let kbArticles: any[] | null = null;
      
      if (context.context === 'qa') {
        logger.info('step_2_searching_kb');
        kbArticles = await this.searchKB(message);
        
        logger.info('kb_search_complete', {
          articles_found: kbArticles.length,
        });
      }

      // Step 3.5: Extract fields and enrich context BEFORE generating response
      logger.info('step_3_extracting_fields');
      const extractedFields = await fieldExtractor.extractFields({
        message,
        userContext,
      });

      // Debug only: avoid PII in production logs (see SCALING-ROADMAP Security)
      logger.debug('extracted_fields_detail', {
        field_names: Object.keys(extractedFields),
        context_before_keys: Object.keys(userContext).filter((k) => (userContext as unknown as Record<string, unknown>)[k] != null),
      });

      // Update context with extracted fields
      if (extractedFields && Object.keys(extractedFields).length > 0) {
        logger.info('fields_extracted', { fields: Object.keys(extractedFields) });
        userContext = { ...userContext, ...extractedFields };
        
        logger.debug('context_after_extraction', {
          keys_updated: Object.keys(extractedFields),
        });
      } else {
        logger.warn('no_fields_extracted', { message: message.substring(0, 100) });
      }

      // Manual context enrichment as workaround for weak field extraction
      const contextBeforeEnrichment = { ...userContext };
      userContext = this.enrichContextFromConversation(userContext, message, conversationHistory);
      
      // Log what changed during enrichment
      const enrichedFields = Object.keys(userContext).filter(
        key => (userContext as any)[key] !== (contextBeforeEnrichment as any)[key] && (userContext as any)[key] !== undefined
      );
      if (enrichedFields.length > 0) {
        logger.info('manual_enrichment_applied', { 
          fields: enrichedFields,
          values: enrichedFields.reduce((acc, key) => ({ ...acc, [key]: (userContext as any)[key] }), {})
        });
      }

      // Special handling for "no" responses to gender_programs question
      const messageLower = message.toLowerCase().trim();
      const isNo = messageLower === 'no' || messageLower === 'nope' || messageLower === 'no dont' || messageLower === 'no don\'t';
      if (isNo && (userContext.gender_programs_opt_in === undefined || userContext.gender_programs_opt_in === null)) {
        userContext.gender_programs_opt_in = false;
        logger.info('set_gender_programs_to_false', { message });
      }

      // Step 4: Generate response (Node.js streaming) with enriched context
      // Accumulate assistant response so we can persist it in conversation history
      let assistantResponse = '';
      logger.info('step_4_generating_response');
      for await (const chunk of conversationManager.generateResponseStream({
        message,
        context,
        conversationHistory,
        userContext,
        kbArticles,
      })) {
        assistantResponse += chunk;
        yield {
          type: 'chunk',
          content: chunk,
        };
      }

      // Step 5: Check if ready for recommendations
      if (await this.shouldGenerateRecommendations(userContext, message)) {
        logger.info('generating_recommendations');
        
        yield {
          type: 'status',
          message: 'Generating personalized category recommendations...'
        };

        try {
          // Use description from context (should be collected via achievement_description step)
          const description = userContext.description || 'Seeking award category recommendations';

          // Fill in smart defaults for missing optional fields only
          const contextForRecommendations = {
            ...userContext,
            description: description,
            // Smart defaults for optional fields only
            org_type: userContext.org_type || 'for_profit',
            org_size: userContext.org_size || 'small',
            achievement_focus: userContext.achievement_focus || ['Innovation', 'Technology', 'Product Development']
          };

          logger.info('recommendation_context', {
            has_description: !!contextForRecommendations.description,
            nomination_subject: contextForRecommendations.nomination_subject,
          });

          const recommendations = await recommendationEngine.generateRecommendations(
            contextForRecommendations as any,
            { limit: 15, includeExplanations: true }
          );

          yield {
            type: 'recommendations',
            data: recommendations,
            count: recommendations.length
          };

          logger.info('recommendations_generated', { count: recommendations.length });
        } catch (recError: any) {
          logger.error('recommendation_generation_error', { 
            error: recError.message,
            stack: recError.stack,
          });
          
          // If recommendations fail, still continue conversation
          const fallbackContent = '\n\nI have enough information, but I encountered an issue generating recommendations. Could you provide a bit more detail about your achievement?';
          assistantResponse += fallbackContent;
          yield {
            type: 'chunk',
            content: fallbackContent,
          };
        }
      }

      // Step 6: Update session with new message, assistant response, and context
      const fullHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [
        ...conversationHistory,
        { role: 'user' as const, content: message },
        { role: 'assistant' as const, content: assistantResponse || '(No response)' },
      ];
      const updatedHistory = fullHistory.length > this.MAX_CONVERSATION_HISTORY
        ? fullHistory.slice(-this.MAX_CONVERSATION_HISTORY)
        : fullHistory;

      await this.sessionManager.updateSession(
        sessionId,
        {
          user_context: userContext,
          conversation_history: updatedHistory,
        },
        session.conversation_state as any
      );

      logger.info('unified_chat_complete');
    } catch (error: any) {
      logger.error('unified_chat_error', {
        error: error.message,
        stack: error.stack,
      });
      throw new Error(`Failed to process chat: ${error.message}`);
    }
  }

  // Intent classification moved to intentClassifier service

  /**
   * Search KB articles using Pinecone with Redis caching.
   * Cache key is based on normalized query to maximize cache hits.
   */
  private async searchKB(message: string): Promise<any[]> {
    const cacheKey = this.getKBCacheKey(message);

    try {
      // Try cache first
      const cachedResults = await cacheManager.get<any[]>(cacheKey);
      if (cachedResults) {
        logger.info('kb_search_cache_hit', { 
          message: message.substring(0, 50),
          results_count: cachedResults.length 
        });
        return cachedResults;
      }

      logger.debug('kb_search_cache_miss', { message: message.substring(0, 50) });

      // Cache miss - generate embedding and search Pinecone
      const embedding = await openaiService.generateEmbedding(message);

      // Search Pinecone
      const pineconeResults = await pineconeClient.query(
        embedding,
        5,
        { content_type: 'kb_article' }
      );

      // Transform Pinecone results to expected format
      const results = pineconeResults.map(r => ({
        id: r.metadata.document_id,
        title: r.metadata.title || 'Untitled',
        content: r.metadata.chunk_text || '',
        program: r.metadata.program || 'general',
        similarity: r.score,
      }));

      // Cache the results
      await cacheManager.set(cacheKey, results, this.KB_CACHE_TTL);
      
      logger.info('kb_search_completed_and_cached', { 
        message: message.substring(0, 50),
        results_count: results.length 
      });

      return results;
    } catch (error: any) {
      logger.error('kb_search_error', {
        error: error.message,
      });
      // Return empty array on error (graceful degradation)
      return [];
    }
  }

  // Embedding generation moved to openaiService

  // Response generation moved to conversationManager service

  // Field extraction moved to fieldExtractor service

  /**
   * Check if we should generate recommendations based on context and message.
   * Uses LLM to detect if user is confirming they want recommendations.
   */
  private async shouldGenerateRecommendations(context: any, message: string): Promise<boolean> {
    // Minimum required: name, email, nomination_subject, description
    const hasMinimumInfo = !!(
      context.user_name &&
      context.user_email &&
      context.nomination_subject &&
      context.description
    );

    // If we don't have minimum info, can't generate recommendations
    if (!hasMinimumInfo) {
      logger.info('recommendation_check_no_minimum_info', {
        has_name: !!context.user_name,
        has_email: !!context.user_email,
        has_nomination_subject: !!context.nomination_subject,
        has_description: !!context.description,
      });
      return false;
    }

    // Use LLM to detect if user is confirming they want recommendations
    try {
      const prompt = `Analyze if the user is confirming they want to see category recommendations or if they're doing something else (asking a question, providing more info, etc.).

User message: "${message}"

Is this a confirmation to proceed with showing recommendations?

Respond with ONLY "yes" or "no".

Guidelines:
- "yes" = User is agreeing, confirming, or explicitly requesting to see categories/recommendations
- "no" = User is asking questions, providing additional information, or discussing something else`;

      const response = await openaiService.chatCompletion({
        messages: [{ role: 'user', content: prompt }],
        model: 'gpt-4o-mini',
        maxTokens: 10,
        temperature: 0,
      });

      const isConfirming = response.trim().toLowerCase() === 'yes';

      logger.info('recommendation_check', {
        asking: isConfirming,
        has_minimum: hasMinimumInfo,
        message: message.substring(0, 50)
      });

      return isConfirming;
    } catch (error: any) {
      logger.error('recommendation_check_error', { error: error.message });
      // Fallback: don't generate recommendations on error
      return false;
    }
  }

  /**
   * Invalidate all KB search caches
   * Call this when KB articles are updated/added/deleted
   */
  async invalidateKBCache(): Promise<number> {
    const pattern = `${this.KB_CACHE_PREFIX}*`;
    const deletedCount = await cacheManager.deletePattern(pattern);
    logger.info('kb_cache_invalidated', { count: deletedCount });
    return deletedCount;
  }
}

// Export singleton instance
export const unifiedChatbotService = new UnifiedChatbotService();
