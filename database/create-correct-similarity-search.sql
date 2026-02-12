-- Create the correct similarity search function based on actual schema
-- stevie_categories does NOT have embedding column - it's in category_embeddings table

DROP FUNCTION IF EXISTS search_similar_categories(vector, text, text, int);

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
    1 - (ce.embedding <=> query_embedding) AS similarity_score,
    sc.geographic_scope,
    sc.applicable_org_types,
    sc.applicable_org_sizes,
    sc.nomination_subject_type,
    sc.achievement_focus
  FROM stevie_categories sc
  INNER JOIN category_embeddings ce ON ce.category_id = sc.id
  INNER JOIN stevie_programs sp ON sp.id = sc.program_id
  WHERE 
    -- Filter by geography if provided (JSONB contains check)
    (user_geography IS NULL OR sc.geographic_scope @> to_jsonb(user_geography))
    -- Filter by nomination subject if provided
    AND (user_nomination_subject IS NULL OR sc.nomination_subject_type = user_nomination_subject)
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_limit;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION search_similar_categories TO authenticated, anon;

-- Also delete the category_embeddings table as requested
-- WARNING: This will delete all embeddings! Make sure you have a backup or can regenerate them
-- DROP TABLE IF EXISTS category_embeddings CASCADE;
