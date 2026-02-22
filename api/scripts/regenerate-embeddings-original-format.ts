/**
 * Regenerate category embeddings using the ORIGINAL format (without contextual prefixes)
 * 
 * This fixes the mismatch between category embeddings (which have contextual prefixes)
 * and query embeddings (which don't have them), causing 0 results.
 * 
 * Original format:
 * "Focus areas: [focus]. [Category Name]. [Description]. Eligible for [org types]. Program: [Program Name]."
 * 
 * Usage:
 *   npx tsx scripts/regenerate-embeddings-original-format.ts
 */

import 'dotenv/config';
import { getSupabaseClient } from '../src/config/supabase';
import { embeddingManager } from '../src/services/embeddingManager';
import logger from '../src/utils/logger';

interface Category {
  id: string;
  category_name: string;
  description: string;
  program_name: string;
  program_code: string;
  metadata: {
    achievement_focus?: string[];
    applicable_org_types?: string[];
  };
}

async function regenerateEmbeddings() {
  const supabase = getSupabaseClient();

  console.log('🚀 Regenerating category embeddings with ORIGINAL format...\n');
  console.log('⚠️  This will overwrite existing contextual embeddings\n');

  // Fetch all categories
  console.log('📥 Fetching categories from database...');
  
  let allCategories: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('stevie_categories')
      .select(`
        *,
        stevie_programs!inner (
          program_name,
          program_code
        )
      `)
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error('❌ Failed to fetch categories:', error.message);
      process.exit(1);
    }

    if (data && data.length > 0) {
      const flattenedData = data.map((cat: any) => ({
        ...cat,
        program_name: cat.stevie_programs?.program_name || 'Unknown Program',
        program_code: cat.stevie_programs?.program_code || 'UNKNOWN',
      }));
      
      allCategories = allCategories.concat(flattenedData);
      console.log(`  Fetched page ${page + 1}: ${data.length} categories`);
      page++;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  const categories = allCategories;

  if (!categories || categories.length === 0) {
    console.log('⚠️  No categories found in database');
    process.exit(0);
  }

  console.log(`✅ Found ${categories.length} total categories\n`);

  // Process each category
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < categories.length; i++) {
    const category = categories[i] as Category;
    const progress = `[${i + 1}/${categories.length}]`;

    console.log(`${progress} Processing: ${category.category_name}`);

    try {
      // Use the original formatCategoryText method from embeddingManager
      const categoryFormatted = {
        category_id: category.id,
        category_name: category.category_name,
        description: category.description,
        program_name: category.program_name,
        applicable_org_types: category.metadata?.applicable_org_types || [],
        achievement_focus: category.metadata?.achievement_focus || [],
      };

      const categoryText = embeddingManager.formatCategoryText(categoryFormatted);
      console.log(`  ├─ Text: "${categoryText.substring(0, 100)}..."`);

      // Generate embedding
      console.log(`  ├─ Generating embedding...`);
      const embedding = await embeddingManager.generateEmbedding(categoryText);
      console.log(`  ├─ Embedding dimension: ${embedding.length}`);

      // Update database
      console.log(`  ├─ Updating database...`);
      const { error: updateError } = await supabase
        .from('category_embeddings')
        .upsert(
          {
            category_id: category.id,
            embedding: embedding,
            embedding_text: categoryText,
            contextual_prefix: null, // Clear contextual prefix
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'category_id',
            ignoreDuplicates: false,
          }
        );

      if (updateError) {
        throw new Error(`Database update failed: ${updateError.message}`);
      }

      console.log(`  └─ ✅ Success\n`);
      successCount++;

      // Rate limiting: wait 50ms between requests
      if (i < categories.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } catch (error: any) {
      console.log(`  └─ ❌ Failed: ${error.message}\n`);
      failureCount++;
      logger.error('category_regeneration_failed', {
        category_id: category.id,
        category_name: category.category_name,
        error: error.message,
      });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 REGENERATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total categories: ${categories.length}`);
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failureCount}`);
  console.log(`Success rate: ${Math.round((successCount / categories.length) * 100)}%`);
  console.log('='.repeat(60) + '\n');

  if (failureCount > 0) {
    console.log('⚠️  Some categories failed to regenerate. Check logs for details.');
    process.exit(1);
  }

  console.log('🎉 All embeddings regenerated successfully!');
  console.log('\n✅ Category embeddings now match query format');
  console.log('✅ Ready to test semantic search\n');
  process.exit(0);
}

// Run the script
regenerateEmbeddings().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
