import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from api/.env
dotenv.config({ path: path.join(__dirname, '../api/.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

console.log('Connecting to Supabase...');
console.log('URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function fixGeographyFilter() {
  console.log('\n🔧 Fixing geography filter in search_similar_categories function...\n');

  const sql = `
DROP FUNCTION IF EXISTS search_similar_categories(vector(1536), text, integer);

CREATE OR REPLACE FUNCTION search_similar_categories(
  query_embedding vector(1536),
  user_geography text DEFAULT NULL,
  match_limit integer DEFAULT 10
)
RETURNS TABLE (
  category_id uuid,
  similarity_score float,
  category_name text,
  description text,
  program_name text,
  program_code text,
  geographic_scope text[],
  applicable_org_types text[],
  applicable_org_sizes text[],
  nomination_subject_type text,
  achievement_focus text[]
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id as category_id,
    1 - (ce.embedding <=> query_embedding) as similarity_score,
    c.category_name,
    c.description,
    p.program_name,
    p.program_code,
    c.geographic_scope,
    c.applicable_org_types,
    c.applicable_org_sizes,
    c.nomination_subject_type,
    c.achievement_focus
  FROM category_embeddings ce
  JOIN stevie_categories c ON ce.category_id = c.id
  JOIN stevie_programs p ON c.program_id = p.id
  WHERE 
    (user_geography IS NULL 
     OR user_geography = 'worldwide' 
     OR user_geography = ANY(c.geographic_scope) 
     OR 'worldwide' = ANY(c.geographic_scope))
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION search_similar_categories TO authenticated;
GRANT EXECUTE ON FUNCTION search_similar_categories TO anon;
GRANT EXECUTE ON FUNCTION search_similar_categories TO service_role;
`;

  try {
    // Execute SQL using Supabase client
    const { data, error } = await supabase.rpc('exec_sql' as any, { sql });
    
    if (error) {
      throw error;
    }
    
    console.log('✅ Geography filter fixed successfully!\n');
    console.log('The function now correctly handles "worldwide" geography:');
    console.log('  - NULL or "worldwide" → matches ALL categories');
    console.log('  - Specific geography → matches that geography OR worldwide categories\n');
    
  } catch (error: any) {
    console.error('❌ Direct execution failed:', error.message);
    console.log('\n📋 Please run this SQL manually in Supabase SQL Editor:\n');
    console.log('-----------------------------------------------------------');
    console.log(sql);
    console.log('-----------------------------------------------------------\n');
  }
}

fixGeographyFilter().catch(console.error);
