-- Diagnose the JOIN issue between category_embeddings and stevie_categories

-- 1. Check if category_ids in embeddings table exist in categories table
SELECT 
  COUNT(*) as embeddings_with_invalid_category_id
FROM category_embeddings ce
LEFT JOIN stevie_categories c ON ce.category_id = c.id
WHERE c.id IS NULL;

-- 2. Check if there are any matching IDs at all
SELECT 
  COUNT(*) as matching_ids
FROM category_embeddings ce
INNER JOIN stevie_categories c ON ce.category_id = c.id;

-- 3. Sample category_ids from both tables to compare format
SELECT 'embeddings' as source, category_id, pg_typeof(category_id) as type
FROM category_embeddings
LIMIT 3
UNION ALL
SELECT 'categories' as source, id as category_id, pg_typeof(id) as type
FROM stevie_categories
LIMIT 3;

-- 4. Check if program_id exists in stevie_programs
SELECT 
  COUNT(*) as categories_with_invalid_program_id
FROM stevie_categories c
LEFT JOIN stevie_programs p ON c.program_id = p.id
WHERE p.id IS NULL;
