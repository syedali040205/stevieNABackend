-- ============================================================================
-- Index Optimization Verification Script
-- ============================================================================
-- Purpose: Verify that index cleanup was successful and indexes are optimal
-- Run this after: database/cleanup-redundant-indexes.sql
-- ============================================================================

-- ============================================================================
-- CHECK 1: Verify index count (should be 11 total)
-- ============================================================================

SELECT 
  '=== INDEX COUNT VERIFICATION ===' as check_name,
  tablename,
  COUNT(*) as index_count,
  CASE 
    WHEN tablename = 'category_embeddings' AND COUNT(*) = 5 THEN '✅ Correct (5 indexes)'
    WHEN tablename = 'stevie_categories' AND COUNT(*) = 4 THEN '✅ Correct (4 indexes)'
    WHEN tablename = 'stevie_programs' AND COUNT(*) = 2 THEN '✅ Correct (2 indexes)'
    ELSE '❌ Unexpected count'
  END as status
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')
GROUP BY tablename
ORDER BY tablename;

-- ============================================================================
-- CHECK 2: Verify redundant indexes are removed
-- ============================================================================

SELECT 
  '=== REDUNDANT INDEX CHECK ===' as check_name,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ All redundant indexes removed'
    ELSE '❌ Found ' || COUNT(*) || ' redundant indexes'
  END as status,
  COALESCE(string_agg(indexname, ', '), 'None') as remaining_redundant_indexes
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_category_embeddings_geography',
    'idx_category_embeddings_org_types',
    'idx_stevie_programs_code',
    'idx_stevie_programs_geo_scope'
  );

-- ============================================================================
-- CHECK 3: Verify essential indexes exist
-- ============================================================================

WITH expected_indexes AS (
  SELECT unnest(ARRAY[
    'category_embeddings_pkey',
    'category_embeddings_category_id_key',
    'idx_category_embeddings_vector',
    'idx_category_embeddings_metadata',
    'idx_category_embeddings_gender',
    'stevie_categories_pkey',
    'stevie_categories_program_id_category_code_key',
    'idx_stevie_categories_program_id',
    'idx_stevie_categories_metadata',
    'stevie_programs_pkey',
    'stevie_programs_program_code_key'
  ]) as expected_index
),
actual_indexes AS (
  SELECT indexname
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')
)
SELECT 
  '=== ESSENTIAL INDEX CHECK ===' as check_name,
  e.expected_index,
  CASE 
    WHEN a.indexname IS NOT NULL THEN '✅ Exists'
    ELSE '❌ Missing'
  END as status
FROM expected_indexes e
LEFT JOIN actual_indexes a ON e.expected_index = a.indexname
ORDER BY e.expected_index;

-- ============================================================================
-- CHECK 4: Index size analysis
-- ============================================================================

SELECT 
  '=== INDEX SIZE ANALYSIS ===' as check_name,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  CASE 
    WHEN pg_relation_size(indexrelid) > 1024 * 1024 THEN '⚠️ Large (>1MB)'
    WHEN pg_relation_size(indexrelid) > 500 * 1024 THEN '✅ Medium (500KB-1MB)'
    ELSE '✅ Small (<500KB)'
  END as size_status
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')
ORDER BY pg_relation_size(indexrelid) DESC;

-- ============================================================================
-- CHECK 5: Total storage used by indexes
-- ============================================================================

SELECT 
  '=== TOTAL INDEX STORAGE ===' as check_name,
  COUNT(*) as total_indexes,
  pg_size_pretty(SUM(pg_relation_size(indexrelid))) as total_size,
  CASE 
    WHEN SUM(pg_relation_size(indexrelid)) < 1024 * 1024 THEN '✅ Excellent (<1MB)'
    WHEN SUM(pg_relation_size(indexrelid)) < 2 * 1024 * 1024 THEN '✅ Good (1-2MB)'
    ELSE '⚠️ Consider optimization (>2MB)'
  END as storage_status
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs');

-- ============================================================================
-- CHECK 6: Index usage statistics (if available)
-- ============================================================================

SELECT 
  '=== INDEX USAGE STATISTICS ===' as check_name,
  tablename,
  indexname,
  idx_scan as times_used,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  CASE 
    WHEN idx_scan = 0 AND indexname NOT LIKE '%pkey' THEN '⚠️ Unused'
    WHEN idx_scan > 0 THEN '✅ Active'
    ELSE '✅ Primary Key'
  END as usage_status
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')
ORDER BY idx_scan DESC;

-- ============================================================================
-- CHECK 7: Verify GIN index covers geography and org_type queries
-- ============================================================================

EXPLAIN (FORMAT TEXT)
SELECT category_id, metadata
FROM category_embeddings
WHERE metadata->'geographic_scope' @> '["USA"]';

EXPLAIN (FORMAT TEXT)
SELECT category_id, metadata
FROM category_embeddings
WHERE metadata->'applicable_org_types' @> '["non_profit"]';

-- Expected: Both should use "Bitmap Index Scan on idx_category_embeddings_metadata"

-- ============================================================================
-- SUMMARY
-- ============================================================================

SELECT 
  '=== OPTIMIZATION SUMMARY ===' as summary,
  (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' 
   AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')) as total_indexes,
  (SELECT pg_size_pretty(SUM(pg_relation_size(indexrelid))) 
   FROM pg_stat_user_indexes WHERE schemaname = 'public' 
   AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')) as total_size,
  CASE 
    WHEN (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' 
          AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')) = 11 
    THEN '✅ Optimization successful'
    ELSE '⚠️ Unexpected index count'
  END as status;

-- ============================================================================
-- NOTES
-- ============================================================================

/*
EXPECTED RESULTS:

✅ Total indexes: 11
✅ Total size: ~810KB (under 1MB)
✅ All essential indexes present
✅ All redundant indexes removed
✅ GIN index covers geography and org_type queries
✅ Gender partial index exists and is small (~10KB)

IF ANY CHECKS FAIL:

1. Index count != 11:
   - Re-run database/cleanup-redundant-indexes.sql
   - Check for manually created indexes

2. Redundant indexes still exist:
   - Drop them manually using DROP INDEX IF EXISTS
   - Run VACUUM ANALYZE

3. Essential indexes missing:
   - Re-run database/add-metadata-to-embeddings.sql
   - Check Supabase dashboard for index creation errors

4. Index size > 1MB:
   - Normal for vector index at scale
   - Monitor and optimize if it grows beyond 5MB

5. Unused indexes (idx_scan = 0):
   - Normal if just created
   - Monitor for 1 week before deciding to remove
   - Primary keys always show 0 scans (expected)

MONITORING SCHEDULE:

- Daily: Check query performance (<100ms target)
- Weekly: Run this verification script
- Monthly: Run VACUUM ANALYZE
- Quarterly: Review index usage and optimize
*/
