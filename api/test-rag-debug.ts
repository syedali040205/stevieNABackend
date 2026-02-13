import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

/**
 * Debug RAG - Test Pinecone query directly
 * 
 * Usage: npx tsx test-rag-debug.ts
 */

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pinecone.index('stevie-kb-documents');

async function testRAG() {
  console.log('🔍 RAG Debug Test\n');

  // Step 1: Check Pinecone stats
  console.log('1️⃣ Checking Pinecone stats...');
  const stats = await index.describeIndexStats();
  console.log('   Total vectors:', stats.totalRecordCount);
  console.log('   Namespaces:', JSON.stringify(stats.namespaces, null, 2));

  if (stats.totalRecordCount === 0) {
    console.log('\n❌ No vectors in Pinecone! Upload documents first.');
    return;
  }

  // Step 2: Test query
  const testQuestion = 'what are stevie awards';
  console.log(`\n2️⃣ Testing query: "${testQuestion}"`);
  
  console.log('   Generating embedding...');
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: testQuestion,
  });
  const embedding = embeddingResponse.data[0].embedding;
  console.log(`   ✅ Embedding generated (${embedding.length} dimensions)`);

  // Step 3: Query WITHOUT filter
  console.log('\n3️⃣ Query WITHOUT filter...');
  const resultsNoFilter = await index.query({
    vector: embedding,
    topK: 5,
    includeMetadata: true,
  });
  console.log(`   Results: ${resultsNoFilter.matches.length}`);
  if (resultsNoFilter.matches.length > 0) {
    resultsNoFilter.matches.forEach((match, idx) => {
      console.log(`\n   Match ${idx + 1}:`);
      console.log(`   - ID: ${match.id}`);
      console.log(`   - Score: ${match.score}`);
      console.log(`   - Metadata:`, JSON.stringify(match.metadata, null, 2));
    });
  }

  // Step 4: Query WITH filter (what the app uses)
  console.log('\n4️⃣ Query WITH filter (content_type: kb_article)...');
  const resultsWithFilter = await index.query({
    vector: embedding,
    topK: 5,
    includeMetadata: true,
    filter: { content_type: 'kb_article' },
  });
  console.log(`   Results: ${resultsWithFilter.matches.length}`);
  if (resultsWithFilter.matches.length > 0) {
    resultsWithFilter.matches.forEach((match, idx) => {
      console.log(`\n   Match ${idx + 1}:`);
      console.log(`   - ID: ${match.id}`);
      console.log(`   - Score: ${match.score}`);
      console.log(`   - Content: ${(match.metadata?.chunk_text as string || '').substring(0, 200)}...`);
    });
  } else {
    console.log('\n   ❌ No results with filter!');
    console.log('   This means vectors don\'t have content_type: kb_article metadata');
  }

  // Step 5: Check what metadata keys exist
  if (resultsNoFilter.matches.length > 0) {
    console.log('\n5️⃣ Metadata keys in first vector:');
    const firstMatch = resultsNoFilter.matches[0];
    console.log('   Keys:', Object.keys(firstMatch.metadata || {}));
    console.log('   Full metadata:', JSON.stringify(firstMatch.metadata, null, 2));
  }

  console.log('\n✅ Debug complete!');
}

testRAG()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Error:', error);
    process.exit(1);
  });
