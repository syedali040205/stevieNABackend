-- FIX V2: Reduced boosting to let semantic similarity dominate
-- Previous version had 1.5x boost which was too aggressive

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
    -- Only filter by nomination subject if provided
    (user_nomination_subject IS NULL OR sc.nomination_subject_type = user_nomination_subject)
  ORDER BY similarity_score DESC
  LIMIT match_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION search_similar_categories TO authenticated, anon;

SELECT 'Function updated with reduced boosting!' as status;
