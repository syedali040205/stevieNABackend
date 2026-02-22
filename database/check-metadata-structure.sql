-- Check current metadata structure in stevie_categories table

-- 1. Check if metadata column exists and its type
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'stevie_categories'
  AND column_name = 'metadata';

-- 2. Sample a few categories to see current metadata structure
SELECT 
  id,
  category_name,
  metadata
FROM stevie_categories
LIMIT 5;

-- 3. Check if any categories already have the new metadata fields
SELECT 
  COUNT(*) as total_categories,
  COUNT(CASE WHEN metadata ? 'category_types' THEN 1 END) as has_category_types,
  COUNT(CASE WHEN metadata ? 'primary_focus' THEN 1 END) as has_primary_focus,
  COUNT(CASE WHEN metadata ? 'requires_specific_geography' THEN 1 END) as has_requires_geography,
  COUNT(CASE WHEN metadata ? 'requires_specific_gender' THEN 1 END) as has_requires_gender,
  COUNT(CASE WHEN metadata ? 'applicable_nomination_subjects' THEN 1 END) as has_nomination_subjects
FROM stevie_categories;

-- 4. Show existing metadata keys across all categories
SELECT DISTINCT jsonb_object_keys(metadata) as metadata_key
FROM stevie_categories
WHERE metadata IS NOT NULL
ORDER BY metadata_key;
