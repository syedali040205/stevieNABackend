import { sqlFilterEngine, SQLFilterEngine } from './sqlFilterEngine';
import { embeddingManager, EmbeddingManager } from './embeddingManager';
import { explanationGenerator } from './explanationGenerator';
import { getSupabaseClient } from '../config/supabase';
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
  gender?: string;
}

interface Recommendation {
  category_id: string;
  category_name: string;
  description: string;
  program_name: string;
  program_code: string;
  similarity_score: number;
  match_reasons?: string[];
  geographic_scope: string[];
  applicable_org_types: string[];
  applicable_org_sizes: string[];
  nomination_subject_type: string;
  achievement_focus: string[];
}

/**
 * Recommendation Engine orchestrates the complete recommendation pipeline:
 * 1. SQL filtering by eligibility criteria
 * 2. Embedding generation for user query
 * 3. Similarity search using pgvector
 * 4. Optional match explanation generation
 */
export class RecommendationEngine {
  private sqlFilter: SQLFilterEngine;
  private embeddingMgr: EmbeddingManager;

  constructor(
    sqlFilter?: SQLFilterEngine,
    embeddingMgr?: EmbeddingManager
  ) {
    this.sqlFilter = sqlFilter || sqlFilterEngine;
    this.embeddingMgr = embeddingMgr || embeddingManager;
  }

  /**
   * Validate that UserContext has all required fields for recommendations.
   * Made more lenient - only requires nomination_subject and description.
   */
  private validateContextCompleteness(context: UserContext): boolean {
    // Minimum required fields
    const criticalFields = [
      'nomination_subject',
      'description',
    ];

    for (const field of criticalFields) {
      const value = context[field as keyof UserContext];
      if (value === undefined || value === null || value === '') {
        logger.warn('incomplete_context_critical', { missing_field: field });
        return false;
      }
    }

    // Warn about optional fields but don't fail
    if (!context.org_type) {
      logger.info('using_default_org_type', { default: 'for_profit' });
    }
    if (!context.org_size) {
      logger.info('using_default_org_size', { default: 'small' });
    }
    if (!context.achievement_focus || context.achievement_focus.length === 0) {
      logger.info('using_default_achievement_focus', { default: ['Innovation', 'Technology'] });
    }

    return true;
  }

