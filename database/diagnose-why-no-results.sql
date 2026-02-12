-- Diagnostic queries to understand why search returns 0 results

-- 1. Check total categories with embeddings
SELECT COUNT(*) as total_categories_with_embeddings
FROM stevie_categories sc
INNER JOIN category_embeddings ce ON ce.category_id = sc.id;

-- 2. Check nomination_subject_type values
SELECT 
    nomination_subject_type,
    COUNT(*) as count
FROM stevie_categories
GROUP BY nomination_subject_type
ORDER BY count DESC;

-- 3. Check geographic_scope values (JSONB)
SELECT 
    geographic_scope,
    COUNT(*) as count
FROM stevie_categories
GROUP BY geographic_scope
ORDER BY count DESC
LIMIT 10;

-- 4. Check if 'individual' exists
SELECT COUNT(*) as individual_count
FROM stevie_categories
WHERE nomination_subject_type = 'individual';

-- 5. Check if geography filter works
SELECT COUNT(*) as apac_count
FROM stevie_categories
WHERE geographic_scope @> to_jsonb('asia_pacific_middle_east_north_africa'::text);

-- 6. Check combined filter
SELECT COUNT(*) as combined_count
FROM stevie_categories sc
INNER JOIN category_embeddings ce ON ce.category_id = sc.id
WHERE nomination_subject_type = 'individual'
AND geographic_scope @> to_jsonb('asia_pacific_middle_east_north_africa'::text);

-- 7. Sample categories to see actual data
SELECT 
    category_name,
    nomination_subject_type,
    geographic_scope,
    achievement_focus
FROM stevie_categories
LIMIT 5;

-- 8. Test the function directly
SELECT * FROM search_similar_categories(
  (SELECT embedding FROM category_embeddings LIMIT 1),
  'asia_pacific_middle_east_north_africa',
  'individual',
  5
);
