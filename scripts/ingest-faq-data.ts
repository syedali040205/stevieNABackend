/**
 * FAQ Data Ingestion Script
 * 
 * This script:
 * 1. Reads FAQ data from JSON file
 * 2. Generates embeddings using Python AI service
 * 3. Stores embeddings in general_embeddings table
 * 
 * Usage:
 *   npm run ingest-faq
 */

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

// FAQ data file path
const FAQ_DATA_PATH = path.join(__dirname, 'faq-data.json');

interface FAQItem {
  question: string;
  answer: string;
  program?: string;
  category?: string;
  keywords?: string[];
  source_url?: string;
}

interface FAQData {
  faqs: FAQItem[];
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Generate embedding for text using Python AI service
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await axios.post(
      `${AI_SERVICE_URL}/api/generate-embedding`,
      {
        text: text,
        model: 'text-embedding-3-small'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': INTERNAL_API_KEY
        }
      }
    );

    return response.data.embedding;
  } catch (error: any) {
    console.error('Error generating embedding:', error.message);
    throw error;
  }
}

/**
 * Format FAQ item into text for embedding
 */
function formatFAQText(faq: FAQItem): string {
  const parts: string[] = [];

  // Question
  parts.push(`Question: ${faq.question}`);

  // Answer
  parts.push(`Answer: ${faq.answer}`);

  // Program (if specified)
  if (faq.program) {
    parts.push(`Program: ${faq.program}`);
  }

  // Category (if specified)
  if (faq.category) {
    parts.push(`Category: ${faq.category}`);
  }

  // Keywords (if specified)
  if (faq.keywords && faq.keywords.length > 0) {
    parts.push(`Keywords: ${faq.keywords.join(', ')}`);
  }

  return parts.join('\n');
}

/**
 * Insert FAQ embedding into database
 */
async function insertFAQEmbedding(
  faq: FAQItem,
  embedding: number[]
): Promise<void> {
  const content = formatFAQText(faq);
  
  const metadata = {
    question: faq.question,
    program: faq.program || 'general',
    category: faq.category || 'general',
    keywords: faq.keywords || []
  };

  const { error } = await supabase
    .from('general_embeddings')
    .insert({
      content_type: 'faq',
      content: content,
      metadata: metadata,
      source_url: faq.source_url || null,
      embedding: embedding
    });

  if (error) {
    throw new Error(`Failed to insert FAQ: ${error.message}`);
  }
}

/**
 * Main ingestion function
 */
async function ingestFAQData() {
  console.log('🚀 Starting FAQ data ingestion...\n');

  // Check if FAQ data file exists
  if (!fs.existsSync(FAQ_DATA_PATH)) {
    console.error(`❌ FAQ data file not found: ${FAQ_DATA_PATH}`);
    console.log('\nPlease create faq-data.json with the following format:');
    console.log(JSON.stringify({
      faqs: [
        {
          question: "What are the eligibility requirements for IBA?",
          answer: "The International Business Awards (IBA) is open to organizations worldwide...",
          program: "IBA",
          category: "eligibility",
          keywords: ["eligibility", "requirements", "IBA"],
          source_url: "https://stevieawards.com/iba/eligibility"
        }
      ]
    }, null, 2));
    process.exit(1);
  }

  // Read FAQ data
  console.log('📖 Reading FAQ data...');
  const faqData: FAQData = JSON.parse(fs.readFileSync(FAQ_DATA_PATH, 'utf-8'));
  console.log(`   Found ${faqData.faqs.length} FAQ items\n`);

  // Process each FAQ
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < faqData.faqs.length; i++) {
    const faq = faqData.faqs[i];
    const progress = `[${i + 1}/${faqData.faqs.length}]`;

    try {
      console.log(`${progress} Processing: "${faq.question.substring(0, 60)}..."`);

      // Generate embedding
      const text = formatFAQText(faq);
      console.log(`   Generating embedding (${text.length} chars)...`);
      const embedding = await generateEmbedding(text);

      // Insert into database
      console.log(`   Inserting into database...`);
      await insertFAQEmbedding(faq, embedding);

      console.log(`   ✅ Success\n`);
      successCount++;

      // Rate limiting: wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}\n`);
      errorCount++;
    }
  }

  // Summary
  console.log('═'.repeat(60));
  console.log('📊 Ingestion Summary');
  console.log('═'.repeat(60));
  console.log(`Total FAQs:     ${faqData.faqs.length}`);
  console.log(`✅ Successful:  ${successCount}`);
  console.log(`❌ Failed:      ${errorCount}`);
  console.log('═'.repeat(60));

  if (successCount > 0) {
    console.log('\n🎉 FAQ data ingestion complete!');
    console.log('\nNext steps:');
    console.log('  1. Test semantic search: npm run test-chatbot-search');
    console.log('  2. Build chatbot API endpoints');
    console.log('  3. Test end-to-end chatbot flow');
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

// Run ingestion
ingestFAQData().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
