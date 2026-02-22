/**
 * Script to clear embeddings for social impact categories so they can be re-enriched
 * with the enhanced contextual prefix that emphasizes humanitarian/community aspects.
 * 
 * Usage:
 *   npx tsx --env-file=.env scripts/clear-social-impact-embeddings.ts
 */

import 'dotenv/config';
import { getSupabaseClient } from '../src/config/supabase';

async function clearSocialImpactEmbeddings() {
  const supabase = getSupabaseClient();

  console.log('🚀 Clearing social impact category embeddings for re-enrichment...\n');

  // Step 1: Fetch all categories
  console.log('📥 Fetching categories from database...');
  
  let allCategories: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('stevie_categories')
      .select('id, category_name, description, achievement_focus')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('❌ Failed to fetch categories:', error.message);
      process.exit(1);
    }

    if (data && data.length > 0) {
      allCategories = allCategories.concat(data);
      console.log(`  Fetched page ${page + 1}: ${data.length} categories`);
      page++;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  console.log(`✅ Found ${allCategories.length} total categories\n`);

  // Step 2: Identify social impact categories
  const socialImpactKeywords = [
    'social', 'humanitarian', 'community', 'charitable', 'responsibility', 
    'healthcare', 'nonprofit', 'non-profit', 'cause', 'impact', 'csr', 
    'engagement', 'disadvantaged', 'refugee', 'activist', 'entrepreneur',
    'health', 'medical', 'hospital', 'clinic', 'patient', 'care'
  ];

  const socialImpactCategories = allCategories.filter(cat => {
    const text = `${cat.category_name} ${cat.description} ${cat.achievement_focus?.join(' ') || ''}`.toLowerCase();
    return socialImpactKeywords.some(keyword => text.includes(keyword));
  });

  console.log(`🔍 Found ${socialImpactCategories.length} social impact categories:\n`);
  
  // Display first 10 for confirmation
  socialImpactCategories.slice(0, 10).forEach(cat => {
    console.log(`  • ${cat.category_name}`);
  });
  
  if (socialImpactCategories.length > 10) {
    console.log(`  ... and ${socialImpactCategories.length - 10} more\n`);
  }

  // Step 3: Clear embeddings for these categories
  console.log('\n🗑️  Clearing embeddings for social impact categories...');
  
  const categoryIds = socialImpactCategories.map(cat => cat.id);
  
  const { error: deleteError } = await supabase
    .from('category_embeddings')
    .delete()
    .in('category_id', categoryIds);

  if (deleteError) {
    console.error('❌ Failed to clear embeddings:', deleteError.message);
    process.exit(1);
  }

  console.log(`✅ Cleared embeddings for ${socialImpactCategories.length} categories\n`);
  console.log('📝 Next step: Run enrich-category-embeddings.ts to regenerate with enhanced prompts');
  
  process.exit(0);
}

clearSocialImpactEmbeddings().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
