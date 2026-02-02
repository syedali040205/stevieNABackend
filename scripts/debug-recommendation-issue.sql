-- Debug: Why are recommendations returning 0 results?
-- Run these queries in order to diagnose the issue

-- Step 1: Check if we have embeddings
SELECT 
  'category_embeddings' as table_name,
  COUNT(*) as row_count
FROM category_embeddings
UNION ALL
SELECT 
  'stevie_categories' as table_name,
  COUNT(*) as row_count
FROM stevie_categories;

-- Step 2: Check geographic_scope format in database
-- This is CRITICAL - we need to see the actual format
SELECT 
  category_name,
  geographic_scope,
  jsonb_typeof(geographic_scope) as type,
  jsonb_array_length(geographic_scope) as array_length
FROM stevie_categories 
LIMIT 10;

-- Step 3: Test JSONB containment with different formats
-- The data might be stored as ["USA"] or ["usa"] or something else
SELECT 
  category_name,
  geographic_scope,
  -- Test different case variations
  geographic_scope @> to_jsonb(ARRAY['worldwide']) as test_worldwide_lower,
  geographic_scope @> to_jsonb(ARRAY['Worldwide']) as test_worldwide_title,
  geographic_scope @> to_jsonb(ARRAY['WORLDWIDE']) as test_worldwide_upper,
  geographic_scope @> '["worldwide"]'::jsonb as test_worldwide_direct,
  -- Test if it contains any value at all
  jsonb_array_length(geographic_scope) > 0 as has_any_scope
FROM stevie_categories 
LIMIT 10;

-- Step 4: Test the function with a real embedding
-- This simulates what happens when user submits
SELECT 
  category_name,
  similarity_score,
  geographic_scope
FROM search_similar_categories(
  (SELECT embedding FROM category_embeddings ORDER BY RANDOM() LIMIT 1),
  'worldwide',
  10
);

-- Step 5: Test without geography filter (should return results)
SELECT 
  category_name,
  similarity_score,
  geographic_scope
FROM search_similar_categories(
  (SELECT embedding FROM category_embeddings ORDER BY RANDOM() LIMIT 1),
  NULL,
  10
);

-- Step 6: Check what values are actually in geographic_scope
SELECT DISTINCT 
  jsonb_array_elements_text(geographic_scope) as geography_value,
  COUNT(*) as category_count
FROM stevie_categories
GROUP BY geography_value
ORDER BY category_count DESC;
