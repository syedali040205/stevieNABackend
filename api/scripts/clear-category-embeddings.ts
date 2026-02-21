/**
 * Script to clear all category embeddings
 * 
 * This script deletes all records from category_embeddings table
 * so you can re-run the enrichment script with fresh embeddings.
 * 
 * Usage:
 *   npx tsx --env-file=.env scripts/clear-category-embeddings.ts
 */

import 'dotenv/config';
import { getSupabaseClient } from '../src/config/supabase';

async function clearCategoryEmbeddings() {
  const supabase = getSupabaseClient();

  console.log('🗑️  Clearing category embeddings...\n');

  // Count existing embeddings
  const { count: beforeCount } = await supabase
    .from('category_embeddings')
    .select('*', { count: 'exact', head: true });

  console.log(`📊 Current embeddings: ${beforeCount || 0}`);

  if (!beforeCount || beforeCount === 0) {
    console.log('✅ No embeddings to clear\n');
    process.exit(0);
  }

  // Delete all embeddings
  console.log('🗑️  Deleting all embeddings...');
  const { error } = await supabase
    .from('category_embeddings')
    .delete()
    .neq('category_id', '00000000-0000-0000-0000-000000000000'); // Delete all (dummy condition)

  if (error) {
    console.error('❌ Failed to clear embeddings:', error.message);
    process.exit(1);
  }

  // Verify deletion
  const { count: afterCount } = await supabase
    .from('category_embeddings')
    .select('*', { count: 'exact', head: true });

  console.log(`✅ Deleted ${beforeCount} embeddings`);
  console.log(`📊 Remaining embeddings: ${afterCount || 0}\n`);

  if (afterCount === 0) {
    console.log('🎉 All category embeddings cleared successfully!');
    console.log('\nNext step: Run enrichment script');
    console.log('  npx tsx --env-file=.env scripts/enrich-category-embeddings.ts\n');
  } else {
    console.log('⚠️  Some embeddings remain. Check database permissions.\n');
    process.exit(1);
  }

  process.exit(0);
}

// Run the script
clearCategoryEmbeddings().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
