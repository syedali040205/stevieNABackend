-- Migration 009: Support Multiple Geography Filtering
-- Allows users to see categories from multiple geographies (e.g., Regional + Global)

-- Drop existing function
DROP FUNCTION IF EXISTS search_similar_categories(
  query_embedding vector(1536),
  user_geography text,
  user_nomination_subject text,
  match_limit int,
  user_org_type text,
  user_achievement_focus text[],
  user_gender text,
  user_category_types text[]
);

-- Create updated function with multiple geography support
CREATE OR REPLACE FUNCTION search_similar_categories(
  query_embedding vector(1536),
  user_geographies text[], -- Changed from single text to array
  user_nomination_subject text DEFAULT NULL,
  match_limit int DEFAULT 10,
  user_org_type text DEFAULT NULL,
  user_achievement_focus text[] DEFAULT NULL,
  user_gender text DEFAULT 'any',
  user_category_types text[] DEFAULT NULL
)
RETURNS TABLE (
  category_id uuid,
  category_name text,
  description text,
  program_name text,
  program_code text,
  geographic_scope text[],
  applicable_org_types text[],
  applicable_org_sizes text[],
  nomination_subject_type text,
  achievement_focus text[],
  similarity_score float,
  metadata jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    sc.id as category_id,
    sc.category_name,
    sc.description,
    sp.program_name,
    sp.program_code,
    ARRAY(SELECT jsonb_array_elements_text(sc.metadata->'geographic_scope')) as geographic_scope,
    ARRAY(SELECT jsonb_array_elements_text(sc.metadata->'applicable_org_types')) as applicable_org_types,
    ARRAY(SELECT jsonb_array_elements_text(sc.metadata->'applicable_org_sizes')) as applicable_org_sizes,
    (sc.metadata->>'nomination_subject_type')::text as nomination_subject_type,
    ARRAY(SELECT jsonb_array_elements_text(sc.metadata->'achievement_focus')) as achievement_focus,
    1 - (ce.embedding <=> query_embedding) as similarity_score,
    sc.metadata
  FROM stevie_categories sc
  JOIN category_embeddings ce ON sc.id = ce.category_id
  JOIN stevie_programs sp ON sc.program_id = sp.id
  WHERE 1=1
    
    -- Filter by category types (intent-based pre-filtering)
    AND (
      user_category_types IS NULL 
      OR sc.metadata->'category_types' ?| user_category_types
    )
    
    -- Filter by geography (UPDATED: support multiple geographies)
    AND (
      user_geographies IS NULL 
      OR user_geographies = ARRAY[]::text[]
      OR EXISTS (
        SELECT 1 
        FROM unnest(user_geographies) AS user_geo
        WHERE sc.metadata->'geographic_scope' ? user_geo
      )
    )
    
    -- Filter by gender (user preference)
    AND (
      (user_gender = 'opt_out' AND sp.program_name != 'Stevie Awards for Women in Business')
      OR user_gender = 'any'
      OR (user_gender = 'female' AND (
        sp.program_name = 'Stevie Awards for Women in Business'
        OR (sc.metadata->>'gender_requirement' IS NULL OR sc.metadata->>'gender_requirement' = 'any')
      ))
      OR (user_gender = 'male' AND (
        sp.program_name != 'Stevie Awards for Women in Business'
        AND (sc.metadata->>'gender_requirement' IS NULL OR sc.metadata->>'gender_requirement' = 'any')
      ))
    )
    
    -- Filter by nomination subject
    AND (
      user_nomination_subject IS NULL 
      OR sc.metadata->>'nomination_subject_type' = user_nomination_subject
      OR sc.metadata->>'nomination_subject_type' = 'any'
    )
    
    -- Filter by organization type
    AND (
      user_org_type IS NULL 
      OR sc.metadata->'applicable_org_types' @> to_jsonb(ARRAY[user_org_type])
      OR sc.metadata->'applicable_org_types' @> to_jsonb(ARRAY['any'])
    )
    
    -- Filter by achievement focus
    AND (
      user_achievement_focus IS NULL 
      OR ARRAY(SELECT jsonb_array_elements_text(sc.metadata->'achievement_focus')) && user_achievement_focus
    )
  
  ORDER BY similarity_score DESC
  LIMIT match_limit;
END;
$$;

-- Add comment
COMMENT ON FUNCTION search_similar_categories IS 'Search categories with multiple geography support. Pass array of geographies like ARRAY[''Asia-Pacific'', ''Global''] to see categories from multiple regions.';
