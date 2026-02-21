-- Add performance indexes for faster queries
-- Run this AFTER the metadata migration is complete

-- ============================================================================
-- INDEXES FOR CATEGORY_EMBEDDINGS TABLE
-- ============================================================================

-- 1. Index on category_id for fast joins (if not already exists)
CREATE INDEX IF NOT EXISTS idx_category_embeddings_category_id 
ON category_embeddings(category_id);

-- 2. GIN index on contextual_prefix for full-text search (optional, for future use)
CREATE INDEX IF NOT EXISTS idx_category_embeddings_contextual_prefix_gin 
ON category_embeddings USING GIN (to_tsvector('english', contextual_prefix));

-- 3. Index on updated_at for tracking freshness
CREATE INDEX IF NOT EXISTS idx_category_embeddings_updated_at 
ON category_embeddings(updated_at DESC);

-- ============================================================================
-- INDEXES FOR STEVIE_CATEGORIES TABLE
-- ============================================================================

-- 4. Index on program_id for fast program lookups
CREATE INDEX IF NOT EXISTS idx_stevie_categories_program_id 
ON stevie_categories(program_id);

-- 5. GIN index on category_name for full-text search
CREATE INDEX IF NOT EXISTS idx_stevie_categories_category_name_gin 
ON stevie_categories USING GIN (to_tsvector('english', category_name));

-- 6. GIN index on description for full-text search
CREATE INDEX IF NOT EXISTS idx_stevie_categories_description_gin 
ON stevie_categories USING GIN (to_tsvector('english', description));

-- 7. Composite index for common query patterns (program + subject type)
CREATE INDEX IF NOT EXISTS idx_stevie_categories_program_subject 
ON stevie_categories(program_id, nomination_subject_type);

-- ============================================================================
-- VERIFY INDEXES
-- ============================================================================

SELECT 
  'Index verification' as step,
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('stevie_categories', 'category_embeddings')
ORDER BY tablename, indexname;

-- ============================================================================
-- PERFORMANCE ANALYSIS
-- ============================================================================

-- Check table sizes
SELECT 
  'Table sizes' as step,
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename IN ('stevie_categories', 'category_embeddings')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check index sizes
SELECT 
  'Index sizes' as step,
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(schemaname||'.'||indexname)) AS size
FROM pg_indexes
WHERE tablename IN ('stevie_categories', 'category_embeddings')
ORDER BY pg_relation_size(schemaname||'.'||indexname) DESC;

SELECT '✅ Performance indexes created successfully!' as status;

-- ============================================================================
-- NOTES
-- ============================================================================

/*
INDEXES CREATED:

1. category_embeddings.category_id (B-tree)
   - Fast joins with stevie_categories
   - Used in: search_similar_categories function

2. category_embeddings.contextual_prefix (GIN + tsvector)
   - Full-text search on contextual prefixes
   - Future use: keyword-based search fallback

3. category_embeddings.updated_at (B-tree DESC)
   - Track embedding freshness
   - Used in: monitoring, cache invalidation

4. stevie_categories.program_id (B-tree)
   - Fast program lookups
   - Used in: search_similar_categories function

5. stevie_categories.category_name (GIN + tsvector)
   - Full-text search on category names
   - Future use: hybrid search (BM25 + vector)

6. stevie_categories.description (GIN + tsvector)
   - Full-text search on descriptions
   - Future use: hybrid search (BM25 + vector)

7. stevie_categories.(program_id, nomination_subject_type) (Composite B-tree)
   - Fast filtering by program + subject
   - Used in: common query patterns

8. stevie_categories.metadata (GIN) - ALREADY CREATED IN MIGRATION
   - Fast JSONB queries
   - Used in: metadata filtering

WHEN TO USE EACH INDEX:

- B-tree indexes: Exact matches, range queries, sorting
- GIN indexes: JSONB queries, full-text search, array containment
- Composite indexes: Multi-column WHERE clauses

PERFORMANCE IMPACT:

At 1,348 categories:
- Index overhead: ~5-10 MB total
- Query speedup: 10-100x for filtered queries
- Write overhead: Minimal (categories rarely change)

FUTURE OPTIMIZATIONS:

1. Hybrid Search (BM25 + Vector)
   - Use GIN indexes on category_name and description
   - Combine keyword scores with vector similarity

2. Reranking
   - Use indexes to quickly fetch top-K candidates
   - Apply expensive reranking only to top results

3. Caching
   - Use updated_at index to invalidate stale cache entries
*/
