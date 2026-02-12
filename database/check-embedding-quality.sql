-- Check what text was used to generate embeddings

SELECT 
    ce.embedding_text,
    sc.category_name,
    sc.description,
    sc.achievement_focus
FROM category_embeddings ce
INNER JOIN stevie_categories sc ON sc.id = ce.category_id
LIMIT 10;

-- Check if embedding_text is just the category name or includes description
SELECT 
    LENGTH(ce.embedding_text) as text_length,
    ce.embedding_text LIKE '%' || sc.category_name || '%' as includes_name,
    ce.embedding_text LIKE '%' || sc.description || '%' as includes_description,
    ce.embedding_text,
    sc.category_name
FROM category_embeddings ce
INNER JOIN stevie_categories sc ON sc.id = ce.category_id
LIMIT 5;
