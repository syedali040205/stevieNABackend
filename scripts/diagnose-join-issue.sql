-- Diagnose why the JOIN is failing

-- 1. Check if category_embeddings has valid category_id references
SELECT 
  COUNT(*) as total_embeddings,
  COUNT(DISTINCT category_id) as unique_categories
FROM category_embeddings;

-- 2. Check if those category_ids exist in stevie_categories
SELECT 
  COUNT(*) as embeddings_with_valid_category
FROM category_embeddings ce
WHERE EXISTS (
  SELECT 1 FROM stevie_categories c WHERE c.id = ce.category_id
);

-- 3. Check if stevie_categories has valid program_id references
SELECT 
  COUNT(*) as categories_with_valid_program
FROM stevie_categories c
WHERE EXISTS (
  SELECT 1 FROM stevie_programs p WHERE p.id = c.program_id
);

-- 4. Test the JOIN manually (without the function)
SELECT 
  c.id as category_id,
  c.category_name,
  p.program_name,
  c.geographic_scope
FROM category_embeddings ce
JOIN stevie_categories c ON ce.category_id = c.id
JOIN stevie_programs p ON c.program_id = p.id
LIMIT 5;

-- 5. Check if the function exists and has correct signature
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as return_type
FROM pg_proc
WHERE proname = 'search_similar_categories';
