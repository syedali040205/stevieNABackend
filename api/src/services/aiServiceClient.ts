import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';
import { createCircuitBreaker } from '../utils/circuitBreaker';
import CircuitBreaker from 'opossum';

/**
 * Client for communicating with the Python AI Service.
 * Handles question generation, field extraction, and match explanations.
 * Includes circuit breaker for resilience.
 */
export class AIServiceClient {
  private client: AxiosInstance;
  private baseURL: string;
  private apiKey: string;
  private generateQuestionBreaker: CircuitBreaker<any, any>;
  private extractFieldsBreaker: CircuitBreaker<any, any>;
  private generateExplanationsBreaker: CircuitBreaker<any, any>;

  constructor() {
    this.baseURL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
    this.apiKey = process.env.INTERNAL_API_KEY || '';

    if (!this.apiKey) {
      throw new Error('INTERNAL_API_KEY environment variable is required');
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 35000, // 35 seconds (AI service has 30s timeout)
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.info('ai_service_request', {
          method: config.method,
          url: config.url,
          baseURL: config.baseURL,
        });
        return config;
      },
      (error) => {
        logger.error('ai_service_request_error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.info('ai_service_response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error) => {
        logger.error('ai_service_response_error', {
          status: error.response?.status,
          message: error.message,
          url: error.config?.url,
        });
        return Promise.reject(error);
      }
    );

    // Create circuit breakers for each operation
    this.generateQuestionBreaker = createCircuitBreaker(
      this._generateQuestionInternal.bind(this),
      this._generateQuestionFallback.bind(this)
    );

    this.extractFieldsBreaker = createCircuitBreaker(
      this._extractFieldsInternal.bind(this)
    );

    this.generateExplanationsBreaker = createCircuitBreaker(
      this._generateExplanationsInternal.bind(this)
    );
  }

  /**
   * Internal method for generating questions (wrapped by circuit breaker).
   */
  private async _generateQuestionInternal(
    userContext: any,
    conversationState?: string
  ): Promise<any> {
    const response = await this.client.post('/api/generate-question', {
      user_context: userContext,
      conversation_state: conversationState,
    });
    return response.data;
  }

  /**
   * Fallback for question generation when circuit is open.
   */
  private async _generateQuestionFallback(
    _userContext: any,
    conversationState?: string
  ): Promise<any> {
    logger.warn('using_question_generation_fallback', {
      conversation_state: conversationState,
    });

    // Return a generic question based on conversation state
    const fallbackQuestions: Record<string, string> = {
      collecting_org_type: 'What type of organization are you nominating? (for-profit, non-profit, or government)',
      collecting_org_size: 'What is the size of your organization? (small: up to 100 employees, medium: 101-2,500, or large: 2,501+)',
      collecting_nomination_subject: 'What are you nominating? (organization, team, individual, or product)',
      collecting_description: 'Please describe the achievement or accomplishment you\'d like to nominate.',
      collecting_achievement_focus: 'What areas does this achievement focus on? (e.g., Marketing, Innovation, Customer Service)',
    };

    return {
      question: fallbackQuestions[conversationState || ''] || 'Could you tell me more about your nomination?',
      message: null,
      conversation_state: conversationState || 'collecting_org_type',
      extracted_fields: {},
    };
  }

  /**
   * Internal method for extracting fields (wrapped by circuit breaker).
   */
  private async _extractFieldsInternal(
    userContext: any,
    userMessage: string,
    conversationState?: string
  ): Promise<any> {
    const response = await this.client.post('/api/extract-fields', {
      user_context: userContext,
      user_message: userMessage,
      conversation_state: conversationState,
    });
    return response.data;
  }

  /**
   * Internal method for generating explanations (wrapped by circuit breaker).
   */
  private async _generateExplanationsInternal(
    userContext: any,
    categories: any[]
  ): Promise<any> {
    const response = await this.client.post('/api/generate-explanations', {
      user_context: userContext,
      categories: categories,
    });
    return response.data;
  }

  /**
   * Generate the next question based on user context.
   * Uses circuit breaker with fallback.
   */
  async generateQuestion(
    userContext: any,
    conversationState?: string
  ): Promise<{
    question: string | null;
    message: string | null;
    conversation_state: string;
    extracted_fields: any;
  }> {
    try {
      return await this.generateQuestionBreaker.fire(userContext, conversationState);
    } catch (error: any) {
      logger.error('generate_question_failed', {
        error: error.message,
      });
      throw new Error(`Failed to generate question: ${error.message}`);
    }
  }

  /**
   * Extract fields from user's message.
   * Uses circuit breaker.
   */
  async extractFields(
    userContext: any,
    userMessage: string,
    conversationState?: string
  ): Promise<{
    extracted_fields: any;
    is_complete: boolean;
    updated_context: any;
  }> {
    try {
      return await this.extractFieldsBreaker.fire(userContext, userMessage, conversationState);
    } catch (error: any) {
      logger.error('extract_fields_failed', {
        error: error.message,
      });
      throw new Error(`Failed to extract fields: ${error.message}`);
    }
  }

  /**
   * Generate match explanations for categories.
   * Uses circuit breaker.
   */
  async generateExplanations(
    userContext: any,
    categories: any[]
  ): Promise<{
    explanations: Array<{
      category_id: string;
      match_reasons: string[];
    }>;
  }> {
    try {
      return await this.generateExplanationsBreaker.fire(userContext, categories);
    } catch (error: any) {
      logger.error('generate_explanations_failed', {
        error: error.message,
      });
      // Don't throw - explanations are optional
      return { explanations: [] };
    }
  }

  /**
   * Check health of AI service.
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get circuit breaker statistics for monitoring.
   */
  getCircuitBreakerStats() {
    return {
      generateQuestion: {
        state: this.generateQuestionBreaker.opened ? 'open' : 'closed',
        stats: this.generateQuestionBreaker.stats,
      },
      extractFields: {
        state: this.extractFieldsBreaker.opened ? 'open' : 'closed',
        stats: this.extractFieldsBreaker.stats,
      },
      generateExplanations: {
        state: this.generateExplanationsBreaker.opened ? 'open' : 'closed',
        stats: this.generateExplanationsBreaker.stats,
      },
    };
  }
}

// Export singleton instance
export const aiServiceClient = new AIServiceClient();
