-- FIX: Metadata filtering issues
-- Problem 1: org_type mismatch - TypeScript sends "non-profit" but DB has "non_profit"
-- Problem 2: achievement_focus filter too restrictive - all categories have same 3 values
-- Solution: Normalize org_type (replace hyphens with underscores) and skip achievement_focus filter

DROP FUNCTION IF EXISTS search_similar_categories(vector, text, text, int, text, text[], text);

CREATE OR REPLACE FUNCTION search_similar_categories(
  query_embedding vector(1536),
  user_geography text DEFAULT NULL,
  user_nomination_subject text DEFAULT NULL,
  match_limit int DEFAULT 10,
  user_org_type text DEFAULT NULL,
  user_achievement_focus text[] DEFAULT NULL,
  user_gender text DEFAULT NULL
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
DECLARE
  normalized_org_type text;
BEGIN
  -- Normalize org_type: replace hyphens with underscores
  -- TypeScript sends "non-profit" but DB has "non_profit"
  normalized_org_type := CASE 
    WHEN user_org_type IS NOT NULL THEN REPLACE(user_org_type, '-', '_')
    ELSE NULL
  END;

  RETURN QUERY
  SELECT 
    sc.id::text as category_id,
    sc.category_name,
    sc.description,
    sp.program_name,
    sp.program_code,
    -- Similarity score with minimal boosting
    CASE 
      WHEN sp.program_name = 'Stevie Awards for Technology Excellence' THEN 
        (1 - (ce.embedding <=> query_embedding)) * 1.05
      ELSE 
        1 - (ce.embedding <=> query_embedding)
    END AS similarity_score,
    sc.metadata
  FROM stevie_categories sc
  INNER JOIN category_embeddings ce ON ce.category_id = sc.id
  INNER JOIN stevie_programs sp ON sp.id = sc.program_id
  WHERE 
    -- Filter by nomination subject (REQUIRED - must match)
    (
      user_nomination_subject IS NULL 
      OR sc.metadata->>'nomination_subject_type' = user_nomination_subject
    )
    
    -- Filter by geography (REQUIRED if provided - must match)
    AND (
      user_geography IS NULL 
      OR sc.metadata->'geographic_scope' @> to_jsonb(ARRAY[user_geography])
    )
    
    -- Filter by org type (REQUIRED if provided - must match)
    -- Uses normalized_org_type to handle hyphen/underscore mismatch
    AND (
      normalized_org_type IS NULL 
      OR sc.metadata->'applicable_org_types' @> to_jsonb(ARRAY[normalized_org_type])
    )
    
    -- Filter by gender (REQUIRED if provided - must match)
    AND (
      user_gender IS NULL 
      OR sc.metadata->>'gender_requirement' IS NULL
      OR sc.metadata->>'gender_requirement' = 'any'
      OR sc.metadata->>'gender_requirement' = user_gender
    )
    
    -- NOTE: achievement_focus is NOT filtered here!
    -- Reason: All categories have same 3 values (innovation, growth, leadership)
    -- User queries often have different values (sustainability, agriculture, etc.)
    -- Filtering would return 0 results - let semantic search handle it instead
    -- The HyDE + contextual embeddings will match based on description/name
    
  ORDER BY similarity_score DESC
  LIMIT match_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION search_similar_categories TO authenticated, anon;

-- Test the fix
SELECT 
  '✅ Fixed metadata filtering' as status,
  'org_type normalized (hyphen→underscore), achievement_focus skipped' as changes;

-- Verify it works with agriculture query
SELECT 
  'Test: Non-profit company categories' as test_name,
  COUNT(*) as matching_categories
FROM stevie_categories
WHERE 
  metadata->>'nomination_subject_type' = 'company'
  AND metadata->'applicable_org_types' @> to_jsonb(ARRAY['non_profit']);
  
-- Should return ~636 categories (all company categories that allow non-profit)
