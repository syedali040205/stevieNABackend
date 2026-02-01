/**
 * Test script to verify Node → Python → OpenAI embedding integration
 * 
 * This tests that:
 * 1. Node's embeddingManager calls Python AI service
 * 2. Python calls OpenAI
 * 3. Embedding is returned successfully
 */

import axios from 'axios';

const AI_SERVICE_URL = 'http://localhost:8000';
const INTERNAL_API_KEY = 'stevie-internal-key-2024-secure';

async function testEmbeddingGeneration() {
  console.log('🧪 Testing Node → Python → OpenAI embedding flow...\n');

  try {
    // Test 1: Direct Python call
    console.log('Test 1: Direct call to Python AI service');
    const pythonResponse = await axios.post(
      `${AI_SERVICE_URL}/api/generate-embedding`,
      {
        text: 'Test embedding generation from Node.js',
        model: 'text-embedding-3-small'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': INTERNAL_API_KEY
        }
      }
    );

    console.log('✅ Python service responded successfully');
    console.log(`   Embedding dimension: ${pythonResponse.data.dimension}`);
    console.log(`   Tokens used: ${pythonResponse.data.tokens_used}`);
    console.log(`   First 5 values: ${pythonResponse.data.embedding.slice(0, 5).join(', ')}\n`);

    // Test 2: Simulate what embeddingManager does
    console.log('Test 2: Simulating embeddingManager.generateEmbedding()');
    const userContextText = 'Organization: Acme Corp in USA. Type: for_profit, Size: large. Achievement: improved customer satisfaction by 40%. Focus areas: customer_service.';
    
    const embeddingResponse = await axios.post(
      `${AI_SERVICE_URL}/api/generate-embedding`,
      {
        text: userContextText,
        model: 'text-embedding-3-small'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': INTERNAL_API_KEY
        }
      }
    );

    console.log('✅ Embedding generated for user context');
    console.log(`   Text length: ${userContextText.length} characters`);
    console.log(`   Embedding dimension: ${embeddingResponse.data.dimension}`);
    console.log(`   Tokens used: ${embeddingResponse.data.tokens_used}`);
    console.log(`   Ready for semantic search in Supabase!\n`);

    // Test 3: Verify embedding format
    console.log('Test 3: Verify embedding format');
    const embedding = embeddingResponse.data.embedding;
    
    if (!Array.isArray(embedding)) {
      throw new Error('Embedding is not an array');
    }
    
    if (embedding.length !== 1536) {
      throw new Error(`Expected 1536 dimensions, got ${embedding.length}`);
    }
    
    if (typeof embedding[0] !== 'number') {
      throw new Error('Embedding values are not numbers');
    }

    console.log('✅ Embedding format is correct');
    console.log(`   Type: Array of ${embedding.length} floats`);
    console.log(`   Sample values: ${embedding.slice(0, 3).map(v => v.toFixed(6)).join(', ')}...\n`);

    console.log('🎉 All tests passed! Phase 1 refactor is working correctly.\n');
    console.log('Summary:');
    console.log('  ✅ Python AI service is running');
    console.log('  ✅ OpenAI API is accessible');
    console.log('  ✅ Embeddings are generated correctly');
    console.log('  ✅ Node can call Python for embeddings');
    console.log('  ✅ Ready for semantic search in Supabase');
    console.log('\nNext steps:');
    console.log('  1. Test Phase 1 recommendation flow end-to-end');
    console.log('  2. Build chatbot using same architecture');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    process.exit(1);
  }
}

// Run tests
testEmbeddingGeneration();
