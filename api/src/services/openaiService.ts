import OpenAI from 'openai';
import logger from '../utils/logger';

/**
 * OpenAI Service
 * 
 * Handles all OpenAI API interactions:
 * - Chat completions (streaming and non-streaming)
 * - Embeddings generation
 * - Intent classification
 * - Field extraction
 */
export class OpenAIService {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }

    this.client = new OpenAI({ apiKey });
    logger.info('openai_service_initialized');
  }

  /**
   * Generate chat completion (non-streaming)
   */
  async chatCompletion(params: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const {
      messages,
      model = 'gpt-4o-mini',
      temperature = 0.7,
      maxTokens = 1000,
    } = params;

    try {
      const response = await this.client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      return response.choices[0]?.message?.content || '';
    } catch (error: any) {
      logger.error('openai_chat_completion_error', {
        error: error.message,
        model,
      });
      throw new Error(`OpenAI chat completion failed: ${error.message}`);
    }
  }

  /**
   * Generate chat completion with streaming
   */
  async *chatCompletionStream(params: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): AsyncGenerator<string, void, unknown> {
    const {
      messages,
      model = 'gpt-4o-mini',
      temperature = 0.7,
      maxTokens = 1000,
    } = params;

    try {
      const stream = await this.client.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (error: any) {
      logger.error('openai_stream_error', {
        error: error.message,
        model,
      });
      throw new Error(`OpenAI streaming failed: ${error.message}`);
    }
  }

  /**
   * Generate embedding for text
   */
  async generateEmbedding(text: string, model = 'text-embedding-ada-002'): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model,
        input: text,
      });

      return response.data[0].embedding;
    } catch (error: any) {
      logger.error('openai_embedding_error', {
        error: error.message,
        text_length: text.length,
      });
      throw new Error(`OpenAI embedding generation failed: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts (batched)
   */
  async generateEmbeddings(
    texts: string[],
    model = 'text-embedding-ada-002'
  ): Promise<number[][]> {
    try {
      // OpenAI supports batch embedding (up to 2048 inputs)
      const batchSize = 100;
      const embeddings: number[][] = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        
        const response = await this.client.embeddings.create({
          model,
          input: batch,
        });

        embeddings.push(...response.data.map(d => d.embedding));
      }

      return embeddings;
    } catch (error: any) {
      logger.error('openai_batch_embedding_error', {
        error: error.message,
        count: texts.length,
      });
      throw new Error(`OpenAI batch embedding failed: ${error.message}`);
    }
  }
}

// Export singleton instance
export const openaiService = new OpenAIService();
