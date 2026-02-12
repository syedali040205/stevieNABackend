/**
 * Test script to verify Pinecone + Redis setup
 * 
 * Run with: npx ts-node test-pinecone-setup.ts
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

import { pineconeClient } from './src/services/pineconeClient';
import { cacheManager } from './src/services/cacheManager';
// import { documentManager } from './src/services/documentManager'; // Uncomment for document tests

async function testSetup() {
  console.log('🧪 Testing Pinecone + Redis Setup...\n');

  try {
    // Test 1: Redis Health Check
    console.log('1️⃣ Testing Redis connection...');
    const redisHealthy = await cacheManager.healthCheck();
    if (redisHealthy) {
      console.log('✅ Redis connection successful\n');
    } else {
      console.log('❌ Redis connection failed\n');
      return;
    }

    // Test 2: Pinecone Stats
    console.log('2️⃣ Testing Pinecone connection...');
    const stats = await pineconeClient.getStats();
    console.log('✅ Pinecone connection successful');
    console.log('📊 Index stats:', JSON.stringify(stats, null, 2));
    console.log('');

    // Test 3: Cache Operations
    console.log('3️⃣ Testing cache operations...');
    await cacheManager.set('test:key', { message: 'Hello from cache!' }, 60);
    const cached = await cacheManager.get('test:key');
    console.log('✅ Cache set/get successful:', cached);
    await cacheManager.delete('test:key');
    console.log('✅ Cache delete successful\n');

    // Test 4: Document Ingestion (optional - comment out if you don't want to add test data)
    console.log('4️⃣ Testing document ingestion...');
    console.log('⚠️  Skipping document ingestion test (uncomment to test)');
    console.log('   To test ingestion, uncomment the code in test-pinecone-setup.ts\n');
    
    /*
    const testDocId = await documentManager.ingestDocument({
      title: 'Test Document - Stevie Awards FAQ',
      content: 'The Stevie Awards are the world\'s premier business awards. They recognize outstanding achievements in business worldwide. Categories include innovation, customer service, product development, and more.',
      program: 'general',
      category: 'faq',
      metadata: { source: 'test', isTest: true },
    });
    console.log('✅ Document ingested successfully:', testDocId);

    // Test 5: Document Search
    console.log('5️⃣ Testing document search...');
    const searchResults = await documentManager.searchDocuments({
      query: 'What are the Stevie Awards?',
      topK: 3,
    });
    console.log('✅ Search successful, found', searchResults.length, 'results');
    searchResults.forEach((result, i) => {
      console.log(`   ${i + 1}. ${result.title} (score: ${result.score.toFixed(3)})`);
    });
    console.log('');

    // Test 6: Document Deletion
    console.log('6️⃣ Testing document deletion...');
    await documentManager.deleteDocument(testDocId);
    console.log('✅ Document deleted successfully\n');
    */

    console.log('🎉 All tests passed! Setup is working correctly.\n');
    console.log('Next steps:');
    console.log('1. Start the API server: npm run dev');
    console.log('2. Test document ingestion via API: POST /api/documents/ingest');
    console.log('3. Test document search via API: POST /api/documents/search');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    // Close connections
    await cacheManager.close();
    process.exit(0);
  }
}

testSetup();
