import { getSupabaseClient } from '../config/supabase';
import { SupabaseClient } from '@supabase/supabase-js';
import axios from 'axios';
import logger from '../utils/logger';

interface UserContext {
  geography?: string;
  organization_name?: string;
  job_title?: string;
  org_type?: string;
  org_size?: string;
  nomination_subject?: string;
  description?: string;
  achievement_focus?: string[];
  tech_orientation?: string;
  operating_scope?: string;
}

interface Category {
  category_id: string;
  category_name: string;
  description: string;
  program_name: string;
  applicable_org_types: string[];
  achievement_focus: string[];
}

interface SimilarityResult {
  category_id: string;
  similarity_score: number;
  category_name: string;
  description: string;
  program_name: string;
  program_code: string;
  geographic_scope: string[];
  applicable_org_types: string[];
  applicable_org_sizes: string[];
  nomination_subject_type: string;
  achievement_focus: string[];
}

/**
 * Embedding Manager for generating embeddings and performing similarity search.
 * Handles both category and user query embeddings using OpenAI API.
 */
export class EmbeddingManager {
  private client: SupabaseClient;
  private embeddingModel: string;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
    this.embeddingModel = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
  }

  /**
   * Format category information into text for embedding.
   * Format: "[Category Name]. [Description]. Eligible for [org types]. Focus areas: [achievement_focus]. Program: [Program Name]."
   */
  formatCategoryText(category: Category): string {
    const parts: string[] = [];

    // Category name and description
    parts.push(`${category.category_name}. ${category.description}.`);

    // Eligible organization types
    if (category.applicable_org_types && category.applicable_org_types.length > 0) {
      const orgTypes = category.applicable_org_types.join(', ');
      parts.push(`Eligible for ${orgTypes}.`);
    }

    // Focus areas
    if (category.achievement_focus && category.achievement_focus.length > 0) {
      const focusAreas = category.achievement_focus.join(', ');
      parts.push(`Focus areas: ${focusAreas}.`);
    }

    // Program name
    parts.push(`Program: ${category.program_name}.`);

    return parts.join(' ');
  }

  /**
   * Format user query into text for embedding.
   * Format: "Organization: [organization_name] in [geography]. Type: [org_type], Size: [org_size]. 
   * Nominating: [nomination_subject]. Achievement: [description]. Focus areas: [achievement_focus]. 
   * Tech orientation: [tech_orientation]. Operating scope: [operating_scope]."
   */
  formatUserQueryText(context: UserContext): string {
    const parts: string[] = [];

    // Organization and location
    if (context.organization_name && context.geography) {
      parts.push(`Organization: ${context.organization_name} in ${context.geography}.`);
    } else if (context.organization_name) {
      parts.push(`Organization: ${context.organization_name}.`);
    } else if (context.geography) {
      parts.push(`Location: ${context.geography}.`);
    }

    // Organization type and size
    const orgDetails: string[] = [];
    if (context.org_type) {
      orgDetails.push(`Type: ${context.org_type}`);
    }
    if (context.org_size) {
      orgDetails.push(`Size: ${context.org_size}`);
    }
    if (orgDetails.length > 0) {
      parts.push(orgDetails.join(', ') + '.');
    }

    // Nomination subject
    if (context.nomination_subject) {
      parts.push(`Nominating: ${context.nomination_subject}.`);
    }

    // Achievement description
    if (context.description) {
      parts.push(`Achievement: ${context.description}.`);
    }

    // Focus areas
    if (context.achievement_focus && context.achievement_focus.length > 0) {
      const focusAreas = context.achievement_focus.join(', ');
      parts.push(`Focus areas: ${focusAreas}.`);
    }

    // Tech orientation
    if (context.tech_orientation) {
      parts.push(`Tech orientation: ${context.tech_orientation}.`);
    }

    // Operating scope
    if (context.operating_scope) {
      parts.push(`Operating scope: ${context.operating_scope}.`);
    }

    return parts.join(' ');
  }

  /**
   * Call Python AI Service to generate embedding for text.
   * Python handles the OpenAI API call.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    logger.info('generating_embedding', {
      text_length: text.length,
      model: this.embeddingModel,
    });

    try {
      const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
      const apiKey = process.env.INTERNAL_API_KEY || '';

      const response = await axios.post(
        `${aiServiceUrl}/api/generate-embedding`,
        {
          text: text,
          model: this.embeddingModel,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          timeout: 30000,
        }
      );

      const embedding = response.data.embedding;

      logger.info('embedding_generated', {
        dimension: embedding.length,
        tokens_used: response.data.tokens_used || 'unknown',
      });

      return embedding;
    } catch (error: any) {
      logger.error('embedding_generation_error', {
        error: error.message,
        status: error.response?.status,
      });
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Generate embedding for user query based on UserContext.
   */
  async generateUserEmbedding(context: UserContext): Promise<number[]> {
    const queryText = this.formatUserQueryText(context);
    logger.info('formatted_user_query_text', {
      text: queryText,
      context: context,
    });
    return this.generateEmbedding(queryText);
  }

  /**
   * Perform similarity search using pgvector.
   * Optionally filters by geography in the database.
   */
  async performSimilaritySearch(
    userEmbedding: number[],
    userGeography?: string,
    limit: number = 10
  ): Promise<SimilarityResult[]> {
    logger.info('performing_similarity_search', {
      user_geography: userGeography || 'all',
      limit: limit,
      embedding_dimension: userEmbedding.length,
    });

    try {
      // Call updated function with geography parameter
      const { data, error } = await this.client.rpc('search_similar_categories', {
        query_embedding: userEmbedding,
        user_geography: userGeography || null,
        match_limit: limit,
      });

      if (error) {
        logger.error('similarity_search_error', {
          error: error.message,
          code: error.code,
        });
        throw new Error(`Failed to perform similarity search: ${error.message}`);
      }

      logger.info('similarity_search_complete', {
        results_count: data?.length || 0,
      });

      return (data || []) as SimilarityResult[];
    } catch (error: any) {
      logger.error('similarity_search_exception', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Precompute and store embedding for a category.
   * Used during data ingestion.
   */
  async precomputeCategoryEmbedding(category: Category): Promise<void> {
    logger.info('precomputing_category_embedding', {
      category_id: category.category_id,
      category_name: category.category_name,
    });

    try {
      // Format category text
      const categoryText = this.formatCategoryText(category);

      // Generate embedding
      const embedding = await this.generateEmbedding(categoryText);

      // Store in database
      const { error } = await this.client.from('category_embeddings').upsert({
        category_id: category.category_id,
        embedding: embedding,
        embedding_text: categoryText,
      });

      if (error) {
        logger.error('store_embedding_error', {
          error: error.message,
          category_id: category.category_id,
        });
        throw new Error(`Failed to store embedding: ${error.message}`);
      }

      logger.info('category_embedding_stored', {
        category_id: category.category_id,
      });
    } catch (error: any) {
      logger.error('precompute_embedding_exception', {
        error: error.message,
        category_id: category.category_id,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const embeddingManager = new EmbeddingManager();
