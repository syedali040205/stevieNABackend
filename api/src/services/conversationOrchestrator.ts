import { UserProfileManager } from './userProfileManager';
import { SessionManager, UserContext, SessionData } from './sessionManager';
import { aiServiceClient } from './aiServiceClient';
import { recommendationEngine } from './recommendationEngine';
import logger from '../utils/logger';

/**
 * Orchestrates the conversation flow for Stevie Awards recommendations.
 * Manages session state, calls Python AI service, and coordinates the recommendation pipeline.
 */
export class ConversationOrchestrator {
  private userProfileManager: UserProfileManager;
  private sessionManager: SessionManager;

  constructor() {
    this.userProfileManager = new UserProfileManager();
    this.sessionManager = new SessionManager();
  }

  /**
   * Map country to geography enum value.
   */
  private mapCountryToGeography(country: string): string {
    const countryLower = country.toLowerCase();

    // USA
    if (countryLower === 'usa' || countryLower === 'united states' || countryLower === 'us') {
      return 'usa';
    }

    // Canada
    if (countryLower === 'canada' || countryLower === 'ca') {
      return 'canada';
    }

    // Europe
    const europeanCountries = [
      'uk', 'united kingdom', 'england', 'scotland', 'wales', 'ireland',
      'france', 'germany', 'spain', 'italy', 'netherlands', 'belgium',
      'switzerland', 'austria', 'sweden', 'norway', 'denmark', 'finland',
      'poland', 'portugal', 'greece', 'czech republic', 'hungary', 'romania'
    ];
    if (europeanCountries.includes(countryLower)) {
      return 'europe';
    }

    // Latin America
    const latinAmericanCountries = [
      'mexico', 'brazil', 'argentina', 'colombia', 'chile', 'peru',
      'venezuela', 'ecuador', 'bolivia', 'paraguay', 'uruguay',
      'costa rica', 'panama', 'guatemala', 'honduras', 'nicaragua'
    ];
    if (latinAmericanCountries.includes(countryLower)) {
      return 'latin_america';
    }

    // Asia Pacific, Middle East, North Africa
    const apacMenaCountries = [
      'china', 'japan', 'india', 'australia', 'singapore', 'hong kong',
      'south korea', 'thailand', 'malaysia', 'indonesia', 'philippines',
      'vietnam', 'new zealand', 'taiwan', 'pakistan', 'bangladesh',
      'uae', 'saudi arabia', 'israel', 'egypt', 'south africa', 'turkey'
    ];
    if (apacMenaCountries.includes(countryLower)) {
      return 'asia_pacific_middle_east_north_africa';
    }

    // Default to worldwide
    return 'worldwide';
  }

  /**
   * Pre-populate UserContext from user profile.
   */
  private prepopulateUserContext(profile: any): UserContext {
    const context: UserContext = {
      geography: 'worldwide', // Default
      organization_name: '',
    };

    // Map country to geography
    if (profile.country) {
      context.geography = this.mapCountryToGeography(profile.country);
    }

    // Copy organization_name and job_title directly
    if (profile.organization_name) {
      context.organization_name = profile.organization_name;
    }

    if (profile.job_title) {
      context.job_title = profile.job_title;
    }

    logger.info('user_context_prepopulated', {
      geography: context.geography,
      has_org_name: !!context.organization_name,
      has_job_title: !!context.job_title,
    });

    return context;
  }

