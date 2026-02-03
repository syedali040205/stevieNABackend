/**
 * Test script for unified chatbot
 * 
 * Usage: node test-unified-chatbot.js
 */

const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000'; // Test session ID

async function testUnifiedChatbot() {
  console.log('🧪 Testing Unified Chatbot\n');
  console.log('API URL:', API_URL);
  console.log('Session ID:', SESSION_ID);
  console.log('---\n');

  // Test 1: Question intent
  console.log('Test 1: Question Intent');
  console.log('User: "What is the Stevie Awards?"\n');
  
  try {
    const response = await axios.post(
      `${API_URL}/api/chat`,
      {
        session_id: SESSION_ID,
        message: 'What is the Stevie Awards?',
      },
      {
        responseType: 'stream',
        timeout: 30000,
      }
    );

    let buffer = '';
    
    response.data.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === 'intent') {
              console.log(`✅ Intent: ${data.intent} (confidence: ${data.confidence})`);
            } else if (data.type === 'chunk') {
              process.stdout.write(data.content);
            } else if (data.type === 'done') {
              console.log('\n\n✅ Test 1 Complete\n');
            } else if (data.type === 'error') {
              console.error('❌ Error:', data.message);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    });

    await new Promise((resolve, reject) => {
      response.data.on('end', resolve);
      response.data.on('error', reject);
    });

  } catch (error) {
    console.error('❌ Test 1 Failed:', error.message);
  }

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 2: Information intent
  console.log('Test 2: Information Intent');
  console.log('User: "I want to nominate my company"\n');
  
  try {
    const response = await axios.post(
      `${API_URL}/api/chat`,
      {
        session_id: SESSION_ID,
        message: 'I want to nominate my company',
      },
      {
        responseType: 'stream',
        timeout: 30000,
      }
    );

    let buffer = '';
    
    response.data.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === 'intent') {
              console.log(`✅ Intent: ${data.intent} (confidence: ${data.confidence})`);
            } else if (data.type === 'chunk') {
              process.stdout.write(data.content);
            } else if (data.type === 'done') {
              console.log('\n\n✅ Test 2 Complete\n');
            } else if (data.type === 'error') {
              console.error('❌ Error:', data.message);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    });

    await new Promise((resolve, reject) => {
      response.data.on('end', resolve);
      response.data.on('error', reject);
    });

  } catch (error) {
    console.error('❌ Test 2 Failed:', error.message);
  }

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 3: Mixed intent
  console.log('Test 3: Mixed Intent');
  console.log('User: "What categories are for marketing? We\'re a B2B company"\n');
  
  try {
    const response = await axios.post(
      `${API_URL}/api/chat`,
      {
        session_id: SESSION_ID,
        message: "What categories are for marketing? We're a B2B company",
      },
      {
        responseType: 'stream',
        timeout: 30000,
      }
    );

    let buffer = '';
    
    response.data.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === 'intent') {
              console.log(`✅ Intent: ${data.intent} (confidence: ${data.confidence})`);
            } else if (data.type === 'chunk') {
              process.stdout.write(data.content);
            } else if (data.type === 'done') {
              console.log('\n\n✅ Test 3 Complete\n');
            } else if (data.type === 'error') {
              console.error('❌ Error:', data.message);
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    });

    await new Promise((resolve, reject) => {
      response.data.on('end', resolve);
      response.data.on('error', reject);
    });

  } catch (error) {
    console.error('❌ Test 3 Failed:', error.message);
  }

  console.log('\n🎉 All tests complete!');
}

// Run tests
testUnifiedChatbot().catch(console.error);
