-- Comprehensive Index Analysis for Stevie Awards Database
-- Analyzes all indexes, their usage, size, and provides optimization recommendations

-- ============================================================================
-- PART 1: List All Indexes
-- ============================================================================

SELECT 
  '=== ALL INDEXES ===' as section,
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  idx_scan as times_used,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  CASE 
    WHEN idx_scan = 0 THEN '⚠️ UNUSED'
    WHEN idx_scan < 10 THEN '⚠️ RARELY USED'
    WHEN idx_scan < 100 THEN '✓ OCCASIONALLY USED'
    ELSE '✅ FREQUENTLY USED'
  END as usage_status
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND (tablename LIKE 'stevie_%' OR tablename LIKE 'category_%')
ORDER BY tablename, indexname;

-- ============================================================================
-- PART 2: Index Details by Table
-- ============================================================================

-- stevie_categories indexes
SELECT 
  '=== STEVIE_CATEGORIES INDEXES ===' as section,
  indexname,
  indexdef,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_indexes
JOIN pg_stat_user_indexes USING (schemaname, tablename, indexname)
WHERE tablename = 'stevie_categories'
ORDER BY indexname;

-- category_embeddings indexes
SELECT 
  '=== CATEGORY_EMBEDDINGS INDEXES ===' as section,
  indexname,
  indexdef,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_indexes
JOIN pg_stat_user_indexes USING (schemaname, tablename, indexname)
WHERE tablename = 'category_embeddings'
ORDER BY indexname;

-- stevie_programs indexes
SELECT 
  '=== STEVIE_PROGRAMS INDEXES ===' as section,
  indexname,
  indexdef,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_indexes
JOIN pg_stat_user_indexes USING (schemaname, tablename, indexname)
WHERE tablename = 'stevie_programs'
ORDER BY indexname;

-- ============================================================================
-- PART 3: Index Usage Statistics
-- ============================================================================

SELECT 
  '=== INDEX USAGE STATISTICS ===' as section,
  tablename,
  indexname,
  idx_scan as scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  CASE 
    WHEN idx_scan = 0 THEN 0
    ELSE ROUND((idx_tup_fetch::numeric / idx_scan), 2)
  END as avg_tuples_per_scan,
  pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND (tablename LIKE 'stevie_%' OR tablename LIKE 'category_%')
ORDER BY idx_scan DESC;

-- ============================================================================
-- PART 4: Unused Indexes (Candidates for Removal)
-- ============================================================================

SELECT 
  '=== UNUSED INDEXES (CONSIDER REMOVING) ===' as section,
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as wasted_size,
  indexdef
FROM pg_stat_user_indexes
JOIN pg_indexes USING (schemaname, tablename, indexname)
WHERE schemaname = 'public'
  AND (tablename LIKE 'stevie_%' OR tablename LIKE 'category_%')
  AND idx_scan = 0
  AND indexname NOT LIKE '%_pkey'  -- Exclude primary keys
ORDER BY pg_relation_size(indexrelid) DESC;

-- ============================================================================
-- PART 5: Missing Indexes (Recommendations)
-- ============================================================================

-- Check if we have indexes for common query patterns
SELECT 
  '=== MISSING INDEX RECOMMENDATIONS ===' as section,
  'category_embeddings.category_id' as recommended_index,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE tablename = 'category_embeddings' 
      AND indexdef LIKE '%category_id%'
    ) THEN '✅ EXISTS'
    ELSE '❌ MISSING - Add: CREATE INDEX idx_category_embeddings_category_id ON category_embeddings(category_id);'
  END as status
UNION ALL
SELECT 
  'category_embeddings.metadata (GIN)' as recommended_index,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE tablename = 'category_embeddings' 
      AND indexdef LIKE '%metadata%'
      AND indexdef LIKE '%gin%'
    ) THEN '✅ EXISTS'
    ELSE '❌ MISSING - Add: CREATE INDEX idx_category_embeddings_metadata ON category_embeddings USING GIN (metadata);'
  END as status
UNION ALL
SELECT 
  'stevie_categories.metadata (GIN)' as recommended_index,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE tablename = 'stevie_categories' 
      AND indexdef LIKE '%metadata%'
      AND indexdef LIKE '%gin%'
    ) THEN '✅ EXISTS'
    ELSE '❌ MISSING - Add: CREATE INDEX idx_stevie_categories_metadata ON stevie_categories USING GIN (metadata);'
  END as status
UNION ALL
SELECT 
  'stevie_categories.program_id' as recommended_index,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_indexes 
      WHERE tablename = 'stevie_categories' 
      AND indexdef LIKE '%program_id%'
    ) THEN '✅ EXISTS'
    ELSE '❌ MISSING - Add: CREATE INDEX idx_stevie_categories_program_id ON stevie_categories(program_id);'
  END as status;

-- ============================================================================
-- PART 6: Index Bloat Analysis
-- ============================================================================

SELECT 
  '=== INDEX BLOAT ANALYSIS ===' as section,
  schemaname,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
  CASE 
    WHEN pg_relation_size(indexrelid) > 10485760 THEN '⚠️ LARGE (>10MB) - Consider monitoring'
    WHEN pg_relation_size(indexrelid) > 1048576 THEN '✓ MEDIUM (>1MB)'
    ELSE '✓ SMALL (<1MB)'
  END as size_category
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND (tablename LIKE 'stevie_%' OR tablename LIKE 'category_%')
ORDER BY pg_relation_size(indexrelid) DESC;

-- ============================================================================
-- PART 7: Duplicate Indexes (Same Columns)
-- ============================================================================

