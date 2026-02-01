-- Migration: Create search_similar_content function for KB chatbot
-- This function performs semantic similarity search on knowledge base articles

-- Drop function if exists
DROP FUNCTION IF EXISTS search_similar_content(vector(1536), text, integer, float);

-- Create the search function
CREATE OR REPLACE FUNCTION search_similar_content(
  query_embedding vector(1536),
  content_type_filter text DEFAULT NULL,
  match_limit integer DEFAULT 5,
  match_threshold float DEFAULT 0.5
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  content_type text,
  program text,
  category text,
  keywords text[],
  metadata jsonb,
  similarity_score float,
  created_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ge.id,
    ge.title,
    ge.content,
    ge.content_type,
    ge.program,
    ge.category,
    ge.keywords,
    ge.metadata,
    1 - (ge.embedding <=> query_embedding) as similarity_score,
    ge.created_at
  FROM general_embeddings ge
  WHERE 
    -- Filter by content type if provided
    (content_type_filter IS NULL OR ge.content_type = content_type_filter)
    -- Filter by similarity threshold
    AND (1 - (ge.embedding <=> query_embedding)) >= match_threshold
  ORDER BY ge.embedding <=> query_embedding
  LIMIT match_limit;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION search_similar_content TO authenticated;
GRANT EXECUTE ON FUNCTION search_similar_content TO anon;
GRANT EXECUTE ON FUNCTION search_similar_content TO service_role;

-- Test the function (optional - comment out if you want)
-- SELECT * FROM search_similar_content(
--   (SELECT embedding FROM general_embeddings LIMIT 1),
--   'kb_article',
--   5,
--   0.5
-- );