  /**
   * Generate recommendations for a user based on their context.
   * 
   * Pipeline:
   * 1. Validate context completeness
   * 2. Filter categories by eligibility (SQL)
   * 3. Generate user embedding
   * 4. Perform similarity search
   * 5. Optionally enrich with explanations
   */
  async generateRecommendations(
    context: UserContext,
    options: {
      limit?: number;
      includeExplanations?: boolean;
    } = {}
  ): Promise<Recommendation[]> {
    const { limit = 10, includeExplanations = false } = options;

    logger.info('generating_recommendations', {
      geography: context.geography,
      org_type: context.org_type,
      org_size: context.org_size,
      nomination_subject: context.nomination_subject,
      limit: limit,
      include_explanations: includeExplanations,
    });

    try {
      // Step 1: Validate context completeness
      if (!this.validateContextCompleteness(context)) {
        throw new Error('UserContext is incomplete. Cannot generate recommendations.');
      }

      // Step 2: Geography filtering happens in database
      logger.info('step_1_geography_filtering', {
        geography: context.geography || 'all',
        note: 'Geographic filtering handled by database search function',
      });

      // Step 3: Generate user embedding
      logger.info('step_2_generating_user_embedding');
      const userEmbedding = await this.embeddingMgr.generateUserEmbedding(context);

      logger.info('user_embedding_generated', {
        dimension: userEmbedding.length,
      });

      // Step 4: Perform vector search with contextual embeddings
      logger.info('step_3_similarity_search', {
        search_type: 'vector',
      });
      
      // Map nomination_subject to match database values
      // Database has: 'company', 'product' (not 'individual', 'team', 'organization')
      let dbNominationSubject = context.nomination_subject;
      if (context.nomination_subject === 'individual' || context.nomination_subject === 'team') {
        // Individual/team nominations can match product or company categories
        dbNominationSubject = 'product'; // Default to product for innovation/tech achievements
        logger.info('mapped_nomination_subject', { 
          from: context.nomination_subject, 
          to: dbNominationSubject 
        });
      } else if (context.nomination_subject === 'organization') {
        dbNominationSubject = 'company';
        logger.info('mapped_nomination_subject', { 
          from: context.nomination_subject, 
          to: dbNominationSubject 
        });
      }
      
      // Geography filter - pass the geography value to database for filtering
      // Database has: USA, Global, Asia, Pacific, Middle East, North Africa
      const dbGeography = context.geography || undefined;
      
      logger.info('search_parameters', {
        geography: dbGeography || 'all',
        nomination_subject: dbNominationSubject,
        limit: limit,
        note: 'Searching across ALL programs with boosting for Technology Excellence'
      });
      
      // Pure vector search with contextual embeddings
      const similarityResults = await this.embeddingMgr.performSimilaritySearch(
        userEmbedding,
        dbGeography, // Pass undefined for non-USA to skip geography filter
        dbNominationSubject, // Pass mapped nomination subject
        limit,
        context.org_type, // Pass org_type for metadata filtering
        context.achievement_focus, // Pass achievement_focus for metadata filtering
        context.gender // Pass gender for metadata filtering (e.g., Women in Business awards)
      );

      logger.info('similarity_search_complete', {
        results_count: similarityResults.length,
      });

      // Optional: drop low-similarity results (tune via MIN_SIMILARITY_SCORE, e.g. 0.4–0.6 for cosine)
      const minScore = parseFloat(process.env.MIN_SIMILARITY_SCORE || '0');
      let filtered = similarityResults;
      if (minScore > 0) {
        filtered = similarityResults.filter((r) => r.similarity_score >= minScore);
        if (filtered.length < similarityResults.length) {
          logger.info('low_similarity_filtered', {
            before: similarityResults.length,
            after: filtered.length,
            min_score: minScore,
          });
        }
      }

      // Step 5: Deduplicate by category_id (geography already filtered in DB)
      const seen = new Set<string>();
      let recommendations: Recommendation[] = filtered
        .filter((result) => {
          if (seen.has(result.category_id)) {
            logger.info('duplicate_category_filtered', { category_id: result.category_id });
            return false;
          }
          seen.add(result.category_id);
          return true;
        })
        .map((result) => ({
          category_id: result.category_id,
          category_name: result.category_name,
          description: result.description,
          program_name: result.program_name,
          program_code: result.program_code,
          similarity_score: result.similarity_score,
          geographic_scope: result.metadata?.geographic_scope || result.geographic_scope,
          applicable_org_types: result.metadata?.applicable_org_types || result.applicable_org_types,
          applicable_org_sizes: result.metadata?.applicable_org_sizes || result.applicable_org_sizes,
          nomination_subject_type: result.metadata?.nomination_subject_type || result.nomination_subject_type,
          achievement_focus: result.metadata?.achievement_focus || result.achievement_focus,
        }));

      // Step 6: Optionally enrich with explanations
      if (includeExplanations && recommendations.length > 0) {
        logger.info('step_4_generating_explanations');
        try {
          const explanationsResponse = await explanationGenerator.generateExplanations({
            userContext: context,
            categories: recommendations.map((rec) => ({
              category_id: rec.category_id,
              category_name: rec.category_name,
              description: rec.description,
              program_name: rec.program_name,
            })),
          });

          // Merge explanations into recommendations
          const explanationsMap = new Map(
            explanationsResponse.explanations.map((exp) => [
              exp.category_id,
              exp.match_reasons,
            ])
          );

          recommendations = recommendations.map((rec) => ({
            ...rec,
            match_reasons: explanationsMap.get(rec.category_id) || [],
          }));

          logger.info('explanations_added', {
            count: explanationsResponse.explanations.length,
          });
        } catch (error: any) {
          // Don't fail the entire recommendation if explanations fail
          logger.error('explanation_generation_failed', {
            error: error.message,
          });
        }
      }

      logger.info('recommendations_generated', {
        total_recommendations: recommendations.length,
      });

      return recommendations;
    } catch (error: any) {
      logger.error('recommendation_generation_error', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get recommendation statistics for monitoring.
   */
  async getRecommendationStats(context: UserContext): Promise<{
    eligible_categories: number;
    total_categories: number;
    filter_rate: number;
  }> {
    try {
      // Get total categories
      const supabase = getSupabaseClient();
      const { count: totalCount } = await supabase
        .from('stevie_categories')
        .select('*', { count: 'exact', head: true });

      // Get eligible categories
      const filteredCategories = await this.sqlFilter.filterCategories({
        geography: context.geography,
        org_type: context.org_type,
        org_size: context.org_size,
        nomination_subject: context.nomination_subject,
        achievement_focus: context.achievement_focus,
      });

      const eligibleCount = filteredCategories.length;
      const filterRate = totalCount ? (eligibleCount / totalCount) * 100 : 0;

      return {
        eligible_categories: eligibleCount,
        total_categories: totalCount || 0,
        filter_rate: Math.round(filterRate * 100) / 100,
      };
    } catch (error: any) {
      logger.error('stats_generation_error', {
        error: error.message,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const recommendationEngine = new RecommendationEngine();