WITH index_columns AS (
  SELECT 
    schemaname,
    tablename,
    indexname,
    array_agg(attname ORDER BY attnum) as columns
  FROM pg_index
  JOIN pg_class ON pg_class.oid = pg_index.indexrelid
  JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
  JOIN pg_attribute ON pg_attribute.attrelid = pg_index.indrelid 
    AND pg_attribute.attnum = ANY(pg_index.indkey)
  WHERE schemaname = 'public'
    AND (tablename LIKE 'stevie_%' OR tablename LIKE 'category_%')
  GROUP BY schemaname, tablename, indexname
)
SELECT 
  '=== DUPLICATE INDEXES (SAME COLUMNS) ===' as section,
  tablename,
  array_agg(indexname) as duplicate_indexes,
  columns
FROM index_columns
GROUP BY schemaname, tablename, columns
HAVING COUNT(*) > 1;

-- ============================================================================
-- PART 8: Query Performance Test
-- ============================================================================

-- Test metadata filtering performance
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT COUNT(*)
FROM category_embeddings
WHERE metadata->>'nomination_subject_type' = 'company'
  AND metadata->'applicable_org_types' @> to_jsonb(ARRAY['non_profit'])
  AND metadata->>'gender_requirement' = 'female';

-- ============================================================================
-- PART 9: Index Recommendations Summary
-- ============================================================================

SELECT 
  '=== RECOMMENDATIONS SUMMARY ===' as section,
  'Total Indexes' as metric,
  COUNT(*)::text as value
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND (tablename LIKE 'stevie_%' OR tablename LIKE 'category_%')
UNION ALL
SELECT 
  'Unused Indexes' as metric,
  COUNT(*)::text as value
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND (tablename LIKE 'stevie_%' OR tablename LIKE 'category_%')
  AND idx_scan = 0
  AND indexname NOT LIKE '%_pkey'
UNION ALL
SELECT 
  'Total Index Size' as metric,
  pg_size_pretty(SUM(pg_relation_size(indexrelid))) as value
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND (tablename LIKE 'stevie_%' OR tablename LIKE 'category_%')
UNION ALL
SELECT 
  'Wasted Space (Unused)' as metric,
  pg_size_pretty(SUM(pg_relation_size(indexrelid))) as value
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND (tablename LIKE 'stevie_%' OR tablename LIKE 'category_%')
  AND idx_scan = 0
  AND indexname NOT LIKE '%_pkey';

-- ============================================================================
-- PART 10: Optimal Index Configuration
-- ============================================================================

SELECT 
  '=== OPTIMAL INDEX CONFIGURATION ===' as section,
  'category_embeddings' as table_name,
  'PRIMARY KEY (category_id)' as index_type,
  '✅ REQUIRED' as status,
  'Unique identifier, used in JOINs' as purpose
UNION ALL
SELECT 
  'category_embeddings',
  'GIN INDEX (metadata)',
  '✅ REQUIRED',
  'Pre-filtering by org_type, geography, gender (96-99% reduction)'
UNION ALL
SELECT 
  'category_embeddings',
  'GIN INDEX (metadata->geographic_scope)',
  '⚠️ OPTIONAL',
  'Specialized geography filtering (40% reduction) - only if geography queries are common'
UNION ALL
SELECT 
  'category_embeddings',
  'B-TREE INDEX (metadata->>gender_requirement)',
  '✅ RECOMMENDED',
  'Gender filtering (96-99% reduction) - huge performance gain for Women in Business'
UNION ALL
SELECT 
  'category_embeddings',
  'GIN INDEX (metadata->applicable_org_types)',
  '⚠️ OPTIONAL',
  'Org type filtering (11% reduction) - covered by main metadata GIN index'
UNION ALL
SELECT 
  'stevie_categories',
  'PRIMARY KEY (id)',
  '✅ REQUIRED',
  'Unique identifier, used in JOINs'
UNION ALL
SELECT 
  'stevie_categories',
  'GIN INDEX (metadata)',
  '✅ REQUIRED',
  'Metadata filtering (backup for category_embeddings)'
UNION ALL
SELECT 
  'stevie_categories',
  'B-TREE INDEX (program_id)',
  '✅ REQUIRED',
  'JOIN with stevie_programs table'
UNION ALL
SELECT 
  'stevie_programs',
  'PRIMARY KEY (id)',
  '✅ REQUIRED',
  'Unique identifier, used in JOINs';

-- ============================================================================
-- NOTES
-- ============================================================================

/*
INDEX STRATEGY:

1. REQUIRED INDEXES (Must Have):
   - category_embeddings: PRIMARY KEY, GIN(metadata)
   - stevie_categories: PRIMARY KEY, GIN(metadata), B-TREE(program_id)
   - stevie_programs: PRIMARY KEY

2. RECOMMENDED INDEXES (High Value):
   - category_embeddings: B-TREE(metadata->>'gender_requirement')
     → 96-99% reduction for gender-specific queries

3. OPTIONAL INDEXES (Low Value at Current Scale):
   - category_embeddings: GIN(metadata->'geographic_scope')
   - category_embeddings: GIN(metadata->'applicable_org_types')
     → Already covered by main GIN(metadata) index
     → Only add if query performance is slow

4. INDEXES TO AVOID:
   - Full-text search indexes (use GIN on metadata instead)
   - Indexes on low-cardinality columns (achievement_focus has only 3 values)
   - Composite indexes (not needed at 1,348 rows)

PERFORMANCE TARGETS:
- Metadata filtering: <1ms (with GIN indexes)
- Vector search: 30-50ms (with pre-filtering)
- Total query time: <100ms (including HyDE generation)

MAINTENANCE:
- VACUUM ANALYZE after bulk updates
- REINDEX if bloat detected (>50% wasted space)
- Monitor index usage with pg_stat_user_indexes
*/
