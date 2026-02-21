-- Add metadata filtering with graceful fallback
-- This improves relevance and performance by pre-filtering before vector search

DROP FUNCTION IF EXISTS search_similar_categories(vector, text, text, int);

CREATE OR REPLACE FUNCTION search_similar_categories(
  query_embedding vector(1536),
  user_geography text DEFAULT NULL,
  user_nomination_subject text DEFAULT NULL,
  match_limit int DEFAULT 10,
  user_org_type text DEFAULT NULL,
  user_achievement_focus text[] DEFAULT NULL
)
RETURNS TABLE (
  category_id text,
  category_name text,
  description text,
  program_name text,
  program_code text,
  similarity_score float,
  geographic_scope jsonb,
  applicable_org_types jsonb,
  applicable_org_sizes jsonb,
  nomination_subject_type text,
  achievement_focus jsonb
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
    -- Minimal boosting - let HyDE + contextual embeddings do the work
    CASE 
      WHEN sp.program_name = 'Stevie Awards for Technology Excellence' THEN 
        (1 - (ce.embedding <=> query_embedding)) * 1.05
      ELSE 
        1 - (ce.embedding <=> query_embedding)
    END AS similarity_score,
    sc.geographic_scope,
    sc.applicable_org_types,
    sc.applicable_org_sizes,
    sc.nomination_subject_type,
    sc.achievement_focus
  FROM stevie_categories sc
  INNER JOIN category_embeddings ce ON ce.category_id = sc.id
  INNER JOIN stevie_programs sp ON sp.id = sc.program_id
  WHERE 
    -- Filter by nomination subject (required)
    (user_nomination_subject IS NULL OR sc.nomination_subject_type = user_nomination_subject)
    
    -- Filter by org type (if provided)
    -- Check if user's org_type is in the category's applicable_org_types array
    AND (
      user_org_type IS NULL 
      OR sc.applicable_org_types @> to_jsonb(ARRAY[user_org_type])
    )
    
    -- Filter by achievement focus (if provided)
    -- Check if ANY of user's focus areas match ANY of category's focus areas
    AND (
      user_achievement_focus IS NULL 
      OR sc.achievement_focus && user_achievement_focus  -- && is the "overlap" operator
    )
    
  ORDER BY similarity_score DESC
  LIMIT match_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION search_similar_categories TO authenticated, anon;

-- Test queries to verify filtering works

-- Test 1: Non-profit organization with sustainability focus
SELECT 
  'Test 1: Non-profit + Sustainability' as test_name,
  COUNT(*) as matching_categories
FROM stevie_categories sc
WHERE 
  sc.nomination_subject_type = 'company'
  AND sc.applicable_org_types @> to_jsonb(ARRAY['non-profit'])
  AND sc.achievement_focus && ARRAY['sustainability', 'agriculture'];

-- Test 2: For-profit product with innovation focus
SELECT 
  'Test 2: For-profit + Innovation' as test_name,
  COUNT(*) as matching_categories
FROM stevie_categories sc
WHERE 
  sc.nomination_subject_type = 'product'
  AND sc.applicable_org_types @> to_jsonb(ARRAY['for-profit'])
  AND sc.achievement_focus && ARRAY['innovation', 'technology'];

-- Test 3: Show sample filtered categories
SELECT 
  'Test 3: Sample filtered categories' as test_name,
  sc.category_name,
  sc.nomination_subject_type,
  sc.applicable_org_types,
  sc.achievement_focus
FROM stevie_categories sc
WHERE 
  sc.nomination_subject_type = 'company'
  AND sc.applicable_org_types @> to_jsonb(ARRAY['non-profit'])
  AND sc.achievement_focus && ARRAY['sustainability']
LIMIT 5;

SELECT 'Metadata filtering added successfully!' as status;
