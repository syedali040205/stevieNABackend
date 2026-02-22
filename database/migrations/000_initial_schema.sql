-- Complete Database Schema Migration for Amazon RDS
-- Date: 2026-02-21
-- Description: Full schema including tables, indexes, and functions for Stevie Awards recommendation system
-- Prerequisites: PostgreSQL 15+ with pgvector extension

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- TABLES
-- ============================================================================

-- Stevie Programs Table
CREATE TABLE IF NOT EXISTS stevie_programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_name TEXT NOT NULL UNIQUE,
  program_code TEXT NOT NULL UNIQUE,
  description TEXT,
  website_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Stevie Categories Table
CREATE TABLE IF NOT EXISTS stevie_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES stevie_programs(id) ON DELETE CASCADE,
  category_name TEXT NOT NULL,
  description TEXT,
  eligibility_criteria TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(program_id, category_name)
);

-- Category Embeddings Table (for RAG)
CREATE TABLE IF NOT EXISTS category_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID NOT NULL REFERENCES stevie_categories(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,
  embedding_text TEXT NOT NULL,
  contextual_prefix TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(category_id)
);

-- User Profiles Table
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE,
  email TEXT,
  organization_name TEXT,
  job_title TEXT,
  org_type TEXT,
  org_size TEXT,
  geography TEXT,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat Sessions Table
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  session_data JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Recommendations History Table
CREATE TABLE IF NOT EXISTS recommendations_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  category_id UUID NOT NULL REFERENCES stevie_categories(id) ON DELETE CASCADE,
  similarity_score FLOAT,
  user_context JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Category Embeddings Indexes
CREATE INDEX IF NOT EXISTS idx_category_embeddings_category_id 
  ON category_embeddings(category_id);

CREATE INDEX IF NOT EXISTS idx_category_embeddings_vector 
  ON category_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Stevie Categories Indexes
CREATE INDEX IF NOT EXISTS idx_stevie_categories_program_id 
  ON stevie_categories(program_id);

CREATE INDEX IF NOT EXISTS idx_stevie_categories_is_active 
  ON stevie_categories(is_active);

-- Metadata JSONB Indexes (GIN for fast JSONB queries)
CREATE INDEX IF NOT EXISTS idx_stevie_categories_metadata_gin 
  ON stevie_categories USING gin(metadata);

CREATE INDEX IF NOT EXISTS idx_category_embeddings_metadata_gin 
  ON category_embeddings USING gin(metadata);

-- User Profiles Indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id 
  ON user_profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email 
  ON user_profiles(email);

-- Chat Sessions Indexes
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id 
  ON chat_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_status 
  ON chat_sessions(status);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_expires_at 
  ON chat_sessions(expires_at);

-- Recommendations History Indexes
CREATE INDEX IF NOT EXISTS idx_recommendations_history_user_id 
  ON recommendations_history(user_id);

CREATE INDEX IF NOT EXISTS idx_recommendations_history_session_id 
  ON recommendations_history(session_id);

CREATE INDEX IF NOT EXISTS idx_recommendations_history_category_id 
  ON recommendations_history(category_id);

CREATE INDEX IF NOT EXISTS idx_recommendations_history_created_at 
  ON recommendations_history(created_at DESC);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Hybrid Scoring Similarity Search Function
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
  keyword_boost_amount float := 0.15;
  focus_boost_amount float := 0.05;
  program_boost_amount float := 0.05;
BEGIN
  normalized_org_type := CASE 
    WHEN user_org_type IS NOT NULL THEN REPLACE(user_org_type, '-', '_')
    ELSE NULL
  END;
  
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
    LEAST(0.95,
      (1 - (ce.embedding <=> query_embedding))
      + CASE 
          WHEN user_focus_lower IS NOT NULL THEN
            (
              (SELECT COUNT(*) * 0.05 FROM unnest(user_focus_lower) AS keyword
               WHERE lower(sc.category_name) LIKE '%' || keyword || '%')
              +
              (SELECT COUNT(*) * 0.03 FROM unnest(user_focus_lower) AS keyword
               WHERE lower(sc.description) LIKE '%' || keyword || '%')
              +
              (SELECT COUNT(*) * 0.02 FROM unnest(user_focus_lower) AS keyword
               WHERE lower(ce.contextual_prefix) LIKE '%' || keyword || '%')
            )
          ELSE 0
        END
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
    (
      user_nomination_subject IS NULL 
      OR sc.metadata->>'nomination_subject_type' = user_nomination_subject
    )
    AND (
      user_geography IS NULL 
      OR sc.metadata->'geographic_scope' @> to_jsonb(ARRAY[user_geography])
    )
    AND (
      normalized_org_type IS NULL 
      OR sc.metadata->'applicable_org_types' @> to_jsonb(ARRAY[normalized_org_type])
    )
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

-- Updated At Trigger Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER update_stevie_programs_updated_at
  BEFORE UPDATE ON stevie_programs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stevie_categories_updated_at
  BEFORE UPDATE ON stevie_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_category_embeddings_updated_at
  BEFORE UPDATE ON category_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_sessions_updated_at
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Grant permissions (adjust based on your user roles)
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated, anon;
GRANT EXECUTE ON FUNCTION search_similar_categories TO authenticated, anon;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT 
  'Schema migration completed successfully' as status,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public') as table_count,
  (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public') as index_count;
