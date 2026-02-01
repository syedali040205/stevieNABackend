/**
 * Ingest Knowledge Base Data
 * 
 * This script ingests knowledge base content into the database with embeddings.
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
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await axios.post(
    `${aiServiceUrl}/api/generate-embedding`,
    { text },
    {
      headers: {
        'X-API-Key': internalApiKey,
        'Content-Type': 'application/json'
      }
    }
  );
  
  return response.data.embedding;
}

async function ingestChunk(chunk: KBChunk, index: number, total: number): Promise<void> {
  console.log(`\n[${index + 1}/${total}] ${chunk.title.substring(0, 60)}...`);
  
  const fullText = `${chunk.title}\n\n${chunk.content}`;
  const embedding = await generateEmbedding(fullText);
  
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
  
  if (error) throw error;
  console.log(`   ✅ Inserted (ID: ${data.id})`);
}

async function main() {
  console.log('📚 Stevie Awards KB Ingestion\n');
  
  const kbDataPath = path.join(__dirname, '../scripts/kb-data.json');
  const kbData: KBData = require(kbDataPath);
  
  console.log(`Found: ${kbData.chunks.length} chunks\n`);
  console.log('⚠️  Starting in 3 seconds...\n');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  let successCount = 0;
  
  for (let i = 0; i < kbData.chunks.length; i++) {
    try {
      await ingestChunk(kbData.chunks[i], i, kbData.chunks.length);
      successCount++;
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }
  
  console.log(`\n✅ Complete! ${successCount}/${kbData.chunks.length} chunks ingested\n`);
}

main().catch(console.error);
