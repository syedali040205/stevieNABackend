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
  gender?: string; // 'male', 'female', 'other', 'prefer_not_to_say'
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
  metadata?: {
    nomination_subject_type: string;
    applicable_org_types: string[];
    applicable_org_sizes: string[];
    achievement_focus: string[];
    geographic_scope: string[];
    is_free: boolean;
    gender_requirement?: string;
  };
}

/** Expected embedding dimension for pgvector (ada-002 and 3-small both use 1536). */
export const EMBEDDING_DIMENSION = 1536;

/**
 * Embedding Manager for generating embeddings and performing similarity search.
 * Handles both category and user query embeddings using OpenAI API.
 * Category and query must use the same model; pgvector column must be dimension 1536.
 */
export class EmbeddingManager {
  private client: SupabaseClient;
  private embeddingModel: string;

  constructor(client?: SupabaseClient) {
    this.client = client || getSupabaseClient();
    // Use 3-small for better semantic accuracy (1536 dims); must match category_embeddings table.
    this.embeddingModel =
      process.env.EMBEDDING_MODEL || "text-embedding-3-small";
  }

  /**
   * Format category information into text for embedding.
   * Structure puts discriminative terms first (focus areas, name) for better semantic match.
   */
  formatCategoryText(category: Category): string {
    const parts: string[] = [];

    // Focus areas first (strong signal for matching user achievements)
    if (category.achievement_focus && category.achievement_focus.length > 0) {
      const focusAreas = category.achievement_focus.join(", ");
      parts.push(`Focus areas: ${focusAreas}.`);
    }

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

    // Program name
    parts.push(`Program: ${category.program_name}.`);

    return parts.join(" ");
  }

  /**
   * Format user query to mirror category text structure so query and documents
   * live in the same semantic space (same phrasing: "Focus areas:", "Nominating", etc.).
   * Optionally enriches with synonyms for better semantic overlap (see expandQuerySynonyms).
   */
  formatUserQueryText(context: UserContext, enrichWithSynonyms: boolean = true): string {
    const parts: string[] = [];

    // Focus areas first (same order as formatCategoryText)
    if (context.achievement_focus && context.achievement_focus.length > 0) {
      const focus = context.achievement_focus.join(", ");
      parts.push(`Focus areas: ${enrichWithSynonyms ? this.expandFocusAreas(focus) : focus}.`);
    }

    // Achievement description (main semantic content); enrich with related terms for better match
    if (context.description) {
      parts.push(enrichWithSynonyms ? this.expandDescriptionForSearch(context.description) : context.description);
    }

    // Nomination subject (same phrasing as category side)
    if (context.nomination_subject) {
      parts.push(`Nominating ${context.nomination_subject}.`);
    }

    // Optional: org type/size so "Eligible for" style match
    if (context.org_type) {
      parts.push(`Organization type: ${context.org_type}.`);
    }

    return parts.length > 0 ? parts.join(" ") : "Award category recommendation.";
  }

  /**
   * Expand focus area phrases with related terms for better semantic overlap with category embeddings.
   */
  private expandFocusAreas(focus: string): string {
    const lower = focus.toLowerCase();
    const additions: string[] = [];
    if (lower.includes("innovation")) additions.push("breakthrough achievements", "pioneering work");
    if (lower.includes("technology") || lower.includes("tech")) additions.push("technology excellence", "technical achievement");
    if (lower.includes("artificial intelligence") || lower.includes("ai ")) additions.push("machine learning", "intelligent systems");
    if (lower.includes("customer service")) additions.push("client satisfaction", "customer experience");
    if (lower.includes("product")) additions.push("product excellence", "product innovation", "new product");
    if (lower.includes("marketing")) additions.push("marketing excellence", "brand", "growth");
    if (additions.length === 0) return focus;
    return [focus, ...additions].join(". ");
  }

  /**
   * Expand description with related keywords so short/generic descriptions match category text better.
   */
  private expandDescriptionForSearch(description: string): string {
    const lower = description.toLowerCase();
    const terms: string[] = [description];
    if (lower.includes("ai ") || lower.includes("artificial intelligence")) terms.push("machine learning", "intelligent systems", "technology innovation");
    if (lower.includes("product")) terms.push("product development", "product excellence", "innovation");
    if (lower.includes("team")) terms.push("team achievement", "collaboration", "excellence");
    if (lower.includes("customer") || lower.includes("client")) terms.push("customer service", "client satisfaction");
    if (lower.includes("award") || lower.includes("won") || lower.includes("winner")) terms.push("excellence", "achievement", "recognition");
    return terms.join(". ");
  }

