/**
 * Script to enrich category embeddings with contextual prefixes (Anthropic's Contextual Embeddings technique)
 * 
 * Reference: https://www.anthropic.com/news/contextual-retrieval
 * 
 * Anthropic's Contextual Retrieval technique improves RAG retrieval accuracy by 67% when combined with reranking.
 * The key insight: Add context that situates each chunk within its broader document context BEFORE embedding.
 * 
 * For Stevie Award categories:
 * - Each category is a complete "document" (not a chunk of a larger document)
 * - We add context that situates the category within the Stevie Awards ecosystem
 * - Format: "This award category is from [program] recognizing [type] for [eligible orgs]. [Category details]"
 * 
 * This script:
 * 1. Fetches all 1348 categories from Supabase (handles pagination for 1000 row limit)
 * 2. Generates contextual prefix for each category using Claude's prompt
 * 3. Formats enriched text: [Contextual Prefix] + [Focus Areas] + [Category Name] + [Description] + [Metadata]
 * 4. Generates embeddings for enriched text
 * 5. Stores embeddings in category_embeddings table
 * 
 * Expected improvement: 35-49% reduction in retrieval failures (Anthropic benchmark)
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
 * Generate contextual prefix using Anthropic's technique.
 * 
 * Anthropic's approach: "This chunk is from [document context]. [original content]"
 * For Stevie categories: "This award category is from [program] recognizing [type] for [eligible orgs]."
 * 
 * Key insight: Add context that situates the category within the Stevie Awards ecosystem
 * to improve semantic retrieval accuracy.
 */
async function generateContextualPrefix(category: Category): Promise<string> {
  // Detect if this is a social impact / humanitarian category
  const categoryText = `${category.category_name} ${category.description} ${category.achievement_focus.join(' ')}`.toLowerCase();
  const socialImpactKeywords = [
    'social', 'humanitarian', 'community', 'charitable', 'responsibility', 
    'healthcare', 'nonprofit', 'non-profit', 'cause', 'impact', 'csr', 
    'engagement', 'disadvantaged', 'refugee', 'activist', 'entrepreneur',
    'health', 'medical', 'hospital', 'patient', 'care', 'wellness'
  ];
  const isSocialImpact = socialImpactKeywords.some(keyword => categoryText.includes(keyword));

  // Use Anthropic's prompt structure: situate this category within the Stevie Awards context
  const systemPrompt = `You are generating contextual prefixes for Stevie Award categories to improve semantic search retrieval (Anthropic's Contextual Embeddings technique).

Given a category's metadata, generate a SHORT contextual prefix that situates this category within the Stevie Awards ecosystem.

Format: "This award category is from the [Program Name] program, recognizing [achievement type] for [eligible organizations]."

Rules:
- Start with "This award category is from the"
- Include program name, achievement focus, and eligible org types
- ${isSocialImpact ? 'CRITICAL: This is a SOCIAL IMPACT/HUMANITARIAN category. Emphasize: social good, community impact, humanitarian initiatives, healthcare access, charitable work, helping people, making a difference in communities' : 'Focus on business excellence, innovation, and professional achievement'}
- Keep it concise: 30-50 words maximum
- Use formal award language
- Output ONLY the prefix, no markdown, no extra text

Example:
Category: Best New Product - Technology
Program: American Business Awards
Focus: Innovation, Technology
Org Types: for-profit, non-profit
Subject: product

Output: "This award category is from the American Business Awards program, recognizing innovative technology products for both for-profit and non-profit organizations."`;

  const userPrompt = `Generate contextual prefix for:
Category: ${category.category_name}
Program: ${category.program_name}
Focus: ${category.achievement_focus.join(', ')}
Org Types: ${category.applicable_org_types.join(', ')}
Subject: ${category.nomination_subject_type}
${isSocialImpact ? '\n⚠️ SOCIAL IMPACT CATEGORY - Emphasize humanitarian/community/healthcare/charitable aspects in the prefix' : ''}`;

  try {
    const prefix = await openaiService.chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      model: 'gpt-4o-mini',
      maxTokens: 120,
      temperature: 0.3,
    });

    return (prefix || '').trim();
  } catch (error: any) {
    logger.error('contextual_prefix_generation_failed', {
      category_id: category.id,
      error: error.message,
    });
    
    // Fallback to template-based prefix following Anthropic's format
    const orgTypes = category.applicable_org_types.join(', ');
    const focus = category.achievement_focus.join(', ').toLowerCase();
    
    if (isSocialImpact) {
      return `This award category is from the ${category.program_name} program, recognizing social impact and humanitarian achievements in ${focus} for ${orgTypes} organizations making a difference in communities.`;
    }
    
    return `This award category is from the ${category.program_name} program, recognizing ${focus} achievements for ${orgTypes} organizations.`;
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
      // Flatten the joined data
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
