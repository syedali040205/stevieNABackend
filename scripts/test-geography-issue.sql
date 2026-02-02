-- Test 1: Search WITHOUT geography filter (should return 10 results)
SELECT 
  category_id,
  category_name,
  similarity_score,
  geographic_scope
FROM search_similar_categories(
  (SELECT embedding FROM category_embeddings LIMIT 1),
  NULL,  -- No geography filter
  10
);

-- Test 2: Search WITH 'worldwide' geography (should return many results)
SELECT 
  category_id,
  category_name,
  similarity_score,
  geographic_scope
FROM search_similar_categories(
  (SELECT embedding FROM category_embeddings LIMIT 1),
  'worldwide',  -- Worldwide geography
  10
);

-- Test 3: Search WITH 'asia_pacific_middle_east_north_africa' (this is what's failing)
SELECT 
  category_id,
  category_name,
  similarity_score,
  geographic_scope
FROM search_similar_categories(
  (SELECT embedding FROM category_embeddings LIMIT 1),
  'asia_pacific_middle_east_north_africa',
  10
);

-- Test 4: Check what geography values actually exist in the database
SELECT DISTINCT jsonb_array_elements_text(geographic_scope) as geography_value
FROM stevie_categories
ORDER BY geography_value;

-- Test 5: Check how many categories match 'asia_pacific_middle_east_north_africa'
SELECT COUNT(*) as matching_categories
FROM stevie_categories
WHERE geographic_scope @> to_jsonb(ARRAY['asia_pacific_middle_east_north_africa']);

-- Test 6: Check how many categories match 'worldwide'
SELECT COUNT(*) as worldwide_categories
FROM stevie_categories
WHERE geographic_scope @> to_jsonb(ARRAY['worldwide']);
