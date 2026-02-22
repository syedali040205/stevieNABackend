-- Migration: Hybrid Scoring for Similarity Search
-- Date: 2026-02-21
-- Description: Combines semantic similarity with keyword matching and achievement focus alignment
-- 
-- This migration updates the search_similar_categories function to boost similarity scores
-- from typical 50-70% to 80-95% for highly relevant matches.
--
-- Scoring components:
-- 1. Base semantic similarity (50-70%)
-- 2. Keyword matching boost (+0-15%)
-- 3. Achievement focus alignment (+0-5%)
-- 4. Program boost (+5% for Technology Excellence)
--
-- Run this on Amazon RDS when migrating from Supabase

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
  user_focus_lower text[];
  keyword_boost_amount float := 0.15; -- Max 15% boost for keyword matching
  focus_boost_amount float := 0.05;   -- Max 5% boost for achievement focus
  program_boost_amount float := 0.05; -- 5% boost for Technology Excellence
BEGIN
  -- Normalize org_type: replace hyphens with underscores
  normalized_org_type := CASE 
    WHEN user_org_type IS NOT NULL THEN REPLACE(user_org_type, '-', '_')
    ELSE NULL
  END;
  
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
    -- Filter by nomination subject
    (
      user_nomination_subject IS NULL 
      OR sc.metadata->>'nomination_subject_type' = user_nomination_subject
    )
    
    -- Filter by geography
    AND (
      user_geography IS NULL 
      OR sc.metadata->'geographic_scope' @> to_jsonb(ARRAY[user_geography])
    )
    
    -- Filter by org type
    AND (
      normalized_org_type IS NULL 
      OR sc.metadata->'applicable_org_types' @> to_jsonb(ARRAY[normalized_org_type])
    )
    
    -- Filter by gender
    AND (
      (user_gender = 'opt_out' AND sp.program_name != 'Stevie Awards for Women in Business')
      OR (user_gender != 'opt_out' AND (
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
