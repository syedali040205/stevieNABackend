-- Migration 003: Chatbot Tables
-- Creates tables for chatbot knowledge base and conversation history

-- Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Table 1: general_embeddings
-- Unified table for all embeddings (KB articles, categories, etc.)
-- Uses content_type to filter different types of content
CREATE TABLE IF NOT EXISTS public.general_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL CHECK (content_type IN ('kb_article', 'category', 'nomination_content')),
  title TEXT,
  content TEXT NOT NULL,
  program TEXT DEFAULT 'general',
  category TEXT DEFAULT 'general',
  keywords TEXT[] DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  source_url TEXT,
  embedding VECTOR(1536) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for content_type filtering
CREATE INDEX IF NOT EXISTS idx_general_embeddings_content_type 
ON public.general_embeddings(content_type);

-- Index for program filtering
CREATE INDEX IF NOT EXISTS idx_general_embeddings_program 
ON public.general_embeddings(program);

-- Index for category filtering
CREATE INDEX IF NOT EXISTS idx_general_embeddings_category 
ON public.general_embeddings(category);

-- Index for vector similarity search with content_type filter
CREATE INDEX IF NOT EXISTS idx_general_embeddings_embedding 
ON public.general_embeddings 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- Index for metadata queries (e.g., filtering by program)
CREATE INDEX IF NOT EXISTS idx_general_embeddings_metadata 
ON public.general_embeddings 
USING gin (metadata);

-- Table 2: chatbot_messages
-- Stores conversation history for chatbot sessions
CREATE TABLE IF NOT EXISTS public.chatbot_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.user_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  sources JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for retrieving messages by session
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_session 
ON public.chatbot_messages(session_id, created_at);

-- Index for retrieving recent messages
CREATE INDEX IF NOT EXISTS idx_chatbot_messages_created_at 
ON public.chatbot_messages(created_at DESC);

-- Function: Search similar content with content_type filter
-- This is the main function for RAG retrieval
CREATE OR REPLACE FUNCTION search_similar_content(
  query_embedding VECTOR(1536),
  content_type_filter TEXT,
  match_limit INT DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.3
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  source_url TEXT,
  similarity_score FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ge.id,
    ge.content,
    ge.metadata,
    ge.source_url,
    1 - (ge.embedding <=> query_embedding) AS similarity_score
  FROM general_embeddings ge
  WHERE ge.content_type = content_type_filter
    AND (1 - (ge.embedding <=> query_embedding)) > match_threshold
  ORDER BY ge.embedding <=> query_embedding
  LIMIT match_limit;
END;
$$;

-- Function: Get conversation history for a session
CREATE OR REPLACE FUNCTION get_conversation_history(
  p_session_id UUID,
  message_limit INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  role TEXT,
  content TEXT,
  sources JSONB,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cm.id,
    cm.role,
    cm.content,
    cm.sources,
    cm.created_at
  FROM chatbot_messages cm
  WHERE cm.session_id = p_session_id
  ORDER BY cm.created_at DESC
  LIMIT message_limit;
END;
$$;

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_general_embeddings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Auto-update updated_at on general_embeddings
CREATE TRIGGER trigger_update_general_embeddings_updated_at
  BEFORE UPDATE ON public.general_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION update_general_embeddings_updated_at();

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.general_embeddings TO authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.chatbot_messages TO authenticated;

-- Comments for documentation
COMMENT ON TABLE public.general_embeddings IS 'Unified table for all embeddings (FAQ, categories, nomination content) with content_type filtering';
COMMENT ON TABLE public.chatbot_messages IS 'Stores conversation history for chatbot sessions';
COMMENT ON FUNCTION search_similar_content IS 'Performs semantic search with content_type filtering for RAG retrieval';
COMMENT ON FUNCTION get_conversation_history IS 'Retrieves conversation history for a chatbot session';

-- Migration complete
-- Next steps:
-- 1. Run this migration in Supabase SQL editor
-- 2. Ingest FAQ data into general_embeddings table
-- 3. Test semantic search with search_similar_content function
