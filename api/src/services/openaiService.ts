import OpenAI from 'openai';
import logger from '../utils/logger';
import { createCircuitBreaker } from '../utils/circuitBreaker';
import { openaiTokensTotal } from '../utils/metrics';
import { cacheManager } from './cacheManager';

const OPENAI_TIMEOUT_MS = 30000; // 30s (industry practice: timeout all outbound calls)
const RETRY_MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 1000;

function isRetryableError(error: any): boolean {
  const status = error?.status ?? error?.response?.status;
  if (status === 429) return true; // rate limit
  if (status >= 500 && status < 600) return true; // server error
  return false;
}

async function retryWithBackoff<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (!isRetryableError(error) || attempt === RETRY_MAX_ATTEMPTS) throw error;
      const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      logger.warn('openai_retry', { attempt, max: RETRY_MAX_ATTEMPTS, delayMs: delay, error: error.message });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/** Single shared circuit breaker for all OpenAI calls (fail fast when open). */
const openaiCircuitBreaker = createCircuitBreaker(
  (fn: () => Promise<any>) => fn(),
  async () => {
    throw new Error('AI service temporarily unavailable. Please try again shortly.');
  }
);

/**
 * OpenAI Service
 *
 * Handles all OpenAI API interactions with timeouts, retries, and circuit breaker.
 */
export class OpenAIService {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required');
    }

    this.client = new OpenAI({
      apiKey,
      timeout: OPENAI_TIMEOUT_MS,
    });
    logger.info('openai_service_initialized', { timeoutMs: OPENAI_TIMEOUT_MS });
  }

  /**
   * Generate chat completion (non-streaming). Uses retry + circuit breaker.
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
      const r = await openaiCircuitBreaker.fire(() =>
        retryWithBackoff(() =>
          this.client.chat.completions.create({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
          })
        )
      );
      if (r?.usage) {
        openaiTokensTotal.inc({ type: 'prompt' }, r.usage.prompt_tokens ?? 0);
        openaiTokensTotal.inc({ type: 'completion' }, r.usage.completion_tokens ?? 0);
      }
      return r.choices[0]?.message?.content || '';
    } catch (error: any) {
      logger.error('openai_chat_completion_error', { error: error.message, model });
      throw error;
    }
  }

  /**
   * Generate chat completion with streaming. Create call uses retry + circuit breaker.
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

    let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
    try {
      stream = await openaiCircuitBreaker.fire(() =>
        retryWithBackoff(() =>
          this.client.chat.completions.create({
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            stream: true,
            stream_options: { include_usage: true },
          })
        )
      );
    } catch (error: any) {
      logger.error('openai_stream_error', { error: error.message, model });
      throw error;
    }

    let lastUsage: OpenAI.Chat.Completions.ChatCompletionChunk['usage'] | undefined;
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
      if (chunk.usage) lastUsage = chunk.usage;
    }
    if (lastUsage) {
      openaiTokensTotal.inc({ type: 'prompt' }, lastUsage.prompt_tokens ?? 0);
      openaiTokensTotal.inc({ type: 'completion' }, lastUsage.completion_tokens ?? 0);
    }
  }

  /**
   * Generate embedding for text. Uses retry + circuit breaker + Redis cache.
   */
  async generateEmbedding(text: string, model = 'text-embedding-ada-002'): Promise<number[]> {
    // Check cache first
    const cached = await cacheManager.getEmbedding(text, model);
    if (cached) {
      logger.debug('embedding_cache_hit', { text_length: text.length, model });
      return cached;
    }

    // Cache miss - call OpenAI
    try {
      const r = await openaiCircuitBreaker.fire(() =>
        retryWithBackoff(() => this.client.embeddings.create({ model, input: text }))
      );
      const total = r?.usage?.total_tokens ?? 0;
      if (total > 0) openaiTokensTotal.inc({ type: 'prompt' }, total);
      
      const embedding = r.data[0].embedding;
      
      // Store in cache (fire and forget - don't block on cache write)
      cacheManager.setEmbedding(text, model, embedding).catch((err) => {
        logger.warn('embedding_cache_write_failed', { error: err.message });
      });
      
      return embedding;
    } catch (error: any) {
      logger.error('openai_embedding_error', { error: error.message, text_length: text.length });
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts (batched). Uses retry + circuit breaker + Redis cache per batch.
   */
  async generateEmbeddings(
    texts: string[],
    model = 'text-embedding-ada-002'
  ): Promise<number[][]> {
    const batchSize = 100;
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      // Check cache for each text in batch
      const cachedResults: (number[] | null)[] = await Promise.all(
        batch.map(text => cacheManager.getEmbedding(text, model))
      );
      
      // Separate cached vs uncached
      const uncachedIndices: number[] = [];
      const uncachedTexts: string[] = [];
      cachedResults.forEach((cached, idx) => {
        if (cached) {
          embeddings.push(cached);
        } else {
          uncachedIndices.push(embeddings.length);
          uncachedTexts.push(batch[idx]);
          embeddings.push([]); // placeholder
        }
      });
      
      if (uncachedTexts.length > 0) {
        logger.debug('embedding_batch_cache_miss', { 
          total: batch.length, 
          cached: batch.length - uncachedTexts.length,
          uncached: uncachedTexts.length 
        });
        
        try {
          const r = await openaiCircuitBreaker.fire(() =>
            retryWithBackoff(() => this.client.embeddings.create({ model, input: uncachedTexts }))
          );
          const total = r?.usage?.total_tokens ?? 0;
          if (total > 0) openaiTokensTotal.inc({ type: 'prompt' }, total);
          
          // Fill in placeholders with fresh embeddings
          r.data.forEach((d: { embedding: number[] }, idx: number) => {
            const embeddingIdx = uncachedIndices[idx];
            embeddings[embeddingIdx] = d.embedding;
            
            // Cache each embedding (fire and forget)
            cacheManager.setEmbedding(uncachedTexts[idx], model, d.embedding).catch((err) => {
              logger.warn('embedding_batch_cache_write_failed', { error: err.message });
            });
          });
        } catch (error: any) {
          logger.error('openai_batch_embedding_error', { error: error.message, count: texts.length });
          throw error;
        }
      } else {
        logger.debug('embedding_batch_full_cache_hit', { count: batch.length });
      }
    }

    return embeddings;
  }
}

// Export singleton instance
export const openaiService = new OpenAIService();
