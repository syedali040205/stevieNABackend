-- Fix the similarity search function to filter by nomination_subject_type
-- This ensures we only return categories that match what the user is nominating

-- Drop the old function
DROP FUNCTION IF EXISTS search_similar_categories(vector, text, int);

-- Create updated function with nomination_subject filtering
CREATE OR REPLACE FUNCTION search_similar_categories(
  query_embedding vector(1536),
  user_geography text DEFAULT NULL,
  user_nomination_subject text DEFAULT NULL,
  match_limit int DEFAULT 10
)
RETURNS TABLE (
  category_id text,
  category_name text,
  description text,
  program_name text,
  program_code text,
  similarity_score float,
  geographic_scope text[],
  applicable_org_types text[],
  applicable_org_sizes text[],
  nomination_subject_type text,
  achievement_focus text[]
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sc.category_id,
    sc.category_name,
    sc.description,
    sc.program_name,
    sc.program_code,
    1 - (sc.embedding <=> query_embedding) AS similarity_score,
    sc.geographic_scope,
    sc.applicable_org_types,
    sc.applicable_org_sizes,
    sc.nomination_subject_type,
    sc.achievement_focus
  FROM stevie_categories sc
  WHERE 
    -- Filter by geography if provided
    (user_geography IS NULL OR user_geography = ANY(sc.geographic_scope))
    -- Filter by nomination subject if provided
    AND (user_nomination_subject IS NULL OR sc.nomination_subject_type = user_nomination_subject)
  ORDER BY sc.embedding <=> query_embedding
  LIMIT match_limit;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION search_similar_categories TO authenticated, anon;
