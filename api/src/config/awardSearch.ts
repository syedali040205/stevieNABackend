import { z } from 'zod';

/**
 * Award Search Assistant Configuration
 * Validates and provides typed access to environment variables
 */

// Environment variable validation schema
const awardSearchConfigSchema = z.object({
  // Cache configuration
  AWARD_SEARCH_CACHE_TTL_DAYS: z.coerce.number().int().positive().default(7),
  
  // Queue configuration
  AWARD_SEARCH_MAX_QUEUE_DEPTH: z.coerce.number().int().positive().default(50),
  
  // Crawler configuration
  AWARD_SEARCH_CRAWLER_CONCURRENCY: z.coerce.number().int().positive().max(10).default(3),
  AWARD_SEARCH_CRAWLER_DELAY_MS: z.coerce.number().int().min(500).default(1000),
  AWARD_SEARCH_CRAWLER_MAX_DEPTH: z.coerce.number().int().min(1).max(5).default(2),
  AWARD_SEARCH_CRAWLER_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(3),
  AWARD_SEARCH_CRAWLER_BACKOFF_BASE: z.coerce.number().positive().default(2),
});

export type AwardSearchConfig = z.infer<typeof awardSearchConfigSchema>;

let cachedConfig: AwardSearchConfig | null = null;

/**
 * Get validated Award Search configuration
 * Implements singleton pattern with validation
 */
export const getAwardSearchConfig = (): AwardSearchConfig => {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    cachedConfig = awardSearchConfigSchema.parse({
      AWARD_SEARCH_CACHE_TTL_DAYS: process.env.AWARD_SEARCH_CACHE_TTL_DAYS,
      AWARD_SEARCH_MAX_QUEUE_DEPTH: process.env.AWARD_SEARCH_MAX_QUEUE_DEPTH,
      AWARD_SEARCH_CRAWLER_CONCURRENCY: process.env.AWARD_SEARCH_CRAWLER_CONCURRENCY,
      AWARD_SEARCH_CRAWLER_DELAY_MS: process.env.AWARD_SEARCH_CRAWLER_DELAY_MS,
      AWARD_SEARCH_CRAWLER_MAX_DEPTH: process.env.AWARD_SEARCH_CRAWLER_MAX_DEPTH,
      AWARD_SEARCH_CRAWLER_MAX_RETRIES: process.env.AWARD_SEARCH_CRAWLER_MAX_RETRIES,
      AWARD_SEARCH_CRAWLER_BACKOFF_BASE: process.env.AWARD_SEARCH_CRAWLER_BACKOFF_BASE,
    });

    return cachedConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`Award Search configuration validation failed: ${messages}`);
    }
    throw error;
  }
};

/**
 * Reset cached configuration (useful for testing)
 */
export const resetAwardSearchConfig = (): void => {
  cachedConfig = null;
};
