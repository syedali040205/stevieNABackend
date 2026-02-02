-- Check if embeddings exist in the database

-- 1. Count total categories
SELECT COUNT(*) as total_categories FROM stevie_categories;

-- 2. Count total embeddings
SELECT COUNT(*) as total_embeddings FROM category_embeddings;

-- 3. Check if there are categories without embeddings
SELECT COUNT(*) as categories_without_embeddings
FROM stevie_categories c
LEFT JOIN category_embeddings ce ON c.id = ce.category_id
WHERE ce.category_id IS NULL;

-- 4. Sample some embeddings to verify they exist
SELECT 
  ce.category_id,
  c.category_name,
  vector_dims(ce.embedding) as embedding_dimension,
  LENGTH(ce.embedding_text) as text_length
FROM category_embeddings ce
JOIN stevie_categories c ON ce.category_id = c.id
LIMIT 5;

-- 5. Test the search function with a dummy embedding (all zeros)
-- This will tell us if the function works at all
SELECT 
  category_id,
  category_name,
  similarity_score,
  geographic_scope
FROM search_similar_categories(
  ARRAY(SELECT 0::float FROM generate_series(1, 1536))::vector(1536),
  NULL,  -- No geography filter
  5
);
