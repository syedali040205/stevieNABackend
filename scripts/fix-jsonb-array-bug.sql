-- Fix: "op ANY/ALL (array) requires array on right side" error
-- 
-- ISSUE: The database columns are JSONB, not text[]
-- The function was using ANY() which only works with PostgreSQL arrays
-- 
-- FIX: Use JSONB containment operator @> instead of ANY()

DROP FUNCTION IF EXISTS search_similar_categories(vector(1536), text, integer);

CREATE OR REPLACE FUNCTION search_similar_categories(
  query_embedding vector(1536),
  user_geography text DEFAULT NULL,
  match_limit integer DEFAULT 10
)
RETURNS TABLE (
  category_id uuid,
  similarity_score float,
  category_name text,
  description text,
  program_name text,
  program_code text,
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
    c.id as category_id,
    1 - (ce.embedding <=> query_embedding) as similarity_score,
    c.category_name,
    c.description,
    p.program_name,
    p.program_code,
    c.geographic_scope,
    c.applicable_org_types,
    c.applicable_org_sizes,
    c.nomination_subject_type,
    c.achievement_focus
  FROM category_embeddings ce
  JOIN stevie_categories c ON ce.category_id = c.id
  JOIN stevie_programs p ON c.program_id = p.id
  WHERE 
    -- Filter by geography if provided
    -- If user_geography is NULL or 'worldwide', match all categories
    -- Otherwise, use JSONB containment operator @> to check if geography is in scope
    (user_geography IS NULL 
     OR user_geography = 'worldwide' 
     OR c.geographic_scope @> to_jsonb(ARRAY[user_geography])
     OR c.geographic_scope @> to_jsonb(ARRAY['worldwide']))
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION search_similar_categories TO authenticated;
GRANT EXECUTE ON FUNCTION search_similar_categories TO anon;
GRANT EXECUTE ON FUNCTION search_similar_categories TO service_role;
