-- Check what geography values actually exist in the database
-- This will help us understand why the filter isn't matching

-- 1. Check distinct geography values in stevie_categories
SELECT DISTINCT jsonb_array_elements_text(geographic_scope) as geography_value
FROM stevie_categories
ORDER BY geography_value;

-- 2. Check how many categories have each geography
SELECT 
  jsonb_array_elements_text(geographic_scope) as geography_value,
  COUNT(*) as category_count
FROM stevie_categories
GROUP BY geography_value
ORDER BY category_count DESC;

-- 3. Check if 'asia_pacific_middle_east_north_africa' exists
SELECT COUNT(*) as matching_categories
FROM stevie_categories
WHERE geographic_scope @> to_jsonb(ARRAY['asia_pacific_middle_east_north_africa']);

-- 4. Check if 'worldwide' exists
SELECT COUNT(*) as worldwide_categories
FROM stevie_categories
WHERE geographic_scope @> to_jsonb(ARRAY['worldwide']);

-- 5. Sample a few categories to see their geography values
SELECT 
  category_name,
  geographic_scope,
  jsonb_array_length(geographic_scope) as scope_count
FROM stevie_categories
LIMIT 10;
