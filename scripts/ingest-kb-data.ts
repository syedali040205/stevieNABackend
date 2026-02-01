/**
 * Ingest Knowledge Base Data
 * 
 * This script ingests knowledge base content into the database with embeddings.
 * Unlike Q&A pairs, KB articles are stored as semantic chunks that can be
 * retrieved to provide context for LLM-generated answers.
 */

import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
const internalApiKey = process.env.INTERNAL_API_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

interface KBChunk {
  title: string;
  content: string;
  program: string;
  category: string;
  keywords: string[];
  metadata?: Record<string, any>;
}

interface KBData {
  chunks: KBChunk[];
  metadata?: {
    source?: string;
    chunked_at?: string;
    total_chunks?: number;
    programs?: string[];
    categories?: string[];
  };
}

/**
 * Generate embedding for text via Python AI service
 */
async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await axios.post(
      `${aiServiceUrl}/api/generate-embedding`,
      { text },
      {
        headers: {
          'X-Internal-API-Key': internalApiKey,
          'Content-Type': 'application/json'
        }
      }
    );
    
    return response.data.embedding;
  } catch (error: any) {
    console.error('Error generating embedding:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Ingest a single KB chunk
 */
async function ingestChunk(chunk: KBChunk, index: number, total: number): Promise<void> {
  try {
    console.log(`\n[${index + 1}/${total}] Processing: ${chunk.title.substring(0, 60)}...`);
    
    // Generate embedding for the full content
    const fullText = `${chunk.title}\n\n${chunk.content}`;
    console.log(`   Generating embedding (${fullText.length} chars)...`);
    const embedding = await generateEmbedding(fullText);
    
    // Insert into database
    const { data, error } = await supabase
      .from('general_embeddings')
      .insert({
        content: chunk.content,
        title: chunk.title,
        content_type: 'kb_article',
        program: chunk.program,
        category: chunk.category,
        keywords: chunk.keywords,
        metadata: chunk.metadata || {},
        embedding: embedding
      })
      .select()
      .single();
    
    if (error) {
      console.error(`   ❌ Error inserting chunk:`, error);
      throw error;
    }
    
    console.log(`   ✅ Inserted (ID: ${data.id})`);
    
  } catch (error: any) {
    console.error(`   ❌ Failed to ingest chunk:`, error.message);
    throw error;
  }
}

/**
 * Main ingestion function
 */
async function ingestKBData() {
  console.log('📚 Stevie Awards Knowledge Base Ingestion\n');
  console.log('='.repeat(50));
  
  // Load KB data
  const kbDataPath = path.join(__dirname, '../scripts/kb-data.json');
  console.log(`\n📖 Loading KB data from: ${kbDataPath}`);
  
  let kbData: KBData;
  try {
    kbData = require(kbDataPath);
  } catch (error) {
    console.error('❌ Error loading kb-data.json');
    console.error('   Make sure you have run: npm run chunk-kb');
    process.exit(1);
  }
  
  const chunks = kbData.chunks;
  console.log(`   Found: ${chunks.length} KB chunks\n`);
  
  if (chunks.length === 0) {
    console.error('❌ No chunks found in kb-data.json');
    process.exit(1);
  }
  
  // Show summary
  const programs = new Set(chunks.map(c => c.program));
  const categories = new Set(chunks.map(c => c.category));
  console.log('📊 Summary:');
  console.log(`   Programs: ${Array.from(programs).join(', ')}`);
  console.log(`   Categories: ${Array.from(categories).join(', ')}`);
  
  // Confirm before proceeding
  console.log('\n⚠️  This will insert chunks into the database.');
  console.log('   Press Ctrl+C to cancel, or wait 3 seconds to continue...\n');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Ingest chunks
  console.log('🚀 Starting ingestion...\n');
  console.log('='.repeat(50));
  
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < chunks.length; i++) {
    try {
      await ingestChunk(chunks[i], i, chunks.length);
      successCount++;
      
      // Rate limiting: wait 100ms between requests
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      errorCount++;
      console.error(`   Skipping chunk due to error\n`);
    }
  }
  
  // Final summary
  console.log('\n' + '='.repeat(50));
  console.log('\n✅ Ingestion Complete!\n');
  console.log(`   Total chunks: ${chunks.length}`);
  console.log(`   ✅ Successful: ${successCount}`);
  console.log(`   ❌ Failed: ${errorCount}`);
  
  if (successCount > 0) {
    console.log('\n📝 Next steps:');
    console.log('   1. Test semantic search: npm run test-chatbot-search');
    console.log('   2. Build chatbot endpoints');
    console.log('   3. Test end-to-end chatbot flow\n');
  }
}

// Run ingestion
ingestKBData().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
