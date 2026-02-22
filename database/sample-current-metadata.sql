-- Check actual metadata values in stevie_categories table

-- Sample 10 categories to see what metadata looks like
SELECT 
  id,
  category_name,
  metadata
FROM stevie_categories
WHERE metadata IS NOT NULL
LIMIT 10;

-- Check if any categories already have the NEW fields we're about to add
SELECT 
  COUNT(*) as total_with_metadata,
  COUNT(CASE WHEN metadata ? 'category_types' THEN 1 END) as already_has_category_types,
  COUNT(CASE WHEN metadata ? 'primary_focus' THEN 1 END) as already_has_primary_focus,
  COUNT(CASE WHEN metadata ? 'applicable_nomination_subjects' THEN 1 END) as already_has_nomination_subjects
FROM stevie_categories
WHERE metadata IS NOT NULL;

-- Show one full example of current metadata structure
SELECT 
  category_name,
  jsonb_pretty(metadata) as formatted_metadata
FROM stevie_categories
WHERE metadata IS NOT NULL
LIMIT 1;