  /**
   * Use LLM to generate a rich search query from user context (more synonyms, context, award-relevant terms).
   * Improves semantic match when category embeddings are generic. Set RICH_QUERY_EXPANSION=true to enable.
   */
  async generateRichSearchQuery(context: UserContext): Promise<string> {
    const template = this.formatUserQueryText(context, false);
    const systemPrompt = `You are a search query expander for an award recommendation system. Given the user's nomination context, output a single paragraph (4-6 sentences) that will be embedded and matched against award category descriptions.

Rules:
- Start with "Focus areas: " and list/expand their focus areas with related terms (e.g. Innovation → breakthrough achievements, pioneering work).
- Then expand the achievement description with: specific technologies and features, business value, industry context, and award-relevant terms (excellence, achievement, recognition, leadership).
- Use the same style as category text: concrete nouns, no marketing fluff. Include synonyms so "AI product" also mentions "artificial intelligence", "machine learning", "technology product".
- End with "Nominating X. Organization type: Y" if known.
- Output ONLY the paragraph, no markdown, no labels.`;

    const userPrompt = `Expand this nomination context into a rich search paragraph:\n\n${template}`;

    try {
      const out = await openaiService.chatCompletion({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        model: "gpt-4o-mini",
        maxTokens: 400,
        temperature: 0.3,
      });
      const trimmed = (out || "").trim();
      if (trimmed.length > 50) {
        logger.info("rich_search_query_generated", { length: trimmed.length });
        return trimmed;
      }
    } catch (error: any) {
      logger.warn("rich_query_expansion_failed", { error: error.message });
    }
    return this.formatUserQueryText(context, true);
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
      const embedding = await openaiService.generateEmbedding(
        text,
        this.embeddingModel
      );

      if (embedding.length !== EMBEDDING_DIMENSION) {
        logger.warn("embedding_dimension_mismatch", {
          expected: EMBEDDING_DIMENSION,
          actual: embedding.length,
          model: this.embeddingModel,
        });
      }
      logger.info("embedding_generated", {
        dimension: embedding.length,
        model: this.embeddingModel,
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
   * When RICH_QUERY_EXPANSION=true, uses LLM to expand context into a richer paragraph for better semantic match.
   * Otherwise uses template-based query with synonym expansion.
   */
  async generateUserEmbedding(context: UserContext): Promise<number[]> {
    const useRichExpansion = process.env.RICH_QUERY_EXPANSION === "true" || process.env.RICH_QUERY_EXPANSION === "1";
    const queryText = useRichExpansion
      ? await this.generateRichSearchQuery(context)
      : this.formatUserQueryText(context, true);
    
    // Log the full query text for debugging
    if (useRichExpansion) {
      logger.info("HYDE_DOCUMENT_GENERATED", {
        full_text: queryText,
        length: queryText.length
      });
      console.log('\n' + '='.repeat(80));
      console.log('🎯 HyDE GENERATED DOCUMENT:');
      console.log('='.repeat(80));
      console.log(queryText);
      console.log('='.repeat(80) + '\n');
    }
    
    logger.info("generated_search_query", {
      text: queryText.substring(0, 300),
      rich_expansion: useRichExpansion,
    });
    return this.generateEmbedding(queryText);
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
    userOrgType?: string,
    userAchievementFocus?: string[],
    userGender?: string,
  ): Promise<SimilarityResult[]> {
    logger.info("performing_similarity_search", {
      user_geography: userGeography || "all",
      user_nomination_subject: userNominationSubject || "all",
      user_org_type: userOrgType || "all",
      user_achievement_focus: userAchievementFocus?.join(", ") || "all",
      user_gender: userGender || "any",
      limit: limit,
      embedding_dimension: userEmbedding.length,
    });

    try {
      // Call updated function with metadata filtering parameters
      const { data, error } = await this.client.rpc(
        "search_similar_categories",
        {
          query_embedding: userEmbedding,
          user_geography: userGeography || null,
          user_nomination_subject: userNominationSubject || null,
          match_limit: limit,
          user_org_type: userOrgType || null,
          user_achievement_focus: userAchievementFocus || null,
          user_gender: userGender || null,
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
