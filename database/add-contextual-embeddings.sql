-- Add contextual_prefix column to category_embeddings table
-- This stores the LLM-generated contextual prefix for each category

-- Add contextual_prefix column (nullable for backward compatibility)
ALTER TABLE category_embeddings
ADD COLUMN IF NOT EXISTS contextual_prefix TEXT;

-- Add updated_at column to track when embeddings were last refreshed
ALTER TABLE category_embeddings
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Create index on updated_at for monitoring
CREATE INDEX IF NOT EXISTS idx_category_embeddings_updated_at 
ON category_embeddings(updated_at);

-- Add comment explaining the contextual enrichment
COMMENT ON COLUMN category_embeddings.contextual_prefix IS 
'LLM-generated contextual prefix prepended to category text before embedding. Format: "This category is for [context]." Improves semantic search accuracy by 67% (Anthropic research).';

COMMENT ON COLUMN category_embeddings.updated_at IS 
'Timestamp when the embedding was last updated. Used to track embedding refresh cycles.';
