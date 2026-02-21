-- ============================================================================
-- Index Health Monitoring Query
-- ============================================================================
-- Purpose: Monitor index usage, size, and performance
-- Usage: Run weekly to track index health
-- ============================================================================

-- ============================================================================
-- DASHBOARD: Quick Health Check
-- ============================================================================

SELECT 
  '=== INDEX HEALTH DASHBOARD ===' as section,
  (SELECT COUNT(*) FROM pg_indexes 
   WHERE schemaname = 'public' 
   AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')) as total_indexes,
  (SELECT pg_size_pretty(SUM(pg_relation_size(indexrelid))) 
   FROM pg_stat_user_indexes 
   WHERE schemaname = 'public' 
   AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')) as total_size,
  (SELECT COUNT(*) FROM pg_stat_user_indexes 
   WHERE schemaname = 'public' 
   AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')
   AND idx_scan = 0 
   AND indexname NOT LIKE '%pkey') as unused_indexes,
  CASE 
    WHEN (SELECT COUNT(*) FROM pg_indexes 
          WHERE schemaname = 'public' 
          AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')) = 11 
    THEN '✅ Optimal'
    ELSE '⚠️ Review needed'
  END as health_status;

-- ============================================================================
-- METRIC 1: Index Usage Statistics
-- ============================================================================

SELECT 
  '=== INDEX USAGE ===' as metric,
  tablename,
  indexname,
  idx_scan as times_used,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) as size,
  CASE 
    WHEN idx_scan = 0 AND indexname LIKE '%pkey' THEN '✅ Primary Key'
    WHEN idx_scan = 0 THEN '⚠️ Unused'
    WHEN idx_scan < 10 THEN '⚠️ Low usage'
    WHEN idx_scan < 100 THEN '✅ Moderate usage'
    ELSE '✅ High usage'
  END as usage_status,
  CASE 
    WHEN idx_scan > 0 THEN ROUND(idx_tup_fetch::numeric / idx_scan, 2)
    ELSE 0
  END as avg_tuples_per_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')
ORDER BY idx_scan DESC, pg_relation_size(indexrelid) DESC;

-- ============================================================================
-- METRIC 2: Index Size and Bloat
-- ============================================================================

SELECT 
  '=== INDEX SIZE ===' as metric,
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) as current_size,
  pg_size_pretty(pg_total_relation_size(indexrelid)) as total_size_with_toast,
  CASE 
    WHEN pg_relation_size(indexrelid) > 5 * 1024 * 1024 THEN '⚠️ Large (>5MB)'
    WHEN pg_relation_size(indexrelid) > 1 * 1024 * 1024 THEN '✅ Medium (1-5MB)'
    ELSE '✅ Small (<1MB)'
  END as size_status,
  ROUND(100.0 * pg_relation_size(indexrelid) / 
    NULLIF(SUM(pg_relation_size(indexrelid)) OVER (), 0), 1) as pct_of_total
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')
ORDER BY pg_relation_size(indexrelid) DESC;

-- ============================================================================
-- METRIC 3: Table Statistics
-- ============================================================================

SELECT 
  '=== TABLE STATISTICS ===' as metric,
  schemaname || '.' || tablename as table_name,
  n_live_tup as live_rows,
  n_dead_tup as dead_rows,
  CASE 
    WHEN n_live_tup > 0 THEN ROUND(100.0 * n_dead_tup / n_live_tup, 1)
    ELSE 0
  END as dead_row_pct,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze,
  CASE 
    WHEN n_dead_tup > n_live_tup * 0.2 THEN '⚠️ Needs VACUUM'
    WHEN last_analyze < NOW() - INTERVAL '7 days' THEN '⚠️ Needs ANALYZE'
    ELSE '✅ Healthy'
  END as maintenance_status
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')
ORDER BY n_live_tup DESC;

-- ============================================================================
-- METRIC 4: Index Hit Rate (Cache Efficiency)
-- ============================================================================

SELECT 
  '=== INDEX CACHE HIT RATE ===' as metric,
  tablename,
  indexname,
  idx_blks_read as disk_reads,
  idx_blks_hit as cache_hits,
  CASE 
    WHEN (idx_blks_hit + idx_blks_read) > 0 
    THEN ROUND(100.0 * idx_blks_hit / (idx_blks_hit + idx_blks_read), 2)
    ELSE 0
  END as cache_hit_rate_pct,
  CASE 
    WHEN (idx_blks_hit + idx_blks_read) = 0 THEN '⚠️ No activity'
    WHEN 100.0 * idx_blks_hit / (idx_blks_hit + idx_blks_read) > 99 THEN '✅ Excellent (>99%)'
    WHEN 100.0 * idx_blks_hit / (idx_blks_hit + idx_blks_read) > 95 THEN '✅ Good (95-99%)'
    WHEN 100.0 * idx_blks_hit / (idx_blks_hit + idx_blks_read) > 90 THEN '⚠️ Fair (90-95%)'
    ELSE '❌ Poor (<90%)'
  END as cache_status
FROM pg_statio_user_indexes
WHERE schemaname = 'public'
  AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')
ORDER BY (idx_blks_hit + idx_blks_read) DESC;

-- ============================================================================
-- METRIC 5: Duplicate and Redundant Indexes
-- ============================================================================

WITH index_columns AS (
  SELECT 
    i.indexrelid,
    i.indrelid,
    i.indkey::text as columns,
    am.amname as index_type
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_am am ON am.oid = c.relam
  WHERE c.relnamespace = 'public'::regnamespace
)
SELECT 
  '=== DUPLICATE INDEX CHECK ===' as metric,
  t.relname as table_name,
  c1.relname as index1,
  c2.relname as index2,
  ic1.columns,
  ic1.index_type,
  CASE 
    WHEN ic1.columns = ic2.columns AND ic1.index_type = ic2.index_type 
    THEN '⚠️ Exact duplicate'
    ELSE '✅ No duplicates'
  END as duplicate_status
FROM index_columns ic1
JOIN index_columns ic2 ON ic1.indrelid = ic2.indrelid 
  AND ic1.columns = ic2.columns 
  AND ic1.index_type = ic2.index_type
  AND ic1.indexrelid < ic2.indexrelid
JOIN pg_class c1 ON c1.oid = ic1.indexrelid
JOIN pg_class c2 ON c2.oid = ic2.indexrelid
JOIN pg_class t ON t.oid = ic1.indrelid
WHERE t.relname IN ('category_embeddings', 'stevie_categories', 'stevie_programs');

-- ============================================================================
-- METRIC 6: Query Performance Indicators
-- ============================================================================

SELECT 
  '=== QUERY PERFORMANCE ===' as metric,
  tablename,
  seq_scan as sequential_scans,
  seq_tup_read as seq_rows_read,
  idx_scan as index_scans,
  idx_tup_fetch as idx_rows_fetched,
  CASE 
    WHEN seq_scan > 0 AND idx_scan > 0 
    THEN ROUND(100.0 * idx_scan / (seq_scan + idx_scan), 1)
    WHEN idx_scan > 0 THEN 100.0
    ELSE 0
  END as index_usage_pct,
  CASE 
    WHEN seq_scan > idx_scan THEN '⚠️ High sequential scans'
    WHEN idx_scan > seq_scan * 10 THEN '✅ Excellent index usage'
    WHEN idx_scan > seq_scan THEN '✅ Good index usage'
    ELSE '⚠️ Review query patterns'
  END as performance_status
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')
ORDER BY seq_scan DESC;

-- ============================================================================
-- RECOMMENDATIONS
-- ============================================================================

WITH recommendations AS (
  SELECT 
    'Unused indexes' as issue,
    COUNT(*) as count,
    string_agg(indexname, ', ') as details,
    'Consider dropping after 1 month of no usage' as action
  FROM pg_stat_user_indexes
  WHERE schemaname = 'public'
    AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')
    AND idx_scan = 0
    AND indexname NOT LIKE '%pkey'
  
  UNION ALL
  
  SELECT 
    'Tables need VACUUM' as issue,
    COUNT(*) as count,
    string_agg(tablename, ', ') as details,
    'Run VACUUM ANALYZE' as action
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
    AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')
    AND n_dead_tup > n_live_tup * 0.2
  
  UNION ALL
  
  SELECT 
    'Tables need ANALYZE' as issue,
    COUNT(*) as count,
    string_agg(tablename, ', ') as details,
    'Run ANALYZE' as action
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
    AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')
    AND last_analyze < NOW() - INTERVAL '7 days'
  
  UNION ALL
  
  SELECT 
    'Low cache hit rate' as issue,
    COUNT(*) as count,
    string_agg(indexname, ', ') as details,
    'Increase shared_buffers or investigate query patterns' as action
  FROM pg_statio_user_indexes
  WHERE schemaname = 'public'
    AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')
    AND (idx_blks_hit + idx_blks_read) > 0
    AND 100.0 * idx_blks_hit / (idx_blks_hit + idx_blks_read) < 90
)
SELECT 
  '=== RECOMMENDATIONS ===' as section,
  issue,
  count,
  details,
  action,
  CASE 
    WHEN count = 0 THEN '✅ No action needed'
    WHEN count > 0 THEN '⚠️ Action recommended'
  END as priority
FROM recommendations
WHERE count > 0;

-- ============================================================================
-- SUMMARY
-- ============================================================================

SELECT 
  '=== HEALTH SUMMARY ===' as section,
  CASE 
    WHEN (SELECT COUNT(*) FROM pg_stat_user_indexes 
          WHERE schemaname = 'public' 
          AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')
          AND idx_scan = 0 
          AND indexname NOT LIKE '%pkey') = 0
    AND (SELECT COUNT(*) FROM pg_stat_user_tables
         WHERE schemaname = 'public'
         AND tablename IN ('category_embeddings', 'stevie_categories', 'stevie_programs')
         AND n_dead_tup > n_live_tup * 0.2) = 0
    THEN '✅ All indexes healthy'
    ELSE '⚠️ Review recommendations above'
  END as overall_health;

-- ============================================================================
-- NOTES
-- ============================================================================

/*
MONITORING SCHEDULE:

Daily:
- Check query performance (<100ms target)
- Monitor error logs

Weekly:
- Run this health check script
- Review index usage statistics
- Check for unused indexes

Monthly:
- Run VACUUM ANALYZE
- Review cache hit rates
- Optimize based on usage patterns

Quarterly:
- Full index review
- Remove unused indexes (0 scans for 3 months)
- Add indexes for new query patterns
- Update documentation

ALERT THRESHOLDS:

⚠️ Warning:
- Unused index for >1 week (not primary key)
- Dead rows >20% of live rows
- Cache hit rate <95%
- Sequential scans > index scans

❌ Critical:
- Unused index for >1 month
- Dead rows >50% of live rows
- Cache hit rate <90%
- Index size >5MB (at current scale)

MAINTENANCE COMMANDS:

-- Reclaim space and update statistics
VACUUM ANALYZE category_embeddings;
VACUUM ANALYZE stevie_categories;
VACUUM ANALYZE stevie_programs;

-- Reset statistics (if needed)
SELECT pg_stat_reset();

-- Rebuild bloated index (if needed)
REINDEX INDEX CONCURRENTLY idx_category_embeddings_metadata;
*/
