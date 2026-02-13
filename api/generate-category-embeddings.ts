/**
 * Generate Embeddings for All Stevie Categories
 * 
 * This script generates embeddings for all categories in the database
 * and stores them in the category_embeddings table.
 */

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env
dotenv.config({ path: path.join(__dirname, '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY!;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface Category {
  id: string;
  category_name: string;
  description: string;
  program_name: string;
  applicable_org_types: any;
  achievement_focus: any;
}

/**
 * Format category text for embedding. Must match api/src/services/embeddingManager.ts
 * formatCategoryText (focus areas first) so query and document embeddings align.
 */
function formatCategoryText(category: Category): string {
  const parts: string[] = [];

  // Focus areas first (same as embeddingManager for semantic alignment)
  if (category.achievement_focus && Array.isArray(category.achievement_focus) && category.achievement_focus.length > 0) {
    const focusAreas = category.achievement_focus.join(', ');
    parts.push(`Focus areas: ${focusAreas}.`);
  }

  // Category name and description
  parts.push(`${category.category_name}. ${category.description}.`);

  // Eligible organization types
  if (category.applicable_org_types && Array.isArray(category.applicable_org_types) && category.applicable_org_types.length > 0) {
    const orgTypes = category.applicable_org_types.join(', ');
    parts.push(`Eligible for ${orgTypes}.`);
  }

  // Program name
  parts.push(`Program: ${category.program_name}.`);

  return parts.join(' ');
}

/**
 * Generate embedding using Python AI service.
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await axios.post(
      `${AI_SERVICE_URL}/api/generate-embedding`,
      {
        text: text,
        model: EMBEDDING_MODEL,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': INTERNAL_API_KEY,
        },
        timeout: 30000,
      }
    );

    return response.data.embedding;
  } catch (error: any) {
    throw new Error(`Failed to generate embedding: ${error.message}`);
  }
}

/**
 * Process categories in batches to avoid overwhelming the API.
 */
async function processBatch(categories: Category[], batchNumber: number, totalBatches: number) {
  console.log(`\n📦 Processing batch ${batchNumber}/${totalBatches} (${categories.length} categories)`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < categories.length; i++) {
    const category = categories[i];
    
    try {
      // Format category text
      const categoryText = formatCategoryText(category);

      // Generate embedding
      const embedding = await generateEmbedding(categoryText);

      // Store in database
      const { error } = await supabase.from('category_embeddings').upsert({
        category_id: category.id,
        embedding: embedding,
        embedding_text: categoryText,
      });

      if (error) {
        console.error(`   ❌ Failed to store embedding for ${category.category_name}: ${error.message}`);
        errorCount++;
      } else {
        successCount++;
        if ((i + 1) % 10 === 0) {
          console.log(`   ✓ Processed ${i + 1}/${categories.length} in this batch`);
        }
      }

      // Small delay to avoid rate limiting (adjust as needed)
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error: any) {
      console.error(`   ❌ Error processing ${category.category_name}: ${error.message}`);
      errorCount++;
    }
  }

  console.log(`✅ Batch ${batchNumber} complete: ${successCount} success, ${errorCount} errors`);
  return { successCount, errorCount };
}

async function main() {
  console.log('🚀 Starting category embedding generation...\n');

  try {
    // Fetch all categories with their program information
    console.log('📊 Fetching categories from database...');
    
    // Fetch all categories - need to handle pagination since default limit is 1000
    let allCategories: any[] = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;
    
    while (hasMore) {
      const { data, error } = await supabase
        .from('stevie_categories')
        .select(`
          id,
          category_name,
          description,
          applicable_org_types,
          achievement_focus,
          stevie_programs(program_name)
        `)
        .range(from, from + pageSize - 1);
      
      if (error) {
        throw new Error(`Failed to fetch categories: ${error.message}`);
      }
      
      if (data && data.length > 0) {
        allCategories = allCategories.concat(data);
        from += pageSize;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }
    
    const categories = allCategories;

    if (!categories || categories.length === 0) {
      console.log('⚠️  No categories found in database');
      return;
    }

    console.log(`✓ Found ${categories.length} categories\n`);

    // Get existing embeddings
    const { data: existingEmbeddings, error: embeddingError } = await supabase
      .from('category_embeddings')
      .select('category_id');

    if (embeddingError) {
      throw new Error(`Failed to fetch existing embeddings: ${embeddingError.message}`);
    }

    const existingCategoryIds = new Set(existingEmbeddings?.map(e => e.category_id) || []);
    
    console.log(`📈 Existing embeddings: ${existingCategoryIds.size}`);
    
    // Filter out categories that already have embeddings
    const categoriesToProcess = categories.filter((cat: any) => !existingCategoryIds.has(cat.id));
    
    console.log(`📝 Categories to process: ${categoriesToProcess.length}\n`);

    if (categoriesToProcess.length === 0) {
      console.log('✅ All categories already have embeddings!');
      return;
    }

    // Transform data to match Category interface
    const formattedCategories: Category[] = categoriesToProcess.map((cat: any) => ({
      id: cat.id,
      category_name: cat.category_name,
      description: cat.description,
      program_name: cat.stevie_programs?.program_name || 'Unknown Program',
      applicable_org_types: cat.applicable_org_types,
      achievement_focus: cat.achievement_focus,
    }));

    // Process in batches of 50
    const BATCH_SIZE = 50;
    const batches: Category[][] = [];
    for (let i = 0; i < formattedCategories.length; i += BATCH_SIZE) {
      batches.push(formattedCategories.slice(i, i + BATCH_SIZE));
    }

    console.log(`🔄 Processing ${batches.length} batches of ${BATCH_SIZE} categories each\n`);

    let totalSuccess = 0;
    let totalErrors = 0;

    for (let i = 0; i < batches.length; i++) {
      const { successCount, errorCount } = await processBatch(batches[i], i + 1, batches.length);
      totalSuccess += successCount;
      totalErrors += errorCount;

      // Longer delay between batches
      if (i < batches.length - 1) {
        console.log('   ⏳ Waiting 2 seconds before next batch...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ EMBEDDING GENERATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total categories in database: ${categories.length}`);
    console.log(`Categories needing embeddings: ${formattedCategories.length}`);
    console.log(`Successfully processed: ${totalSuccess}`);
    console.log(`Errors: ${totalErrors}`);
    console.log('='.repeat(60) + '\n');

    // Verify final count
    const { count: finalCount } = await supabase
      .from('category_embeddings')
      .select('*', { count: 'exact', head: true });

    console.log(`📊 Final embedding count in database: ${finalCount || 0}`);

  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
