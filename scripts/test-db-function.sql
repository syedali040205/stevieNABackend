-- Test the search_similar_categories function directly
-- This will help us see if the function is working at all

-- Test 1: Check if category_embeddings table has data
SELECT COUNT(*) as embedding_count FROM category_embeddings;

-- Test 2: Check if stevie_categories table has data
SELECT COUNT(*) as category_count FROM stevie_categories;

-- Test 3: Check geographic_scope values
SELECT 
  category_name,
  geographic_scope,
  jsonb_typeof(geographic_scope) as scope_type
FROM stevie_categories 
LIMIT 5;

-- Test 4: Test the function with a sample embedding and 'worldwide'
SELECT 
  category_name,
  similarity_score,
  geographic_scope
FROM search_similar_categories(
  (SELECT embedding FROM category_embeddings LIMIT 1),
  'worldwide',
  5
);

-- Test 5: Test the function with NULL geography (should match all)
SELECT 
  category_name,
  similarity_score,
  geographic_scope
FROM search_similar_categories(
  (SELECT embedding FROM category_embeddings LIMIT 1),
  NULL,
  5
);

-- Test 6: Check if the JSONB containment works
SELECT 
  category_name,
  geographic_scope,
  geographic_scope @> to_jsonb(ARRAY['worldwide']) as has_worldwide,
  geographic_scope @> to_jsonb(ARRAY['usa']) as has_usa
FROM stevie_categories
LIMIT 10;
