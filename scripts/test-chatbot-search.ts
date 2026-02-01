/**
 * Test Chatbot Semantic Search
 * 
 * This script tests the semantic search functionality for the chatbot
 * by querying the general_embeddings table with sample questions.
 * 
 * Usage:
 *   npm run test-chatbot-search
 */

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Generate embedding for text using Python AI service
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await axios.post(
    `${AI_SERVICE_URL}/api/generate-embedding`,
    { text, model: 'text-embedding-3-small' },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': INTERNAL_API_KEY
      }
    }
  );
  return response.data.embedding;
}

/**
 * Search for similar FAQs
 */
async function searchSimilarFAQs(
  question: string,
  limit: number = 3
): Promise<any[]> {
  // Generate embedding for question
  const embedding = await generateEmbedding(question);

  // Search using database function
  const { data, error } = await supabase.rpc('search_similar_content', {
    query_embedding: embedding,
    content_type_filter: 'faq',
    match_limit: limit,
    match_threshold: 0.3
  });

  if (error) {
    throw new Error(`Search failed: ${error.message}`);
  }

  return data || [];
}

/**
 * Test semantic search with sample questions
 */
async function testSemanticSearch() {
  console.log('🧪 Testing Chatbot Semantic Search\n');
  console.log('═'.repeat(80));

  const testQuestions = [
    "Who can enter the International Business Awards?",
    "When is the deadline for ABA?",
    "How much does it cost to submit an entry?",
    "What is the judging process?",
    "Can non-profit organizations participate?"
  ];

  for (const question of testQuestions) {
    console.log(`\n📝 Question: "${question}"`);
    console.log('─'.repeat(80));

    try {
      const results = await searchSimilarFAQs(question, 3);

      if (results.length === 0) {
        console.log('   ⚠️  No results found (database might be empty)');
        continue;
      }

      console.log(`   Found ${results.length} similar FAQs:\n`);

      results.forEach((result, index) => {
        const metadata = result.metadata || {};
        const score = (result.similarity_score * 100).toFixed(1);
        
        console.log(`   ${index + 1}. [${score}% match] ${metadata.question || 'Unknown question'}`);
        console.log(`      Program: ${metadata.program || 'N/A'}`);
        console.log(`      Category: ${metadata.category || 'N/A'}`);
        
        // Show first 100 chars of content
        const preview = result.content.substring(0, 100).replace(/\n/g, ' ');
        console.log(`      Preview: ${preview}...`);
        console.log();
      });

    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }

  console.log('═'.repeat(80));
  console.log('\n✅ Semantic search test complete!');
  console.log('\nNext steps:');
  console.log('  1. Review search results quality');
  console.log('  2. Adjust match_threshold if needed (currently 0.3)');
  console.log('  3. Build chatbot answer generation endpoint');
}

// Run test
testSemanticSearch().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
