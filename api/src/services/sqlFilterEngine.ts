import { SupabaseClient } from '@supabase/supabase-js';
import logger from '../utils/logger';

interface FilterCriteria {
  geography?: string;
  org_type?: string;
  org_size?: string;
  nomination_subject?: string;
  achievement_focus?: string[];
}

interface FilteredCategory {
  category_id: string;
  category_name: string;
  description: string;
  program_code: string;
  program_name: string;
  geographic_scope: string[];
  applicable_org_types: string[];
  applicable_org_sizes: string[];
  nomination_subject_type: string;
  achievement_focus: string[];
}

/**
 * SQL Filter Engine for filtering Stevie Awards categories based on eligibility criteria.
 * 
 * CURRENTLY DISABLED: Returns empty to trigger "search all" behavior.
 * 
 * Future enhancement: Implement proper filtering with:
 * - Geographic value mapping (IBA uses different values)
 * - Lenient filtering (empty arrays = eligible for all)
 * - Case-insensitive matching
 */
export class SQLFilterEngine {
  constructor(_client?: SupabaseClient) {
    // Client parameter kept for dependency injection but not used
    // since filtering is currently disabled
  }

  /**
   * Filter categories based on user context criteria.
   * 
   * CURRENTLY DISABLED: Always returns empty array.
   * This triggers the similarity search to search ALL categories.
   */
  async filterCategories(_criteria: FilterCriteria): Promise<FilteredCategory[]> {
    logger.info('filtering_disabled', {
      reason: 'Searching all categories via pgvector similarity',
    });
    return [];
  }

  /**
   * Get category IDs from filtered results.
   */
  getCategoryIds(categories: FilteredCategory[]): string[] {
    return categories.map((cat) => cat.category_id);
  }

  /**
   * Validate filter criteria to prevent SQL injection and invalid values.
   */
  validateCriteria(criteria: FilterCriteria): boolean {
    const validGeographies = [
      'worldwide',
      'usa',
      'canada',
      'europe',
      'latin_america',
      'asia_pacific_middle_east_north_africa',
    ];

    const validOrgTypes = ['for_profit', 'non_profit', 'government'];

    const validOrgSizes = ['small', 'medium', 'large'];

    const validNominationSubjects = ['organization', 'team', 'individual', 'product'];

    // Validate geography
    if (criteria.geography && !validGeographies.includes(criteria.geography)) {
      logger.warn('invalid_geography', { geography: criteria.geography });
      return false;
    }

    // Validate org_type
    if (criteria.org_type && !validOrgTypes.includes(criteria.org_type)) {
      logger.warn('invalid_org_type', { org_type: criteria.org_type });
      return false;
    }

    // Validate org_size
    if (criteria.org_size && !validOrgSizes.includes(criteria.org_size)) {
      logger.warn('invalid_org_size', { org_size: criteria.org_size });
      return false;
    }

    // Validate nomination_subject
    if (
      criteria.nomination_subject &&
      !validNominationSubjects.includes(criteria.nomination_subject)
    ) {
      logger.warn('invalid_nomination_subject', {
        nomination_subject: criteria.nomination_subject,
      });
      return false;
    }

    // Validate achievement_focus (should be array of strings)
    if (criteria.achievement_focus) {
      if (!Array.isArray(criteria.achievement_focus)) {
        logger.warn('invalid_achievement_focus_type');
        return false;
      }

      // Check for SQL injection attempts in achievement focus
      for (const focus of criteria.achievement_focus) {
        if (typeof focus !== 'string' || focus.includes("'") || focus.includes(';')) {
          logger.warn('invalid_achievement_focus_value', { focus });
          return false;
        }
      }
    }

    return true;
  }
}

// Export singleton instance
export const sqlFilterEngine = new SQLFilterEngine();
