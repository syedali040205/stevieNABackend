import { getSupabaseClient } from '../config/supabase';
import axios from 'axios';
import logger from '../utils/logger';

interface KBArticle {
  id: string;
  title: string;
  content: string;
  content_type: string;
  program: string;
  category: string | null;
  keywords: string[];
  metadata: Record<string, any>;
  similarity_score: number;
  created_at: string;
}

/**
 * Chatbot Service
 * 
 * Handles RAG-based Q&A using knowledge base articles with streaming.
 * 
 * Flow:
 * 1. Generate embedding for user question (Python)
 * 2. Search similar KB articles (Supabase/pgvector)
 * 3. Stream answer using LLM + context (Python)
 */
export class ChatbotService {
  private supabase = getSupabaseClient();

  /**
   * Answer a user question using RAG with streaming.
   */
  async *answerQuestionStream(
    question: string,
    options: {
      maxArticles?: number;
      matchThreshold?: number;
    } = {}
  ): AsyncGenerator<any, void, unknown> {
    const { maxArticles = 5, matchThreshold = 0.5 } = options;

    logger.info('chatbot_stream_question_received', {
      question_length: question.length,
      max_articles: maxArticles,
      match_threshold: matchThreshold,
    });

    try {
      // Step 1: Generate embedding for question
      logger.info('step_1_generating_question_embedding');
      const embedding = await this.generateEmbedding(question);

      // Step 2: Search similar KB articles
      logger.info('step_2_searching_kb');
      const articles = await this.searchKB(embedding, maxArticles, matchThreshold);

      logger.info('kb_search_complete', {
        articles_found: articles.length,
      });

      if (articles.length === 0) {
        yield {
          type: 'metadata',
          confidence: 'low',
          sources: [],
        };
        yield {
          type: 'chunk',
          content: "I don't have enough information to answer that question. Could you please rephrase or ask about a specific Stevie Awards program?",
        };
        yield { type: 'done' };
        return;
      }

      // Step 3: Stream answer using Python AI service
      logger.info('step_3_streaming_answer');
      yield* this.generateAnswerStream(question, articles);

      logger.info('chatbot_stream_complete');
    } catch (error: any) {
      logger.error('chatbot_stream_error', {
        error: error.message,
        stack: error.stack,
      });
      throw new Error(`Failed to stream answer: ${error.message}`);
    }
  }

  /**
   * Generate embedding for question using Python AI service.
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
      const apiKey = process.env.INTERNAL_API_KEY || '';

      const response = await axios.post(
        `${aiServiceUrl}/api/generate-embedding`,
        {
          text: text,
          model: 'text-embedding-3-small',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          timeout: 30000,
        }
      );

      return response.data.embedding;
    } catch (error: any) {
      logger.error('embedding_generation_error', {
        error: error.message,
        status: error.response?.status,
      });
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Search KB articles using pgvector similarity.
   */
  private async searchKB(
    embedding: number[],
    limit: number,
    threshold: number
  ): Promise<KBArticle[]> {
    try {
      const { data, error } = await this.supabase.rpc('search_similar_content', {
        query_embedding: embedding,
        content_type_filter: 'kb_article',
        match_limit: limit,
        match_threshold: threshold,
      });

      if (error) {
        throw new Error(`KB search failed: ${error.message}`);
      }

      return (data || []) as KBArticle[];
    } catch (error: any) {
      logger.error('kb_search_error', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Generate answer using Python AI service with streaming.
   */
  private async *generateAnswerStream(
    question: string,
    articles: KBArticle[]
  ): AsyncGenerator<any, void, unknown> {
    try {
      const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
      const apiKey = process.env.INTERNAL_API_KEY || '';

      // Format articles for Python service
      const contextArticles = articles.map((article) => ({
        title: article.title,
        content: article.content,
        program: article.program || 'General',
        category: article.category,
        similarity_score: article.similarity_score,
      }));

      const response = await axios.post(
        `${aiServiceUrl}/api/chatbot/answer`,
        {
          question: question,
          context_articles: contextArticles,
          max_tokens: 500,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          responseType: 'stream',
          timeout: 60000,
        }
      );

      // Parse SSE stream
      const stream = response.data;
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));
            yield data;
          }
        }
      }
    } catch (error: any) {
      logger.error('answer_stream_error', {
        error: error.message,
        status: error.response?.status,
      });
      throw new Error(`Failed to stream answer: ${error.message}`);
    }
  }
}

// Export singleton instance
export const chatbotService = new ChatbotService();
