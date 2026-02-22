-- Migration: Remove ALL Search Vector Triggers
-- Date: 2026-02-22
-- Description: Comprehensive removal of all search_vector related triggers and functions

-- Drop all possible trigger variations
DROP TRIGGER IF EXISTS trigger_update_search_vector ON stevie_categories CASCADE;
DROP TRIGGER IF EXISTS update_search_vector ON stevie_categories CASCADE;
DROP TRIGGER IF EXISTS update_search_vector_trigger ON stevie_categories CASCADE;

-- Drop all possible function variations with CASCADE
DROP FUNCTION IF EXISTS update_search_vector() CASCADE;
DROP FUNCTION IF EXISTS update_search_vector_trigger() CASCADE;

-- Verify no triggers remain on stevie_categories
SELECT 
  'Migration 006 completed' as status,
  'Removed all search_vector triggers' as change,
  COUNT(*) as remaining_triggers
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE c.relname = 'stevie_categories'
  AND t.tgname LIKE '%search_vector%';
