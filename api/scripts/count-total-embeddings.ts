import 'dotenv/config';
import { getSupabaseClient } from '../src/config/supabase';

/**
 * Count total categories vs total embeddings
 */

async function countTotalEmbeddings() {
  const supabase = getSupabaseClient();
  
  console.log('🔍 Counting categories and embeddings\n');
  
  // Count total categories
  const { count: catCount, error: catError } = await supabase
    .from('stevie_categories')
    .select('*', { count: 'exact', head: true });
  
  if (catError) {
    console.error('Error counting categories:', catError);
    return;
  }
  
  // Count total embeddings
  const { count: embCount, error: embError } = await supabase
    .from('category_embeddings')
    .select('*', { count: 'exact', head: true });
  
  if (embError) {
    console.error('Error counting embeddings:', embError);
    return;
  }
  
  console.log(`Total categories: ${catCount}`);
  console.log(`Total embeddings: ${embCount}`);
  console.log(`Missing embeddings: ${(catCount || 0) - (embCount || 0)}\n`);
  
  if (catCount === embCount) {
    console.log('✅ All categories have embeddings');
  } else {
    console.log('❌ Some categories are missing embeddings!');
    console.log('   This will cause them to be excluded from search results.');
  }
  
  process.exit(0);
}

countTotalEmbeddings().catch(console.error);
