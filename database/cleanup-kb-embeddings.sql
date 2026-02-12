-- Cleanup Script: Remove kb_embeddings Table and Related Objects
-- 
-- This script removes the kb_embeddings table and search_similar_content function
-- since all Q&A vectors are now stored in Pinecone.
--
-- IMPORTANT: The stevie_categories table and its pgvector embeddings are NOT affected.
-- Category recommendations continue to use pgvector.
--
-- Run this script ONLY after verifying Pinecone integration is working.

-- ============================================================================
-- STEP 1: Backup (Optional but Recommended)
-- ============================================================================

-- If you have existing data in kb_embeddings, create a backup first:
-- CREATE TABLE kb_embeddings_backup AS SELECT * FROM kb_embeddings;

-- ============================================================================
-- STEP 2: Drop search_similar_content Function (if exists)
-- ============================================================================

-- Drop the RPC function used for pgvector similarity search
DROP FUNCTION IF EXISTS search_similar_content(
  query_embedding VECTOR(1536),
  content_type_filter TEXT,
  match_limit INTEGER,
  match_threshold FLOAT
) CASCADE;

-- Alternative: Drop all overloaded versions
DROP FUNCTION IF EXISTS search_similar_content CASCADE;

-- ============================================================================
-- STEP 3: Drop kb_embeddings Table (if exists)
-- ============================================================================

-- Drop the table that stored document embeddings
-- CASCADE will also drop any dependent objects (foreign keys, indexes, etc.)
DROP TABLE IF EXISTS kb_embeddings CASCADE;

-- ============================================================================
-- STEP 4: Verify Cleanup
-- ============================================================================

-- Check that kb_embeddings table is gone
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'kb_embeddings';
-- Expected: 0 rows

-- Check that search_similar_content function is gone
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name = 'search_similar_content';
-- Expected: 0 rows

-- ============================================================================
-- STEP 5: Verify stevie_categories Table Still Exists
-- ============================================================================

-- IMPORTANT: Verify that category recommendations table is NOT affected
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'stevie_categories';
-- Expected: 1 row (table should still exist)

-- Verify pgvector extension is still installed (needed for stevie_categories)
SELECT * FROM pg_extension WHERE extname = 'vector';
-- Expected: 1 row (extension should still be installed)

-- ============================================================================
-- STEP 6: Verify documents Table Still Exists
-- ============================================================================

-- Verify that documents table (metadata only) is NOT affected
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'documents';
-- Expected: 1 row (table should still exist)

-- Check documents table structure
\d documents;

-- ============================================================================
-- NOTES
-- ============================================================================

-- 1. This script is SAFE to run multiple times (uses IF EXISTS)
-- 2. pgvector extension is NOT removed (still needed for stevie_categories)
-- 3. documents table is NOT affected (stores metadata for Pinecone vectors)
-- 4. stevie_categories table is NOT affected (still uses pgvector)
-- 5. All Q&A vectors are now in Pinecone, not PostgreSQL

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================

-- If you need to rollback, you would need to:
-- 1. Recreate kb_embeddings table
-- 2. Recreate search_similar_content function
-- 3. Re-ingest all documents to PostgreSQL
-- 4. Update application code to use pgvector instead of Pinecone
--
-- This is NOT recommended as Pinecone is more scalable and performant.

-- ============================================================================
-- COMPLETION MESSAGE
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Cleanup complete!';
  RAISE NOTICE '✅ kb_embeddings table removed (if existed)';
  RAISE NOTICE '✅ search_similar_content function removed (if existed)';
  RAISE NOTICE '✅ pgvector extension preserved for stevie_categories';
  RAISE NOTICE '✅ documents table preserved for metadata';
  RAISE NOTICE '';
  RAISE NOTICE '📝 Next steps:';
  RAISE NOTICE '1. Verify Pinecone integration is working';
  RAISE NOTICE '2. Test document search via API';
  RAISE NOTICE '3. Test chatbot Q&A functionality';
  RAISE NOTICE '4. Verify category recommendations still work';
END $$;
