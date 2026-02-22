-- Migration: Category Type Pre-Filtering (Staged Hybrid Approach)
-- Date: 2026-02-22
-- Description: Replace old metadata filters with category_type + nomination_subject pre-filtering
-- 
-- Changes from 002_pure_semantic_search.sql:
-- 1. REMOVE old metadata filters: applicable_org_types, achievement_focus keyword matching
-- 2. ADD user_category_types parameter for intent-based pre-filtering
-- 3. ADD nomination_subject filtering using OpenAI-generated applicable_nomination_subjects metadata
-- 4. Pre-filter by category_types + nomination_subject BEFORE vector search (Stage 1)
-- 5. Keep ONLY geography and gender filtering (user preferences)
-- 6. Remove keyword/focus boosts - let semantic search handle it
--
-- Philosophy: "Similarity is not the same as relevance"
-- Pre-filter by intent (category_types) AND nomination type, then let semantic search rank
--
-- Based on research: https://www.mtechzilla.com/guides/rag-systems-metadata-filtering-over-embeddings

DROP FUNCTION IF EXISTS search_similar_categories(vector, text, text, int, text, text[], text, text[]);
DROP FUNCTION IF EXISTS search_similar_categories(vector, text, text, int, text, text[], text);

CREATE OR REPLACE FUNCTION search_similar_categories(
  query_embedding vector(1536),
  user_geography text DEFAULT NULL,
  user_nomination_subject text DEFAULT NULL,  -- NOW USED: Filters by applicable_nomination_subjects metadata
  match_limit int DEFAULT 10,
  user_org_type text DEFAULT NULL,            -- Deprecated, not used
  user_achievement_focus text[] DEFAULT NULL, -- Deprecated, not used
  user_gender text DEFAULT NULL,
  user_category_types text[] DEFAULT NULL     -- NEW: Intent-based pre-filtering
)
RETURNS TABLE (
  category_id text,
  category_name text,
  description text,
  program_name text,
  program_code text,
  similarity_score float,
  metadata jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sc.id::text as category_id,
    sc.category_name,
    sc.description,
    sp.program_name,
    sp.program_code,
    -- PURE SEMANTIC SIMILARITY (no boosts)
    -- Let contextual embeddings and HyDE handle the ranking
    (1 - (ce.embedding <=> query_embedding)) AS similarity_score,
    sc.metadata
  FROM stevie_categories sc
  INNER JOIN category_embeddings ce ON ce.category_id = sc.id
  INNER JOIN stevie_programs sp ON sp.id = sc.program_id
  WHERE 
    -- STAGE 1: PRE-FILTER (Intent-based filtering to reduce search space)
    
    -- Filter by category types (intent detection)
    -- If user_category_types is provided, only search those types
    -- This separates healthcare from women_empowerment, technology from business, etc.
    (
      user_category_types IS NULL 
      OR sc.metadata->>'primary_focus' = ANY(user_category_types)
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(sc.metadata->'category_types') AS cat_type
        WHERE cat_type = ANY(user_category_types)
      )
    )
    
    -- Filter by nomination subject (NEW: using OpenAI-generated metadata)
    -- More accurate than old pre-filter because OpenAI classifies what each category accepts
    AND (
      user_nomination_subject IS NULL
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(sc.metadata->'applicable_nomination_subjects') AS nom_subj
        WHERE nom_subj = user_nomination_subject
      )
    )
    
    -- Filter by geography (user preference)
    AND (
      user_geography IS NULL 
      OR sc.metadata->'geographic_scope' @> to_jsonb(ARRAY[user_geography])
    )
    
    -- Filter by gender (user preference)
    AND (
      (user_gender = 'opt_out' AND sp.program_name != 'Stevie Awards for Women in Business')
      OR (COALESCE(user_gender, 'any') != 'opt_out' AND (
        user_gender IS NULL 
        OR sc.metadata->>'gender_requirement' IS NULL
        OR sc.metadata->>'gender_requirement' = 'any'
        OR sc.metadata->>'gender_requirement' = user_gender
      ))
    )
    
  -- STAGE 2: VECTOR SEARCH (Pure semantic ranking on filtered set)
  ORDER BY similarity_score DESC
  LIMIT match_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION search_similar_categories TO authenticated, anon;

-- Add comment
COMMENT ON FUNCTION search_similar_categories IS 
'Staged hybrid filtering for RAG (simplified):
Stage 1 (Pre-filter): Filter by category_types (intent), nomination_subject, geography, gender
Stage 2 (Vector search): Pure semantic ranking with contextual embeddings + HyDE

Filters:
- category_types: Intent-based (healthcare vs women_empowerment vs technology, etc.)
- nomination_subject: OpenAI-classified applicable subjects (individual, team, organization, product)
- geography: User preference
- gender: User preference

Removed old filters:
- applicable_org_types (let semantic search handle it)  
- achievement_focus keyword matching (let HyDE handle it)
- All scoring boosts (let contextual embeddings handle it)

Philosophy: Pre-filter by INTENT and NOMINATION TYPE, then trust semantic search to rank correctly.
This prevents "women helping women" matching healthcare queries AND ensures individual awards 
don''t match company nominations.';

-- Verification
SELECT 
  'Migration 004 completed' as status,
  'Added category_type and nomination_subject intent filtering' as change;
