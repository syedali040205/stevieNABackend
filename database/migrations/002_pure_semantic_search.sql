-- Migration: Pure Semantic Search with Post-Filtering
-- Date: 2026-02-22
-- Description: Remove pre-filtering to allow pure semantic matching, then filter by geography/gender after scoring
-- 
-- Changes from 001_hybrid_scoring.sql:
-- 1. Remove nomination_subject pre-filter (let semantic search handle it)
-- 2. Remove org_type pre-filter (let semantic search handle it)
-- 3. Keep geography and gender filters (user preferences)
-- 4. Increase match_limit internally to get more candidates before filtering
--
-- This allows social impact achievements to match healthcare/CSR categories
-- even if nomination_subject doesn't perfectly align

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
  user_focus_lower text[];
  keyword_boost_amount float := 0.15; -- Max 15% boost for keyword matching
  focus_boost_amount float := 0.05;   -- Max 5% boost for achievement focus
  program_boost_amount float := 0.05; -- 5% boost for Technology Excellence
BEGIN
  -- Convert achievement_focus to lowercase for case-insensitive matching
  IF user_achievement_focus IS NOT NULL THEN
    SELECT array_agg(lower(unnest)) INTO user_focus_lower
    FROM unnest(user_achievement_focus);
  END IF;

  RETURN QUERY
  SELECT 
    sc.id::text as category_id,
    sc.category_name,
    sc.description,
    sp.program_name,
    sp.program_code,
    -- HYBRID SCORING FORMULA
    LEAST(0.95, -- Cap at 95% to maintain credibility
      -- Base semantic similarity (50-70% typical)
      (1 - (ce.embedding <=> query_embedding))
      
      -- Keyword matching boost (0-15%)
      + CASE 
          WHEN user_focus_lower IS NOT NULL THEN
            (
              -- Check category name (5% per match)
              (SELECT COUNT(*) * 0.05 FROM unnest(user_focus_lower) AS keyword
               WHERE lower(sc.category_name) LIKE '%' || keyword || '%')
              +
              -- Check description (3% per match)
              (SELECT COUNT(*) * 0.03 FROM unnest(user_focus_lower) AS keyword
               WHERE lower(sc.description) LIKE '%' || keyword || '%')
              +
              -- Check contextual prefix (2% per match)
              (SELECT COUNT(*) * 0.02 FROM unnest(user_focus_lower) AS keyword
               WHERE lower(ce.contextual_prefix) LIKE '%' || keyword || '%')
            )
          ELSE 0
        END
      
      -- Achievement focus alignment boost (0-5%)
      + CASE
          WHEN user_focus_lower IS NOT NULL 
               AND sc.metadata->'achievement_focus' IS NOT NULL THEN
            LEAST(focus_boost_amount,
              (SELECT COUNT(*) * 0.02 FROM unnest(user_focus_lower) AS user_kw
               WHERE EXISTS (
                 SELECT 1 FROM jsonb_array_elements_text(sc.metadata->'achievement_focus') AS cat_focus
                 WHERE lower(cat_focus) LIKE '%' || user_kw || '%'
               ))
            )
          ELSE 0
        END
      
      -- Program boost (5% for Technology Excellence)
      + CASE 
          WHEN sp.program_name = 'Stevie Awards for Technology Excellence' THEN program_boost_amount
          ELSE 0
        END
    ) AS similarity_score,
    sc.metadata
  FROM stevie_categories sc
  INNER JOIN category_embeddings ce ON ce.category_id = sc.id
  INNER JOIN stevie_programs sp ON sp.id = sc.program_id
  WHERE 
    -- ONLY filter by geography and gender (user preferences)
    -- Let semantic search handle nomination_subject and org_type matching
    
    -- Filter by geography
    (
      user_geography IS NULL 
      OR sc.metadata->'geographic_scope' @> to_jsonb(ARRAY[user_geography])
    )
    
    -- Filter by gender
    AND (
      -- If user opts out of women's programs, exclude them
      (user_gender = 'opt_out' AND sp.program_name != 'Stevie Awards for Women in Business')
      -- Otherwise, include all programs (or filter by gender requirement if specified)
      OR (COALESCE(user_gender, 'any') != 'opt_out' AND (
        user_gender IS NULL 
        OR sc.metadata->>'gender_requirement' IS NULL
        OR sc.metadata->>'gender_requirement' = 'any'
        OR sc.metadata->>'gender_requirement' = user_gender
      ))
    )
    
  ORDER BY similarity_score DESC
  LIMIT match_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION search_similar_categories TO authenticated, anon;

-- Add comment explaining the change
COMMENT ON FUNCTION search_similar_categories IS 
'Pure semantic search with hybrid scoring. Only filters by geography and gender (user preferences). 
Nomination subject and org type matching is handled by semantic similarity and contextual embeddings.';
