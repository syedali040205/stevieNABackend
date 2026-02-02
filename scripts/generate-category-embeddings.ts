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
 * Format category information into text for embedding.
 */
function formatCategoryText(category: Category): string {
  const parts: string[] = [];

  // Category name and description
  parts.push(`${category.category_name}. ${category.description}.`);

  // Eligible organization types
  if (category.applicable_org_types && Array.isArray(category.applicable_org_types) && category.applicable_org_types.length > 0) {
    const orgTypes = category.applicable_org_types.join(', ');
    parts.push(`Eligible for ${orgTypes}.`);
  }

  // Focus areas
  if (category.achievement_focus && Array.isArray(category.achievement_focus) && category.achievement_focus.length > 0) {
    const focusAreas = category.achievement_focus.join(', ');
    parts.push(`Focus areas: ${focusAreas}.`);
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
    const { data: categories, error } = await supabase
      .from('stevie_categories')
      .select(`
        id,
        category_name,
        description,
        applicable_org_types,
        achievement_focus,
        stevie_programs!inner(program_name)
      `);

    if (error) {
      throw new Error(`Failed to fetch categories: ${error.message}`);
    }

    if (!categories || categories.length === 0) {
      console.log('⚠️  No categories found in database');
      return;
    }

    console.log(`✓ Found ${categories.length} categories\n`);

    // Check how many already have embeddings
    const { count: existingCount } = await supabase
      .from('category_embeddings')
      .select('*', { count: 'exact', head: true });

    console.log(`📈 Existing embeddings: ${existingCount || 0}`);
    console.log(`📝 Categories to process: ${categories.length}\n`);

    // Transform data to match Category interface
    const formattedCategories: Category[] = categories.map((cat: any) => ({
      id: cat.id,
      category_name: cat.category_name,
      description: cat.description,
      program_name: cat.stevie_programs.program_name,
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
    console.log(`Total categories: ${categories.length}`);
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
