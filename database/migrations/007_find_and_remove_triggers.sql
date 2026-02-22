-- Migration: Find and Remove ALL Triggers on stevie_categories
-- Date: 2026-02-22
-- Description: Comprehensive trigger removal

-- First, let's see what triggers exist
SELECT 
  t.tgname as trigger_name,
  p.proname as function_name,
  pg_get_triggerdef(t.oid) as trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
LEFT JOIN pg_proc p ON t.tgfoid = p.oid
WHERE c.relname = 'stevie_categories'
  AND NOT t.tgisinternal;

-- Now drop ALL triggers on stevie_categories
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT t.tgname
        FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        WHERE c.relname = 'stevie_categories'
          AND NOT t.tgisinternal
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON stevie_categories CASCADE', r.tgname);
        RAISE NOTICE 'Dropped trigger: %', r.tgname;
    END LOOP;
END $$;

-- Drop all functions that might be related
DROP FUNCTION IF EXISTS update_search_vector() CASCADE;
DROP FUNCTION IF EXISTS update_search_vector_trigger() CASCADE;
DROP FUNCTION IF EXISTS trigger_update_search_vector() CASCADE;

-- Verify no triggers remain
SELECT 
  'Migration 007 completed' as status,
  COUNT(*) as remaining_triggers
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE c.relname = 'stevie_categories'
  AND NOT t.tgisinternal;
