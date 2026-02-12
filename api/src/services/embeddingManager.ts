import { getSupabaseClient } from "../config/supabase";
import { SupabaseClient } from "@supabase/supabase-js";
import { openaiService } from "./openaiService";
import logger from "../utils/logger";

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
    this.embeddingModel =
      process.env.EMBEDDING_MODEL || "text-embedding-ada-002";
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
    if (
      category.applicable_org_types &&
      category.applicable_org_types.length > 0
    ) {
      const orgTypes = category.applicable_org_types.join(", ");
      parts.push(`Eligible for ${orgTypes}.`);
    }

    // Focus areas
    if (category.achievement_focus && category.achievement_focus.length > 0) {
      const focusAreas = category.achievement_focus.join(", ");
      parts.push(`Focus areas: ${focusAreas}.`);
    }

    // Program name
    parts.push(`Program: ${category.program_name}.`);

    return parts.join(" ");
  }

  /**
   * Format user query into text for embedding.
   * OPTIMIZED: Achievement and focus areas come first for better semantic matching.
   */
  formatUserQueryText(context: UserContext): string {
    const parts: string[] = [];

    // 1. ACHIEVEMENT FIRST (most important for semantic matching)
    if (context.description) {
      parts.push(`Achievement: ${context.description}.`);
    }

    // 2. FOCUS AREAS (critical for matching relevant categories)
    if (context.achievement_focus && context.achievement_focus.length > 0) {
      const focusAreas = context.achievement_focus.join(", ");
      parts.push(`Focus areas: ${focusAreas}.`);
    }

    // 3. Nomination subject with context
    if (context.nomination_subject) {
      const subjectContext: Record<string, string> = {
        product: "Nominating a product or service",
        organization: "Nominating an entire organization",
        team: "Nominating a team or department",
        individual: "Nominating an individual person",
      };
      parts.push(
        subjectContext[context.nomination_subject] ||
          `Nominating: ${context.nomination_subject}.`,
      );
    }

    // 4. Organization context (less important for semantic matching)
    const orgDetails: string[] = [];
    if (context.org_type) {
      const orgTypeLabels: Record<string, string> = {
        for_profit: "For-profit organization",
        non_profit: "Non-profit organization",
        government: "Government organization",
        education: "Educational institution",
      };
      orgDetails.push(orgTypeLabels[context.org_type] || context.org_type);
    }
    if (context.org_size) {
      const sizeLabels: Record<string, string> = {
        small: "Small organization (up to 100 employees)",
        medium: "Medium organization (101-2,500 employees)",
        large: "Large organization (2,501+ employees)",
      };
      orgDetails.push(sizeLabels[context.org_size] || context.org_size);
    }
    if (orgDetails.length > 0) {
      parts.push(orgDetails.join(", ") + ".");
    }

    // 5. Tech orientation (helps distinguish tech vs non-tech categories)
    if (context.tech_orientation) {
      const techLabels: Record<string, string> = {
        tech_company: "Technology company",
        tech_user: "Technology user",
        non_tech: "Non-technology focused",
      };
      parts.push(
        techLabels[context.tech_orientation] || context.tech_orientation + ".",
      );
    }

    // 6. Operating scope
    if (context.operating_scope) {
      const scopeLabels: Record<string, string> = {
        local: "Local operations",
        regional: "Regional operations",
        national: "National operations",
        international: "International operations",
      };
      parts.push(
        scopeLabels[context.operating_scope] || context.operating_scope + ".",
      );
    }

    return parts.join(" ");
  }

  /**
   * Call Python AI Service to generate embedding for text.
   * Python handles the OpenAI API call.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    logger.info("generating_embedding", {
      text_length: text.length,
      model: this.embeddingModel,
    });

    try {
      // Use Node.js OpenAI service instead of Python AI service
      const embedding = await openaiService.generateEmbedding(text);

      logger.info("embedding_generated", {
        dimension: embedding.length,
      });

      return embedding;
    } catch (error: any) {
      logger.error("embedding_generation_error", {
        error: error.message,
      });
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Generate embedding for user query based on UserContext.
   * Uses LLM to create natural language query for better semantic matching.
   */
  async generateUserEmbedding(context: UserContext): Promise<number[]> {
    // Use LLM to generate natural search query
    const queryText = await this.generateSearchQuery(context);
    logger.info("generated_search_query", {
      text: queryText,
      context: context,
    });
    return this.generateEmbedding(queryText);
  }

  /**
   * Use LLM to generate a natural language search query from UserContext.
   * This produces better embeddings than manual string formatting.
   */
  private async generateSearchQuery(context: UserContext): Promise<string> {
    try {
      // Use Node.js OpenAI service to generate search query
      const prompt = `Generate a focused search query for finding award categories based on this context:

Description: ${context.description || 'Not provided'}
Focus Areas: ${context.achievement_focus?.join(', ') || 'Not specified'}
Nominating: ${context.nomination_subject || 'Not specified'}
Organization Type: ${context.org_type || 'Not specified'}
Organization Size: ${context.org_size || 'Not specified'}

Create a search query (2-3 sentences) that emphasizes:
1. The specific product/innovation/achievement (not just generic "innovation")
2. The key technologies or focus areas mentioned
3. The impact or unique value proposition
4. Relevant industry or domain

Be specific and concrete. Focus on WHAT was built/achieved, not just WHO is being nominated.`;

      const query = await openaiService.chatCompletion({
        messages: [
          { role: 'system', content: 'You are a search query generator for award categories. Create specific, concrete queries that emphasize the actual achievement, product, or innovation - not generic terms.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        maxTokens: 150,
      });

      return query.trim();
    } catch (error: any) {
      logger.warn("search_query_generation_failed_using_fallback", {
        error: error.message,
      });
      // Fallback to manual formatting if LLM fails
      return this.formatUserQueryText(context);
    }
  }

  /**
   * Perform similarity search using pgvector.
   * Optionally filters by geography and nomination_subject in the database.
   */
  async performSimilaritySearch(
    userEmbedding: number[],
    userGeography?: string,
    userNominationSubject?: string,
    limit: number = 10,
  ): Promise<SimilarityResult[]> {
    logger.info("performing_similarity_search", {
      user_geography: userGeography || "all",
      user_nomination_subject: userNominationSubject || "all",
      limit: limit,
      embedding_dimension: userEmbedding.length,
    });

    try {
      // Call updated function with geography and nomination_subject parameters
      const { data, error } = await this.client.rpc(
        "search_similar_categories",
        {
          query_embedding: userEmbedding,
          user_geography: userGeography || null,
          user_nomination_subject: userNominationSubject || null,
          match_limit: limit,
        },
      );

      if (error) {
        logger.error("similarity_search_error", {
          error: error.message,
          code: error.code,
        });
        throw new Error(
          `Failed to perform similarity search: ${error.message}`,
        );
      }

      logger.info("similarity_search_complete", {
        results_count: data?.length || 0,
      });

      // Log detailed similarity scores for analysis
      if (data && data.length > 0) {
        logger.info("similarity_results_detail", {
          top_results: data.slice(0, 5).map((r: any) => ({
            category: r.category_name,
            score: Math.round(r.similarity_score * 1000) / 1000,
            focus: r.achievement_focus,
            program: r.program_name,
          })),
        });
      }

      return (data || []) as SimilarityResult[];
    } catch (error: any) {
      logger.error("similarity_search_exception", {
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
    logger.info("precomputing_category_embedding", {
      category_id: category.category_id,
      category_name: category.category_name,
    });

    try {
      // Format category text
      const categoryText = this.formatCategoryText(category);

      // Generate embedding
      const embedding = await this.generateEmbedding(categoryText);

      // Store in database
      const { error } = await this.client.from("category_embeddings").upsert({
        category_id: category.category_id,
        embedding: embedding,
        embedding_text: categoryText,
      });

      if (error) {
        logger.error("store_embedding_error", {
          error: error.message,
          category_id: category.category_id,
        });
        throw new Error(`Failed to store embedding: ${error.message}`);
      }

      logger.info("category_embedding_stored", {
        category_id: category.category_id,
      });
    } catch (error: any) {
      logger.error("precompute_embedding_exception", {
        error: error.message,
        category_id: category.category_id,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const embeddingManager = new EmbeddingManager();
