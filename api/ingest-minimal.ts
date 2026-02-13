import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';
import { getSupabaseClient } from './src/config/supabase';
import OpenAI from 'openai';

const supabase = getSupabaseClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pinecone.index('stevie-kb-documents');

async function ingest() {
  console.log('🚀 Minimal ingestion test\n');

  const title = 'Test - Stevie Awards Overview';
  const content = `# Stevie Awards Overview

The Stevie Awards are the world's premier business awards, created in 2002.

## Contact
Email: help@stevieawards.com
Website: www.stevieawards.com`;

  console.log('1. Creating document in Supabase...');
  const { data: doc, error } = await supabase
    .from('documents')
    .insert({
      title,
      content,
      content_type: 'kb_article',
      program: 'general',
      metadata: { test: true },
    })
    .select()
    .single();

  if (error || !doc) {
    console.error('❌ Supabase error:', error?.message);
    process.exit(1);
  }

  console.log('✅ Document created:', doc.id);

  console.log('\n2. Generating embedding...');
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: content,
  });

  const embedding = embeddingResponse.data[0].embedding;
  console.log('✅ Embedding generated (', embedding.length, 'dimensions)');

  console.log('\n3. Upserting to Pinecone...');
  await index.upsert({
    records: [{
      id: `${doc.id}_chunk_0`,
      values: embedding,
      metadata: {
        document_id: doc.id,
        title,
        chunk_index: 0,
        chunk_text: content,
        program: 'general',
        category: 'kb_article',
        content_type: 'kb_article',
      },
    }]
  });

  console.log('✅ Vector upserted to Pinecone');

  console.log('\n✅ Test complete! Document ingested successfully.');
  console.log('\nNext: Test Q&A by asking "What are the Stevie Awards?"');
}

ingest()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Error:', error.message);
    process.exit(1);
  });
