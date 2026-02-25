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
  achievement_impact?: string; // Impact description for intent detection
  achievement_innovation?: string; // Innovation description for intent detection
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
- Then expand the achievement description based on its nature:
  * For SOCIAL IMPACT/HUMANITARIAN achievements (helping people, community service, charitable work, healthcare, education access): emphasize social good, community impact, humanitarian initiative, life-changing impact, charitable work, social responsibility, making a difference
  * For TECHNOLOGY/BUSINESS achievements: emphasize specific technologies, business value, industry context, innovation, technical excellence
  * For CREATIVE/CONTENT achievements: emphasize storytelling, audience engagement, creative innovation, media excellence
- Always include award-relevant terms (excellence, achievement, recognition, leadership, impact).
- Use the same style as category text: concrete nouns, no marketing fluff. Include synonyms and related concepts.
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
   * Generate embedding for text using OpenAI API.
   * Handles the OpenAI API call directly in Node.js.
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
      text: queryText.substring(0, 500), // Increased from 300 to 500 for better visibility
      rich_expansion: useRichExpansion,
    });
    return this.generateEmbedding(queryText);
  }

  /**
   * Detect category types (intent) from user context using OpenAI.
   * Analyzes the full context to determine PRIMARY intent, not just keywords.
   * Returns array of category types to filter by, or undefined for no filtering.
   */
  async detectCategoryTypes(context: UserContext): Promise<string[] | undefined> {
    const description = context.description || '';
    const achievementImpact = context.achievement_impact || '';
    const achievementInnovation = context.achievement_innovation || '';
    
    // If description is too short, fall back to keyword matching
    if (description.length < 20) {
      return this.detectCategoryTypesKeyword(context);
    }
    
    // Check if LLM-based intent detection is enabled (default: true for better accuracy)
    const useLLMIntent = process.env.USE_LLM_INTENT_DETECTION !== 'false';
    
    if (!useLLMIntent) {
      logger.info('llm_intent_detection_disabled', { note: 'Using keyword-based detection' });
      return this.detectCategoryTypesKeyword(context);
    }
    
    try {
      const prompt = `Analyze this achievement and identify the PRIMARY category types. Focus on the CORE ACHIEVEMENT, not the method/platform used.

ACHIEVEMENT:
Description: ${description}
Impact: ${achievementImpact}
Innovation: ${achievementInnovation}

CATEGORY TYPES (select 1-2 PRIMARY types):
- healthcare_medical: Medical, health, disease, surgery, vision, pharmaceutical, hospital, wellness
- women_empowerment: Women helping women, female leadership, women's rights (NOT healthcare for women)
- technology: Tech, software, AI, innovation, digital transformation, IT products/services
- social_impact: CSR, community service, humanitarian, charity, non-profit, sustainability
- business_general: Company growth, management, leadership, operations, finance
- marketing_media: Advertising, PR, content creation, social media campaigns, communications
- product_service: Product launches, service excellence, customer experience

RULES:
1. Focus on WHAT was achieved, not HOW it was communicated
2. "Content creator who helped blind people" → healthcare_medical + social_impact (NOT marketing_media)
3. "YouTube channel about cooking" → marketing_media
4. "Company using social media for sales" → business_general (NOT marketing_media)
5. Maximum 2 types - choose the most relevant

Return ONLY a JSON array of 1-2 category types, e.g.: ["healthcare_medical", "social_impact"]`;

      const responseText = await openaiService.chatCompletion({
        messages: [{ role: 'user', content: prompt }],
        model: 'gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 100,
      });
      
      // Try to parse as JSON array directly or extract from object
      let types: string[] = [];
      try {
        // Strip markdown code blocks if present (```json ... ```)
        let cleanedResponse = (responseText || '').trim();
        if (cleanedResponse.startsWith('```')) {
          // Remove opening ```json or ``` and closing ```
          cleanedResponse = cleanedResponse
            .replace(/^```(?:json)?\s*\n?/, '')
            .replace(/\n?```\s*$/, '')
            .trim();
        }
        
        const parsed = JSON.parse(cleanedResponse || '[]');
        if (Array.isArray(parsed)) {
          types = parsed;
        } else if (parsed.types && Array.isArray(parsed.types)) {
          types = parsed.types;
        } else if (parsed.category_types && Array.isArray(parsed.category_types)) {
          types = parsed.category_types;
        }
      } catch (parseError) {
        logger.warn('intent_detection_parse_error', { response: responseText });
      }
      
      if (types.length > 0) {
        logger.info('intent_detected_llm', {
          detected_types: types,
          description_sample: description.substring(0, 100),
          method: 'llm'
        });
        
        // Expand related types for better recall
        // Healthcare often overlaps with social impact
        if (types.includes('healthcare_medical') && !types.includes('social_impact')) {
          // Check if description mentions helping people, community, etc.
          const socialKeywords = ['helping', 'community', 'people', 'humanitarian', 'charity', 'volunteer'];
          if (socialKeywords.some(kw => description.toLowerCase().includes(kw))) {
            types.push('social_impact');
            logger.info('intent_expanded', {
              original: types.filter(t => t !== 'social_impact'),
              expanded: types,
              reason: 'Healthcare with social impact keywords'
            });
          }
        }
        
        return types;
      }
    } catch (error: any) {
      logger.warn('intent_detection_failed', { error: error.message });
      // Fall back to keyword matching
      return this.detectCategoryTypesKeyword(context);
    }
    
    // No specific intent detected - search all categories
    logger.info('no_specific_intent_detected', {
      note: 'Searching across all category types',
    });
    return undefined;
  }

  /**
   * Fallback keyword-based intent detection.
   * Used when LLM-based detection fails or description is too short.
   */
  private detectCategoryTypesKeyword(context: UserContext): string[] | undefined {
    const description = (context.description || '').toLowerCase();
    const achievementFocus = (context.achievement_focus || []).map(f => f.toLowerCase());
    const achievementImpact = (context.achievement_impact || '').toLowerCase();
    const allText = [description, achievementFocus.join(' '), achievementImpact].join(' ');
    
    const detectedTypes: Set<string> = new Set();
    
    // Healthcare/Medical keywords (HIGH PRIORITY)
    const healthcareKeywords = ['health', 'medical', 'hospital', 'doctor', 'nurse', 'patient', 'surgery', 'treatment', 'disease', 'wellness', 'pharmaceutical', 'clinic', 'healthcare', 'vision', 'sight', 'blind', 'cataract', 'therapy', 'cure', 'diagnosis'];
    const hasHealthcare = healthcareKeywords.some(kw => allText.includes(kw));
    if (hasHealthcare) {
      detectedTypes.add('healthcare_medical');
    }
    
    // Social impact keywords (HIGH PRIORITY)
    const socialKeywords = ['social impact', 'community', 'humanitarian', 'charity', 'non-profit', 'nonprofit', 'volunteer', 'csr', 'sustainability', 'environment', 'education access', 'poverty', 'helping people', 'making a difference'];
    const hasSocial = socialKeywords.some(kw => allText.includes(kw));
    if (hasSocial) {
      detectedTypes.add('social_impact');
    }
    
    // Women empowerment keywords (NOT healthcare for women)
    const womenEmpowermentKeywords = ['women helping women', 'female leadership', 'women empowerment', 'women rights', 'gender equality', 'women in business'];
    if (womenEmpowermentKeywords.some(kw => allText.includes(kw))) {
      detectedTypes.add('women_empowerment');
    }
    
    // If healthcare or social impact detected, SKIP technology/marketing detection
    // (they used tech/media as a TOOL, not the achievement itself)
    if (hasHealthcare || hasSocial) {
      const types = Array.from(detectedTypes);
      logger.info('intent_detected_primary', {
        detected_types: types,
        note: 'Skipped secondary types (tech/marketing) due to primary healthcare/social focus',
      });
      return types;
    }
    
    // Only check these if NO healthcare/social impact detected
    
    // Technology keywords
    const techKeywords = ['software development', 'technology product', 'ai product', 'artificial intelligence platform', 'machine learning system', 'digital product', 'app development', 'platform development', 'saas product', 'cloud service', 'data analytics product', 'cybersecurity solution', 'blockchain'];
    if (techKeywords.some(kw => allText.includes(kw))) {
      detectedTypes.add('technology');
    }
    
    // Marketing/Media keywords
    const marketingKeywords = ['marketing campaign', 'advertising campaign', 'pr campaign', 'public relations campaign', 'content marketing', 'social media marketing', 'video marketing', 'media campaign', 'communications campaign', 'brand campaign'];
    if (marketingKeywords.some(kw => allText.includes(kw))) {
      detectedTypes.add('marketing_media');
    }
    
    // Product/Service keywords
    const productKeywords = ['product launch', 'new product', 'service excellence', 'customer experience program', 'customer service innovation'];
    if (productKeywords.some(kw => allText.includes(kw))) {
      detectedTypes.add('product_service');
    }
    
    const types = Array.from(detectedTypes);
    
    if (types.length > 0) {
      logger.info('intent_detected', {
        detected_types: types,
        description_sample: description.substring(0, 100),
      });
      return types;
    }
    
    // No specific intent detected - search all categories
    logger.info('no_specific_intent_detected', {
      note: 'Searching across all category types',
    });
    return undefined;
  }

  /**
   * Perform similarity search using pgvector.
   * REVERTED TO WORKING VERSION (migration 002) - only filters by geography and gender.
   */
  async performSimilaritySearch(
    userEmbedding: number[],
    userGeographies?: string[], // Array but we'll use first element only
    _userNominationSubject?: string, // Unused - kept for backward compatibility
    limit: number = 10,
    _userOrgType?: string, // Unused - kept for backward compatibility
    userAchievementFocus?: string[],
    userGender?: string
  ): Promise<SimilarityResult[]> {
    // Use single geography (first element) for old function signature
    const userGeography = userGeographies?.[0] || null;
    
    logger.info("performing_similarity_search", {
      user_geography: userGeography || "all",
      user_achievement_focus: userAchievementFocus?.join(", ") || "all",
      user_gender: userGender || "any",
      limit: limit,
      embedding_dimension: userEmbedding.length,
      note: "REVERTED TO WORKING VERSION - migration 002 function signature"
    });

    try {
      // Call old working function (migration 002)
      const { data, error } = await this.client.rpc(
        "search_similar_categories",
        {
          query_embedding: userEmbedding,
          user_geography: userGeography,
          user_nomination_subject: null, // Not used
          match_limit: limit,
          user_org_type: null, // Not used
          user_achievement_focus: userAchievementFocus || null,
          user_gender: userGender || 'any',
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
