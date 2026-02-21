-- Simple query to list all current indexes on Stevie tables

SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (tablename LIKE 'stevie_%' OR tablename LIKE 'category_%')
ORDER BY tablename, indexname;