  /**
   * Start a new conversation session.
   */
  async startConversation(userId: string): Promise<{
    session_id: string;
    message: string | null;
    question: string | null;
    conversation_state: string;
    progress: {
      current: number;
      total: number;
    };
  }> {
    logger.info('starting_conversation', { user_id: userId });

    try {
      // Fetch user profile
      const profile = await this.userProfileManager.getProfile(userId);

      if (!profile) {
        throw new Error('User profile not found');
      }

      // Pre-populate UserContext from profile
      const userContext = this.prepopulateUserContext(profile);

      // Call Python AI service to generate first question
      const aiResponse = await aiServiceClient.generateQuestion(
        userContext,
        'initial'
      );

      // Create session in database
      const session = await this.sessionManager.createSession(
        userId,
        userContext,
        aiResponse.conversation_state as any
      );

      logger.info('conversation_started', {
        session_id: session.id,
        conversation_state: aiResponse.conversation_state,
      });

      return {
        session_id: session.id,
        message: aiResponse.message,
        question: aiResponse.question,
        conversation_state: aiResponse.conversation_state,
        progress: {
          current: Object.keys(userContext).filter(k => userContext[k as keyof UserContext]).length,
          total: 10, // Total fields to collect
        },
      };
    } catch (error: any) {
      logger.error('start_conversation_error', {
        user_id: userId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Process user response and continue conversation.
   */
  async processUserResponse(
    sessionId: string,
    userMessage: string
  ): Promise<{
    message: string | null;
    question: string | null;
    conversation_state: string;
    progress: {
      current: number;
      total: number;
    };
    recommendations?: any[];
  }> {
    logger.info('processing_user_response', {
      session_id: sessionId,
      message_length: userMessage.length,
    });

    try {
      // Retrieve session from database
      const session = await this.sessionManager.getSession(sessionId);

      if (!session) {
        throw new Error('Session not found');
      }

      // Call Python AI service to extract fields
      const extractionResult = await aiServiceClient.extractFields(
        session.session_data.user_context,
        userMessage,
        session.conversation_state
      );

      // Update session data
      const updatedSessionData: SessionData = {
        user_context: extractionResult.updated_context,
        conversation_history: [
          ...session.session_data.conversation_history,
          { role: 'user', content: userMessage }
        ]
      };

      logger.info('fields_extracted', {
        session_id: sessionId,
        extracted_fields: Object.keys(extractionResult.extracted_fields),
        is_complete: extractionResult.is_complete,
      });

      // Check if context is complete
      if (extractionResult.is_complete) {
        // Trigger recommendation generation
        logger.info('context_complete_triggering_recommendations', {
          session_id: sessionId,
        });

        // Update session to complete state
        await this.sessionManager.updateSession(
          sessionId,
          updatedSessionData,
          'complete' as any
        );

        // Generate recommendations
        try {
          const recommendations = await recommendationEngine.generateRecommendations(
            extractionResult.updated_context as any,
            {
              limit: 10,
              includeExplanations: true,
            }
          );

          logger.info('recommendations_generated_successfully', {
            session_id: sessionId,
            count: recommendations.length,
          });

          return {
            message: recommendations.length > 0
              ? `Great! I found ${recommendations.length} Stevie Awards categories that match your nomination.`
              : 'Thank you for the information. Unfortunately, I couldn\'t find any matching categories based on your criteria.',
            question: null,
            conversation_state: 'complete',
            progress: {
              current: 10,
              total: 10,
            },
            recommendations: recommendations,
          };
        } catch (error: any) {
          logger.error('recommendation_generation_failed', {
            session_id: sessionId,
            error: error.message,
            error_stack: error.stack,
            error_response: error.response?.data,
            context: extractionResult.updated_context,
          });

          return {
            message: `Thank you! I have all the information, but encountered an issue generating recommendations: ${error.message}. Please try again.`,
            question: null,
            conversation_state: 'complete',
            progress: {
              current: 10,
              total: 10,
            },
            recommendations: [],
          };
        }
      } else {
        // Generate next question
        const aiResponse = await aiServiceClient.generateQuestion(
          extractionResult.updated_context,
          session.conversation_state
        );

        // Add assistant message to history
        updatedSessionData.conversation_history.push({
          role: 'assistant',
          content: aiResponse.question || aiResponse.message || ''
        });

        await this.sessionManager.updateSession(
          sessionId,
          updatedSessionData,
          aiResponse.conversation_state as any
        );

        return {
          message: aiResponse.message,
          question: aiResponse.question,
          conversation_state: aiResponse.conversation_state,
          progress: {
            current: Object.keys(extractionResult.updated_context).filter(
              (key) => (extractionResult.updated_context as any)[key] !== undefined
            ).length,
            total: 10,
          },
        };
      }
    } catch (error: any) {
      logger.error('process_response_error', {
        session_id: sessionId,
        error: error.message,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const conversationOrchestrator = new ConversationOrchestrator();
