import { getSupabaseClient } from '../config/supabase';
import logger from '../utils/logger';
import { SessionManager } from './sessionManager';
import { userProfileManager } from './userProfileManager';
import { recommendationEngine } from './recommendationEngine';
import { cacheManager } from './cacheManager';
import { pineconeClient } from './pineconeClient';
import { openaiService } from './openaiService';
import { intentClassifier } from './intentClassifier';
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
    
    // Extract nomination_subject from keywords
    if (!enrichedContext.nomination_subject) {
      if (messageLower.includes('team') || messageLower.includes('our team')) {
        enrichedContext.nomination_subject = 'team';
        logger.info('enriched_nomination_subject', { value: 'team', source: 'keyword' });
      } else if (messageLower.includes('product') || messageLower.includes('our product')) {
        enrichedContext.nomination_subject = 'product';
        logger.info('enriched_nomination_subject', { value: 'product', source: 'keyword' });
      } else if (messageLower.includes('myself') || messageLower.includes('i want to nominate me')) {
        enrichedContext.nomination_subject = 'individual';
        logger.info('enriched_nomination_subject', { value: 'individual', source: 'keyword' });
      } else if (messageLower.includes('organization') || messageLower.includes('company')) {
        enrichedContext.nomination_subject = 'organization';
        logger.info('enriched_nomination_subject', { value: 'organization', source: 'keyword' });
      }
    }
    
    // Build comprehensive description from conversation history if missing or too short
    if (!enrichedContext.description || enrichedContext.description.length < 50) {
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
        // For dashboard chatbot (no auth), use special anonymous UUID
        // Using a fixed UUID for all anonymous users: 00000000-0000-0000-0000-000000000000
        const effectiveUserId = userId || '00000000-0000-0000-0000-000000000000';
        const expiresAt = new Date(Date.now() + 3600000); // 1 hour
        
        // Initialize user context
        let initialContext: any = {
          geography: null,
          organization_name: null,
          job_title: null,
        };
        
        // Ensure the user exists in the database (for foreign key constraint)
        if (!userId) {
          // Anonymous user - ensure the anonymous user record exists
          const { data: existingAnonymous, error: checkError } = await this.supabase
            .from('users')
            .select('id')
            .eq('id', effectiveUserId)
            .single();
          
          if (checkError || !existingAnonymous) {
            // Create anonymous user record
            logger.info('creating_anonymous_user_record');
            const { error: anonInsertError } = await this.supabase
              .from('users')
              .insert({
                id: effectiveUserId,
                email: 'anonymous@stevieawards.com',
                full_name: 'Anonymous User',
                country: 'Unknown',
                organization_name: 'Anonymous',
              })
              .select()
              .single();
            
            if (anonInsertError && !anonInsertError.message.includes('duplicate key')) {
              logger.error('failed_to_create_anonymous_user', {
                error: anonInsertError.message,
              });
            }
          }
        }
        
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

      // Step 2: Classify intent (Node.js - no Python hop!)
      logger.info('step_1_classifying_intent');
      const intent = await intentClassifier.classifyIntent({
        message,
        conversationHistory,
        userContext,
      });

      logger.info('intent_classified', {
        intent: intent.intent,
        confidence: intent.confidence,
      });

      // Yield intent to client
      yield {
        type: 'intent',
        intent: intent.intent,
        confidence: intent.confidence,
      };

      // Step 3: If question intent, search KB
      let kbArticles: any[] | null = null;
      
      if (intent.intent === 'question' || intent.intent === 'mixed') {
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

      // Log detailed extraction results
      logger.info('extracted_fields_detail', {
        raw_extracted: extractedFields,
        context_before: {
          nomination_subject: userContext.nomination_subject,
          description: userContext.description?.substring(0, 100),
          org_type: userContext.org_type,
          org_size: userContext.org_size,
          achievement_focus: userContext.achievement_focus
        }
      });

      // Update context with extracted fields
      if (extractedFields && Object.keys(extractedFields).length > 0) {
        logger.info('fields_extracted', { fields: Object.keys(extractedFields) });
        userContext = { ...userContext, ...extractedFields };
        
        logger.info('context_after_extraction', {
          nomination_subject: userContext.nomination_subject,
          description: userContext.description?.substring(0, 100),
          org_type: userContext.org_type,
          org_size: userContext.org_size,
          achievement_focus: userContext.achievement_focus
        });
      } else {
        logger.warn('no_fields_extracted', { message: message.substring(0, 100) });
      }

      // Manual context enrichment as workaround for weak field extraction
      userContext = this.enrichContextFromConversation(userContext, message, conversationHistory);

      // Step 4: Generate response (Node.js streaming) with enriched context
      logger.info('step_4_generating_response');
      for await (const chunk of conversationManager.generateResponseStream({
        message,
        intent,
        conversationHistory,
        userContext,
        kbArticles,
      })) {
        yield {
          type: 'chunk',
          content: chunk,
        };
      }

      // Step 5: Check if ready for recommendations
      if (this.shouldGenerateRecommendations(userContext, message)) {
        logger.info('generating_recommendations');
        
        yield {
          type: 'status',
          message: 'Generating personalized category recommendations...'
        };

        try {
          // Fill in smart defaults for missing required fields
          const contextForRecommendations = {
            ...userContext,
            // Smart defaults if fields are missing
            org_type: userContext.org_type || 'for_profit',
            org_size: userContext.org_size || 'small', // Changed to small for startups/teams
            achievement_focus: userContext.achievement_focus || ['Innovation', 'Technology', 'Product Development', 'Artificial Intelligence', 'Consumer Products']
          };

          logger.info('recommendation_context', contextForRecommendations);

          const recommendations = await recommendationEngine.generateRecommendations(
            contextForRecommendations as any,
            { limit: 15, includeExplanations: true } // Increased limit
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
            context: userContext
          });
          
          // If recommendations fail, still continue conversation
          yield {
            type: 'chunk',
            content: '\n\nI have enough information, but I encountered an issue generating recommendations. Could you provide a bit more detail about your achievement?'
          };
        }
      }

      // Step 6: Update session with new message and context
      const updatedHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [
        ...conversationHistory,
        { role: 'user' as const, content: message },
      ];

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
   * Simple heuristic: if user mentions wanting recommendations or has enough info.
   */
  private shouldGenerateRecommendations(context: any, message: string): boolean {
    // Check if user is explicitly asking for recommendations
    const messageLower = message.toLowerCase();
    const askingForRecommendations = 
      messageLower.includes('yes') ||
      messageLower.includes('yeah') ||
      messageLower.includes('yep') ||
      messageLower.includes('yup') ||
      messageLower.includes('sure') ||
      messageLower.includes('please') ||
      messageLower.includes('pls') ||
      messageLower.includes('plz') ||
      messageLower.includes('recommend') ||
      messageLower.includes('categor') ||
      messageLower.includes('which award') ||
      messageLower.includes('what award') ||
      messageLower.includes('figure out') ||
      messageLower.includes('show me') ||
      messageLower.includes('find') ||
      messageLower.includes('go ahead') ||
      messageLower.includes('do it') ||
      messageLower.includes('ok') ||
      messageLower.includes('okay');

    // Check if we have minimum required fields for recommendations
    // Need: user_name, user_email, nomination_subject, and description
    const hasMinimumInfo = !!(
      context.user_name &&
      context.user_email &&
      context.nomination_subject &&
      context.description &&
      context.description.length > 20
    );

    logger.info('recommendation_check', {
      asking: askingForRecommendations,
      has_minimum: hasMinimumInfo,
      has_name: !!context.user_name,
      has_email: !!context.user_email,
      nomination_subject: context.nomination_subject,
      has_description: !!context.description,
      description_length: context.description?.length || 0,
      message: message.substring(0, 50)
    });

    // If user is asking AND we have minimum info, generate recommendations
    // We'll use smart defaults for missing fields
    if (askingForRecommendations && hasMinimumInfo) {
      return true;
    }

    return false;
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
