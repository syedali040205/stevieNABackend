/**
 * Script to enrich category embeddings with contextual prefixes (Anthropic technique)
 * 
 * This script:
 * 1. Fetches all categories from the database
 * 2. Generates contextual prefix for each category using LLM
 * 3. Re-embeds categories with enriched text
 * 4. Updates category_embeddings table with new embeddings
 * 
 * Expected improvement: 67% reduction in retrieval failures (Anthropic benchmark)
 * 
 * Usage:
 *   npx tsx --env-file=.env scripts/enrich-category-embeddings.ts
 */

import 'dotenv/config';
import { getSupabaseClient } from '../src/config/supabase';
import { openaiService } from '../src/services/openaiService';
import { embeddingManager } from '../src/services/embeddingManager';
import logger from '../src/utils/logger';

interface Category {
  id: string;
  category_name: string;
  description: string;
  program_name: string;
  program_code: string;
  geographic_scope: string[];
  applicable_org_types: string[];
  applicable_org_sizes: string[];
  nomination_subject_type: string;
  achievement_focus: string[];
}

/**
 * Generate contextual prefix for a category using LLM.
 * Format: "This category is for [context]. [original description]"
 */
async function generateContextualPrefix(category: Category): Promise<string> {
  const systemPrompt = `You are an expert at the Stevie Awards. Given a category's metadata, generate a brief contextual prefix (1-2 sentences) that will help with semantic search.

Rules:
- Start with "This category is for" or "This award recognizes"
- Include: program name, focus areas, eligible organization types, nomination subject type
- Be concise: 20-40 words maximum
- Use formal award language
- Output ONLY the prefix, no markdown, no labels

Example:
Category: Best New Product - Technology
Program: American Business Awards
Focus: Innovation, Technology
Org Types: for-profit, non-profit
Subject: product

Output: "This category is for innovative technology products from the American Business Awards program. Eligible for both for-profit and non-profit organizations nominating a product."`;

  const userPrompt = `Generate contextual prefix for:
Category: ${category.category_name}
Program: ${category.program_name}
Focus: ${category.achievement_focus.join(', ')}
Org Types: ${category.applicable_org_types.join(', ')}
Subject: ${category.nomination_subject_type}`;

  try {
    const prefix = await openaiService.chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      model: 'gpt-4o-mini',
      maxTokens: 100,
      temperature: 0.3,
    });

    return (prefix || '').trim();
  } catch (error: any) {
    logger.error('contextual_prefix_generation_failed', {
      category_id: category.id,
      error: error.message,
    });
    // Fallback to template-based prefix
    return `This category is for ${category.achievement_focus.join(', ').toLowerCase()} achievements from the ${category.program_name} program. Eligible for ${category.applicable_org_types.join(', ')} organizations nominating a ${category.nomination_subject_type}.`;
  }
}

/**
 * Format category with contextual prefix for embedding.
 */
function formatEnrichedCategoryText(category: Category, contextualPrefix: string): string {
  const parts: string[] = [];

  // Contextual prefix first
  parts.push(contextualPrefix);

  // Focus areas
  if (category.achievement_focus && category.achievement_focus.length > 0) {
    const focusAreas = category.achievement_focus.join(', ');
    parts.push(`Focus areas: ${focusAreas}.`);
  }

  // Category name and description
  parts.push(`${category.category_name}. ${category.description}.`);

  // Eligible organization types
  if (category.applicable_org_types && category.applicable_org_types.length > 0) {
    const orgTypes = category.applicable_org_types.join(', ');
    parts.push(`Eligible for ${orgTypes}.`);
  }

  // Program name
  parts.push(`Program: ${category.program_name}.`);

  return parts.join(' ');
}

async function enrichCategoryEmbeddings() {
  const supabase = getSupabaseClient();

  console.log('🚀 Starting category embedding enrichment...\n');

  // Step 1: Fetch all categories (no limit - get all records)
  console.log('📥 Fetching categories from database...');
  
  // Fetch all categories - Supabase has a default limit of 1000, so we need to paginate
  let allCategories: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('stevie_categories')
      .select('*')
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

  const categories = allCategories;


  if (!categories || categories.length === 0) {
    console.log('⚠️  No categories found in database');
    process.exit(0);
  }

  console.log(`✅ Found ${categories.length} total categories\n`);

  // Step 1.5: Check which categories already have contextual prefixes
  console.log('🔍 Checking for existing enrichments...');
  const { data: existingEmbeddings } = await supabase
    .from('category_embeddings')
    .select('category_id, contextual_prefix')
    .not('contextual_prefix', 'is', null);

  const enrichedIds = new Set(
    (existingEmbeddings || []).map((e: any) => e.category_id)
  );

  const categoriesToProcess = categories.filter(
    (cat: any) => !enrichedIds.has(cat.id)
  );

  console.log(`✅ Already enriched: ${enrichedIds.size}`);
  console.log(`📝 To process: ${categoriesToProcess.length}\n`);

  if (categoriesToProcess.length === 0) {
    console.log('🎉 All categories already enriched!');
    process.exit(0);
  }

  // Step 2: Process each category
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < categoriesToProcess.length; i++) {
    const category = categoriesToProcess[i] as Category;
    const progress = `[${i + 1}/${categoriesToProcess.length}]`;

    console.log(`${progress} Processing: ${category.category_name}`);

    try {
      // Generate contextual prefix
      console.log(`  ├─ Generating contextual prefix...`);
      const contextualPrefix = await generateContextualPrefix(category);
      console.log(`  ├─ Prefix: "${contextualPrefix.substring(0, 80)}..."`);

      // Format enriched text
      const enrichedText = formatEnrichedCategoryText(category, contextualPrefix);
      console.log(`  ├─ Enriched text length: ${enrichedText.length} chars`);

      // Generate embedding
      console.log(`  ├─ Generating embedding...`);
      const embedding = await embeddingManager.generateEmbedding(enrichedText);
      console.log(`  ├─ Embedding dimension: ${embedding.length}`);

      // Update database - use upsert with onConflict to handle existing records
      console.log(`  ├─ Updating database...`);
      const { error: updateError } = await supabase
        .from('category_embeddings')
        .upsert(
          {
            category_id: category.id,
            embedding: embedding,
            embedding_text: enrichedText,
            contextual_prefix: contextualPrefix,
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

      // Rate limiting: wait 100ms between requests to avoid hitting OpenAI rate limits
      if (i < categoriesToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error: any) {
      console.log(`  └─ ❌ Failed: ${error.message}\n`);
      failureCount++;
      logger.error('category_enrichment_failed', {
        category_id: category.id,
        category_name: category.category_name,
        error: error.message,
      });
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 ENRICHMENT SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total categories: ${categories.length}`);
  console.log(`Already enriched: ${enrichedIds.size}`);
  console.log(`Processed: ${categoriesToProcess.length}`);
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failureCount}`);
  console.log(`Success rate: ${Math.round((successCount / categoriesToProcess.length) * 100)}%`);
  console.log('='.repeat(60) + '\n');

  if (failureCount > 0) {
    console.log('⚠️  Some categories failed to enrich. Check logs for details.');
    process.exit(1);
  }

  console.log('🎉 All categories enriched successfully!');
  process.exit(0);
}

// Run the script
enrichCategoryEmbeddings().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
