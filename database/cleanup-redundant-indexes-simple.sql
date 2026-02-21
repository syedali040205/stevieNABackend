-- ============================================================================
-- Simple Index Cleanup Script (Supabase Compatible)
-- ============================================================================
-- Removes 4 redundant indexes and optimizes database performance
-- ============================================================================

-- Remove redundant indexes
DROP INDEX IF EXISTS idx_category_embeddings_geography;
DROP INDEX IF EXISTS idx_category_embeddings_org_types;
DROP INDEX IF EXISTS idx_stevie_programs_code;
DROP INDEX IF EXISTS idx_stevie_programs_geo_scope;

-- Run VACUUM ANALYZE to reclaim space and update statistics
VACUUM ANALYZE category_embeddings;
VACUUM ANALYZE stevie_categories;
VACUUM ANALYZE stevie_programs;

-- Verify final index count
SELECT 
  tablename,
  COUNT(*) as index_count
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')
GROUP BY tablename
ORDER BY tablename;

-- Expected results:
-- category_embeddings: 5 indexes
-- stevie_categories: 4 indexes
-- stevie_programs: 2 indexes
-- Total: 11 indexes (optimized from 15)
