/**
 * Test script for deployed Stevie Awards API
 * Tests the complete chatbot conversation flow
 */

const https = require('https');

const API_URL = 'https://stevienabackend.onrender.com';

// Generate a valid UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const SESSION_ID = generateUUID();

// Helper function to make HTTP requests
function makeRequest(path, method, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve({ status: res.statusCode, data: body });
          } catch (e) {
            resolve({ status: res.statusCode, data: body });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Helper to parse SSE stream
function parseSSE(data) {
  const lines = data.split('\n');
  const events = [];
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const json = JSON.parse(line.slice(6));
        events.push(json);
      } catch (e) {
        // Skip invalid JSON
      }
    }
  }
  
  return events;
}

// Test functions
async function testHealthCheck() {
  console.log('\n🧪 Test 1: Health Check');
  console.log('=' .repeat(50));
  
  try {
    const response = await makeRequest('/api/health', 'GET');
    console.log('✅ Status:', response.status);
    console.log('📄 Response:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Failed:', error.message);
    return false;
  }
}

async function testChatMessage(message, description) {
  console.log(`\n🧪 ${description}`);
  console.log('=' .repeat(50));
  console.log('📤 Sending:', message);
  
  try {
    const response = await makeRequest('/api/chat', 'POST', {
      session_id: SESSION_ID,
      message: message,
    });
    
    console.log('✅ Status:', response.status);
    
    // Parse SSE events
    const events = parseSSE(response.data);
    
    // Show intent
    const intentEvent = events.find(e => e.type === 'intent');
    if (intentEvent) {
      console.log('🎯 Intent:', intentEvent.intent, `(${intentEvent.confidence})`);
    }
    
    // Collect response chunks
    const chunks = events.filter(e => e.type === 'chunk');
    const fullResponse = chunks.map(e => e.content).join('');
    
    console.log('💬 Response:', fullResponse.substring(0, 200) + (fullResponse.length > 200 ? '...' : ''));
    console.log('📊 Events:', events.length, '| Chunks:', chunks.length);
    
    // Check for recommendations
    const recEvent = events.find(e => e.type === 'recommendations');
    if (recEvent) {
      console.log('🎁 Recommendations:', recEvent.count, 'categories');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Failed:', error.message);
    return false;
  }
}

// Main test flow
async function runTests() {
  console.log('🚀 Testing Deployed Stevie Awards API');
  console.log('🌐 URL:', API_URL);
  console.log('🆔 Session ID:', SESSION_ID);
  
  const results = [];
  
  // Test 1: Health check
  results.push(await testHealthCheck());
  
  // Wait a bit between requests
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Test 2: Initial greeting
  results.push(await testChatMessage(
    'Hello',
    'Test 2: Initial Greeting'
  ));
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 3: Provide nomination info
  results.push(await testChatMessage(
    'I want to nominate our team for developing an AI-powered smart mirror that won top 5 in an ideathon',
    'Test 3: Provide Nomination Information'
  ));
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 4: Ask a question
  results.push(await testChatMessage(
    'What is the IBA program?',
    'Test 4: Ask Question About IBA'
  ));
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 5: Provide more details
  results.push(await testChatMessage(
    'My name is John and email is john@example.com. We are a small startup.',
    'Test 5: Provide Contact Details'
  ));
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 6: Request recommendations
  results.push(await testChatMessage(
    'Yes, please show me matching categories',
    'Test 6: Request Category Recommendations'
  ));
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${total - passed}/${total}`);
  
  if (passed === total) {
    console.log('\n🎉 All tests passed! API is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the logs above.');
  }
  
  process.exit(passed === total ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
