-- Migration: Drop Old Search Vector Trigger
-- Date: 2026-02-22
-- Description: Remove old trigger that references non-existent search_vector column
-- This trigger is blocking metadata updates for the staged hybrid filtering implementation

-- Drop the trigger first (explicit name from error message)
DROP TRIGGER IF EXISTS trigger_update_search_vector ON stevie_categories;

-- Drop the function with CASCADE to remove all dependencies
DROP FUNCTION IF EXISTS update_search_vector() CASCADE;

-- Verify
SELECT 
  'Migration 005 completed' as status,
  'Removed old search_vector trigger and function' as change;
