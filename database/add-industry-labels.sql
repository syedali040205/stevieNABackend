-- Add industry_label column to stevie_categories table
-- This allows proper differentiation of duplicate category names without hardcoding

-- Step 1: Add the column
ALTER TABLE stevie_categories 
ADD COLUMN IF NOT EXISTS industry_label TEXT;

-- Step 2: Add index for performance
CREATE INDEX IF NOT EXISTS idx_categories_industry_label 
ON stevie_categories(industry_label);

-- Step 3: Update the 10 "Technology Breakthrough of the Year" categories with industry labels
-- These are identified by their unique descriptions

-- Manufacturing
UPDATE stevie_categories 
SET industry_label = 'Manufacturing'
WHERE category_name = 'Technology Breakthrough of the Year'
AND description ILIKE '%robotics%3d printing%iot manufacturing%';

-- Healthcare
UPDATE stevie_categories 
SET industry_label = 'Healthcare'
WHERE category_name = 'Technology Breakthrough of the Year'
AND description ILIKE '%mri%telemedicine%diagnostics%';

-- Marketing
UPDATE stevie_categories 
SET industry_label = 'Marketing'
WHERE category_name = 'Technology Breakthrough of the Year'
AND description ILIKE '%programmatic advertising%marketing automation%';

-- Aerospace
UPDATE stevie_categories 
SET industry_label = 'Aerospace'
WHERE category_name = 'Technology Breakthrough of the Year'
AND description ILIKE '%propulsion systems%satellite technology%';

-- AI & Machine Learning
UPDATE stevie_categories 
SET industry_label = 'AI & Machine Learning'
WHERE category_name = 'Technology Breakthrough of the Year'
AND description ILIKE '%computer vision%natural language processing%generative ai%';

-- Biotechnology
UPDATE stevie_categories 
SET industry_label = 'Biotechnology'
WHERE category_name = 'Technology Breakthrough of the Year'
AND description ILIKE '%genetic engineering%bioinformatics%crispr%';

-- Communications
UPDATE stevie_categories 
SET industry_label = 'Communications'
WHERE category_name = 'Technology Breakthrough of the Year'
AND description ILIKE '%web browsers%fiber optics%5g networks%';

-- Financial Services
UPDATE stevie_categories 
SET industry_label = 'Financial Services'
WHERE category_name = 'Technology Breakthrough of the Year'
AND description ILIKE '%blockchains%mobile wallets%digital payments%';

-- Government
UPDATE stevie_categories 
SET industry_label = 'Government'
WHERE category_name = 'Technology Breakthrough of the Year'
AND description ILIKE '%digital constituent%online tax filing%e-government%';

-- Consumer Technology
UPDATE stevie_categories 
SET industry_label = 'Consumer Technology'
WHERE category_name = 'Technology Breakthrough of the Year'
AND description ILIKE '%smartphones%e-commerce platforms%cloud computing%';

-- Step 4: Verify the updates
SELECT 
  category_name,
  industry_label,
  LEFT(description, 80) as description_preview,
  COUNT(*) OVER (PARTITION BY category_name) as duplicate_count
FROM stevie_categories
WHERE category_name = 'Technology Breakthrough of the Year'
ORDER BY industry_label;

-- Step 5: Check for any other duplicate category names that might need labels
SELECT 
  category_name,
  COUNT(*) as count,
  ARRAY_AGG(DISTINCT LEFT(description, 50)) as description_samples
FROM stevie_categories
GROUP BY category_name
HAVING COUNT(*) > 1
ORDER BY count DESC;
