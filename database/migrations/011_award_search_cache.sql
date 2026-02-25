-- Award Search Cache Migration
-- Date: 2026-02-21
-- Description: Create cache table for Award Search Assistant to store crawled data from stevieawards.com
-- Prerequisites: PostgreSQL 15+

-- ============================================================================
-- TABLES
-- ============================================================================

-- Award Search Cache Table
-- Stores crawled content from stevieawards.com with 7-day TTL
CREATE TABLE IF NOT EXISTS award_search_cache (
  url TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  CONSTRAINT valid_expiry CHECK (expires_at > cached_at)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Index for efficient cleanup of expired entries
CREATE INDEX IF NOT EXISTS idx_award_search_cache_expires 
  ON award_search_cache(expires_at);

-- Index for access pattern analysis
CREATE INDEX IF NOT EXISTS idx_award_search_cache_last_accessed 
  ON award_search_cache(last_accessed_at DESC);

-- Index for cache age queries
CREATE INDEX IF NOT EXISTS idx_award_search_cache_cached_at 
  ON award_search_cache(cached_at DESC);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to clean up expired cache entries
-- Should be called periodically (e.g., daily cron job)
CREATE OR REPLACE FUNCTION cleanup_expired_award_search_cache()
RETURNS TABLE (deleted_count bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  rows_deleted bigint;
BEGIN
  DELETE FROM award_search_cache
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS rows_deleted = ROW_COUNT;
  
  RETURN QUERY SELECT rows_deleted;
END;
$$;

-- Function to update access tracking when cache is hit
CREATE OR REPLACE FUNCTION update_award_search_cache_access(cache_url TEXT)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE award_search_cache
  SET 
    access_count = access_count + 1,
    last_accessed_at = NOW()
  WHERE url = cache_url;
END;
$$;

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Grant permissions (adjust based on your user roles)
GRANT SELECT, INSERT, UPDATE, DELETE ON award_search_cache TO authenticated, anon;
GRANT EXECUTE ON FUNCTION cleanup_expired_award_search_cache TO authenticated, anon;
GRANT EXECUTE ON FUNCTION update_award_search_cache_access TO authenticated, anon;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT 
  'Award search cache migration completed successfully' as status,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'award_search_cache') as table_exists,
  (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'award_search_cache') as index_count;
