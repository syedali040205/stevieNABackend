-- ============================================================================
-- Remove Hybrid Search (BM25) Implementation
-- ============================================================================
-- Purpose: Rollback all BM25/hybrid search changes and revert to pure vector search
-- Run this in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- STEP 1: Drop BM25 search function
-- ============================================================================

DROP FUNCTION IF EXISTS search_categories_bm25(text, int);
DROP FUNCTION IF EXISTS search_categories_bm25(text, text, int);

-- ============================================================================
-- STEP 2: Drop search_vector column and index
-- ============================================================================

DROP INDEX IF EXISTS idx_categories_search_vector;
DROP INDEX IF EXISTS idx_stevie_categories_search_vector;

ALTER TABLE stevie_categories 
DROP COLUMN IF EXISTS search_vector;

-- ============================================================================
-- STEP 3: Verify cleanup
-- ============================================================================

-- Check that search_vector column is gone
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'stevie_categories' 
  AND column_name = 'search_vector';
-- Should return 0 rows

-- Check that BM25 function is gone
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name LIKE '%bm25%';
-- Should return 0 rows

-- Check that search_vector index is gone
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'stevie_categories' 
  AND indexname LIKE '%search_vector%';
-- Should return 0 rows

SELECT '✅ Hybrid search (BM25) removed successfully' as status;
SELECT '✅ Reverted to pure vector search with contextual embeddings' as current_state;
