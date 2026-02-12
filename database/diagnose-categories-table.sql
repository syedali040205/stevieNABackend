-- Diagnostic queries to understand the stevie_categories table structure and data

-- 1. Check table schema
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'stevie_categories'
ORDER BY ordinal_position;

-- 2. Check total count
SELECT COUNT(*) as total_categories FROM stevie_categories;

-- 3. Check nomination_subject_type values
SELECT 
    nomination_subject_type,
    COUNT(*) as count
FROM stevie_categories
GROUP BY nomination_subject_type
ORDER BY count DESC;

-- 4. Check geographic_scope values
SELECT 
    UNNEST(geographic_scope) as geography,
    COUNT(*) as count
FROM stevie_categories
GROUP BY geography
ORDER BY count DESC;

-- 5. Check program distribution
SELECT 
    program_name,
    program_code,
    COUNT(*) as count
FROM stevie_categories
GROUP BY program_name, program_code
ORDER BY count DESC;

-- 6. Sample categories for "individual" nominations
SELECT 
    category_id,
    category_name,
    program_name,
    nomination_subject_type,
    geographic_scope,
    achievement_focus
FROM stevie_categories
WHERE nomination_subject_type = 'individual'
LIMIT 10;

-- 7. Check if embedding column exists and its dimension
SELECT 
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name = 'stevie_categories' 
AND column_name = 'embedding';

-- 8. Check achievement_focus values
SELECT 
    UNNEST(achievement_focus) as focus_area,
    COUNT(*) as count
FROM stevie_categories
GROUP BY focus_area
ORDER BY count DESC
LIMIT 20;
