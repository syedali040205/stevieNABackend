/**
 * Chatbot Streaming Test Script
 * Tests the streaming chatbot endpoint
 */

const axios = require('./api/node_modules/axios');

const NODE_API_URL = process.env.NODE_API_URL || 'http://localhost:3000';

const testQuestion = "What are the Stevie Awards for Women in Business?";

async function testStreamingChatbot() {
  console.log('🤖 Testing Stevie Awards Chatbot (Streaming)\n');
  console.log('='.repeat(80));
  console.log(`\n📝 Question: "${testQuestion}"`);
  console.log('-'.repeat(80));
  
  try {
    const startTime = Date.now();
    
    console.log(`\n🔗 Connecting to ${NODE_API_URL}/api/chatbot/ask/stream...`);
    
    const response = await axios.post(
      `${NODE_API_URL}/api/chatbot/ask/stream`,
      { question: testQuestion },
      {
        responseType: 'stream',
        timeout: 60000
      }
    );
    
    console.log('✅ Connected! Waiting for stream...\n');
    
    let fullAnswer = '';
    let metadata = null;
    let firstChunkTime = null;
    
    console.log('\n✅ Streaming response:\n');
    
    return new Promise((resolve, reject) => {
      response.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'metadata') {
                metadata = data;
                console.log(`📊 Confidence: ${data.confidence}`);
                console.log(`📚 Sources: ${data.sources.length}\n`);
              } else if (data.type === 'chunk') {
                if (!firstChunkTime) {
                  firstChunkTime = Date.now();
                  console.log(`⏱️  Time to first chunk: ${firstChunkTime - startTime}ms\n`);
                }
                process.stdout.write(data.content);
                fullAnswer += data.content;
              } else if (data.type === 'done') {
                const totalTime = Date.now() - startTime;
                console.log(`\n\n⏱️  Total time: ${totalTime}ms`);
                console.log(`📏 Answer length: ${fullAnswer.length} characters`);
                
                if (metadata && metadata.sources) {
                  console.log(`\n📚 Sources:`);
                  metadata.sources.forEach((source, i) => {
                    console.log(`  ${i + 1}. ${source.title} (${source.program}) - ${(source.similarity_score * 100).toFixed(1)}% match`);
                  });
                }
                
                console.log('\n\n' + '='.repeat(80));
                console.log('\n✅ Streaming test complete!\n');
                resolve();
              } else if (data.type === 'error') {
                console.log(`\n❌ Error: ${data.message}`);
                reject(new Error(data.message));
              }
            } catch (e) {
              // Ignore JSON parse errors for incomplete chunks
            }
          }
        }
      });
      
      response.data.on('error', (error) => {
        console.log(`\n❌ Stream error: ${error.message}`);
        reject(error);
      });
      
      response.data.on('end', () => {
        if (!metadata) {
          console.log('\n\n' + '='.repeat(80));
          console.log('\n✅ Stream ended\n');
          resolve();
        }
      });
    });
    
  } catch (error) {
    console.log(`\n❌ Error: ${error.message}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
    }
    if (error.code === 'ECONNREFUSED') {
      console.log(`   💡 Make sure Node.js API is running on ${NODE_API_URL}`);
    }
    throw error;
  }
}

testStreamingChatbot().catch(error => {
  console.error('\n💥 Test failed:', error.message);
  process.exit(1);
});
