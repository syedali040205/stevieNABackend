-- COMPREHENSIVE FIX: Apply program boosting for better recommendations
-- Run this in your Supabase SQL editor

-- ============================================================================
-- STEP 1: Apply program-based boosting
-- ============================================================================

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
    -- Boost Technology Excellence and IBA programs for product nominations
    CASE 
      WHEN sp.program_name = 'Stevie Awards for Technology Excellence' THEN 
        (1 - (ce.embedding <=> query_embedding)) * 1.5
      WHEN sp.program_name = 'International Business Awards' THEN 
        (1 - (ce.embedding <=> query_embedding)) * 1.2
      WHEN sp.program_name = 'American Business Awards' THEN 
        (1 - (ce.embedding <=> query_embedding)) * 1.2
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
    -- Filter by geography if provided
    (user_geography IS NULL OR sc.geographic_scope @> to_jsonb(ARRAY[user_geography]))
    -- Filter by nomination subject if provided
    AND (user_nomination_subject IS NULL OR sc.nomination_subject_type = user_nomination_subject)
  ORDER BY similarity_score DESC
  LIMIT match_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION search_similar_categories TO authenticated, anon;

-- ============================================================================
-- STEP 2: Verify the function was created successfully
-- ============================================================================

SELECT 'Function search_similar_categories created successfully!' as status;

-- ============================================================================
-- STEP 3: Check embedding quality for Technology Excellence categories
-- ============================================================================

SELECT 
    '=== TECHNOLOGY EXCELLENCE EMBEDDING QUALITY ===' as section,
    sc.category_name,
    sc.description as category_description,
    ce.embedding_text,
    LENGTH(ce.embedding_text) as text_length,
    CASE 
        WHEN sc.description IS NULL OR sc.description = '' THEN 'MISSING DESCRIPTION'
        WHEN LENGTH(sc.description) < 50 THEN 'DESCRIPTION TOO SHORT'
        ELSE 'OK'
    END as quality_status
FROM stevie_categories sc
INNER JOIN stevie_programs sp ON sp.id = sc.program_id
INNER JOIN category_embeddings ce ON ce.category_id = sc.id
WHERE 
    sp.program_name = 'Stevie Awards for Technology Excellence'
    AND sc.nomination_subject_type = 'product'
ORDER BY sc.category_name
LIMIT 20;

-- ============================================================================
-- STEP 4: Show what programs are available
-- ============================================================================

SELECT 
    '=== AVAILABLE PROGRAMS ===' as section,
    sp.program_name,
    sp.program_code,
    COUNT(sc.id) as category_count,
    COUNT(CASE WHEN sc.nomination_subject_type = 'product' THEN 1 END) as product_categories
FROM stevie_programs sp
LEFT JOIN stevie_categories sc ON sc.program_id = sp.id
GROUP BY sp.id, sp.program_name, sp.program_code
ORDER BY sp.program_name;

-- ============================================================================
-- NOTES
-- ============================================================================

/*
APPROACH:
We compensate for generic source descriptions through:

1. PROGRAM-BASED BOOSTING (applied above)
   - Technology Excellence: 1.5x score boost
   - International Business Awards: 1.2x boost
   - American Business Awards: 1.2x boost
   
   This prioritizes relevant programs even with weak embeddings.

2. ENHANCED SEARCH QUERY GENERATION (in embeddingManager.ts)
   - Creates rich, detailed queries from user context
   - Emphasizes specific technologies and features
   - Compensates for generic category descriptions
   
3. MULTI-PROGRAM DISCOVERY
   - Searches all programs simultaneously
   - Boosting naturally prioritizes relevant ones
   - User discovers categories across programs

WHY NOT MODIFY SOURCE DATA:
- Maintains data integrity
- Preserves original category definitions
- Avoids data governance issues
- Keeps embeddings reproducible

The boosting effectively makes Technology Excellence categories rank 50% higher,
compensating for their generic descriptions without modifying source data.
*/
