-- Reference implementation for search_similar_categories (pgvector).
-- Run in Supabase SQL editor if you need to create or fix the function.
-- Adjust table/column names to match your schema (stevie_categories, stevie_programs, category_embeddings).

-- Ensure pgvector extension and vector type
-- CREATE EXTENSION IF NOT EXISTS vector;

-- Example: category_embeddings has (category_id, embedding vector(1536), embedding_text)
-- Categories table has geographic_scope, nomination_subject_type, etc.

-- Cosine similarity in pgvector: use <=> (cosine distance, 0=same, 2=opposite).
-- For NORMALIZED vectors, similarity_score = 1 - (embedding <=> query_embedding) gives 0..1 (1 = identical).
-- OpenAI embeddings are normalized, so use: 1 - (ce.embedding <=> query_embedding) AS similarity_score

CREATE OR REPLACE FUNCTION search_similar_categories(
  query_embedding vector(1536),
  user_geography text DEFAULT NULL,
  user_nomination_subject text DEFAULT NULL,
  match_limit int DEFAULT 10,
  match_threshold float DEFAULT 0.0
)
RETURNS TABLE (
  category_id uuid,
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
    c.id AS category_id,
    c.category_name,
    c.description,
    p.program_name,
    p.program_code,
    (1 - (ce.embedding <=> query_embedding))::float AS similarity_score,
    c.geographic_scope,
    c.applicable_org_types,
    c.applicable_org_sizes,
    c.nomination_subject_type,
    c.achievement_focus
  FROM category_embeddings ce
  JOIN stevie_categories c ON c.id = ce.category_id
  JOIN stevie_programs p ON p.id = c.program_id
  WHERE
    (match_threshold IS NULL OR (1 - (ce.embedding <=> query_embedding)) >= match_threshold)
    AND (user_geography IS NULL OR user_geography = '' OR user_geography = 'all' OR user_geography = ANY(c.geographic_scope))
    AND (user_nomination_subject IS NULL OR user_nomination_subject = '' OR user_nomination_subject = 'all' OR LOWER(c.nomination_subject_type) = LOWER(user_nomination_subject))
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_limit;
END;
$$;

-- Optional: index for fast similarity search (IVFFlat or HNSW).
-- CREATE INDEX IF NOT EXISTS category_embeddings_embedding_idx
--   ON category_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- Or for newer pgvector with HNSW (often better accuracy):
-- CREATE INDEX IF NOT EXISTS category_embeddings_embedding_idx
--   ON category_embeddings USING hnsw (embedding vector_cosine_ops);
