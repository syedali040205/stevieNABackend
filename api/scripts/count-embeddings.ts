import 'dotenv/config';
import { getSupabaseClient } from '../src/config/supabase';

async function countEmbeddings() {
  const supabase = getSupabaseClient();
  
  const { count, error } = await supabase
    .from('category_embeddings')
    .select('*', { count: 'exact', head: true });
  
  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }
  
  console.log(`Total embeddings in database: ${count}`);
  
  const { data: categories } = await supabase
    .from('stevie_categories')
    .select('id', { count: 'exact', head: true });
  
  console.log(`Total categories in database: ${categories}`);
  
  process.exit(0);
}

countEmbeddings();
