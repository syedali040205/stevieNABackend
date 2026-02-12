/**
 * Comprehensive Production Test for Stevie Awards Chatbot
 * Collects full SSE streams and validates responses
 */

const https = require('https');

const API_URL = 'https://stevienabackend.onrender.com';

// Generate UUID
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Make SSE request and collect full stream
function chatRequest(sessionId, message) {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/chat', API_URL);
    const postData = JSON.stringify({
      session_id: sessionId,
      message: message,
    });

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let buffer = '';
      const events = [];
      let fullResponse = '';
      
      console.log(`   📡 Status: ${res.statusCode}`);
      
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        
        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              events.push(data);
              
              // Collect response chunks
              if (data.type === 'chunk') {
                fullResponse += data.content;
                process.stdout.write('.');
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      });
      
      res.on('end', () => {
        console.log(''); // New line after dots
        resolve({ events, fullResponse });
      });
      
      res.on('error', reject);
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
    
    // Timeout after 60 seconds
    setTimeout(() => {
      req.destroy();
      reject(new Error('Request timeout'));
    }, 60000);
  });
}

// Test conversation flow
async function runProductionTest() {
  console.log('🚀 PRODUCTION CHATBOT TEST');
  console.log('🌐 API:', API_URL);
  console.log('=' .repeat(70));
  
  const sessionId = generateUUID();
  console.log('🆔 Session ID:', sessionId);
  console.log('');
  
  const tests = [
    {
      name: 'Initial Greeting',
      message: 'Hello',
      expectedIntent: 'greeting',
    },
    {
      name: 'Provide Nomination Info',
      message: 'I want to nominate our team for developing an AI-powered smart mirror that won top 5 in an ideathon competition',
      expectedIntent: 'information',
    },
    {
      name: 'Ask Question',
      message: 'What is the IBA program?',
      expectedIntent: 'question',
    },
    {
      name: 'Provide Contact Details',
      message: 'My name is Sarah Johnson and my email is sarah@techstartup.com. We are a small startup.',
      expectedIntent: 'information',
    },
    {
      name: 'Request Recommendations',
      message: 'Yes, please show me matching award categories',
      expectedIntent: 'affirmative',
    },
  ];
  
  const results = [];
  
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`\n📝 Test ${i + 1}/${tests.length}: ${test.name}`);
    console.log('─'.repeat(70));
    console.log(`💬 User: "${test.message}"`);
    console.log('');
    
    try {
      const startTime = Date.now();
      const { events, fullResponse } = await chatRequest(sessionId, test.message);
      const duration = Date.now() - startTime;
      
      // Analyze events
      const intentEvent = events.find(e => e.type === 'intent');
      const chunks = events.filter(e => e.type === 'chunk');
      const recEvent = events.find(e => e.type === 'recommendations');
      const doneEvent = events.find(e => e.type === 'done');
      
      console.log(`   ⏱️  Duration: ${duration}ms`);
      console.log(`   📊 Events: ${events.length} total`);
      
      if (intentEvent) {
        console.log(`   🎯 Intent: ${intentEvent.intent} (confidence: ${intentEvent.confidence})`);
        
        // Validate intent
        if (intentEvent.intent === test.expectedIntent) {
          console.log(`   ✅ Intent matches expected: ${test.expectedIntent}`);
        } else {
          console.log(`   ⚠️  Intent mismatch: expected ${test.expectedIntent}, got ${intentEvent.intent}`);
        }
      }
      
      if (chunks.length > 0) {
        console.log(`   💬 Response chunks: ${chunks.length}`);
        console.log(`   📝 Full response (${fullResponse.length} chars):`);
        console.log('   ┌' + '─'.repeat(68));
        
        // Word wrap the response
        const words = fullResponse.split(' ');
        let line = '   │ ';
        for (const word of words) {
          if (line.length + word.length > 68) {
            console.log(line);
            line = '   │ ' + word + ' ';
          } else {
            line += word + ' ';
          }
        }
        if (line.trim().length > 4) {
          console.log(line);
        }
        console.log('   └' + '─'.repeat(68));
      } else {
        console.log(`   ⚠️  No response chunks received`);
      }
      
      if (recEvent) {
        console.log(`   🎁 Recommendations: ${recEvent.count} categories`);
        if (recEvent.data && recEvent.data.length > 0) {
          console.log(`   📋 Top 3 categories:`);
          recEvent.data.slice(0, 3).forEach((cat, idx) => {
            console.log(`      ${idx + 1}. ${cat.category_name} (${cat.program_name})`);
            console.log(`         Score: ${cat.match_score}`);
          });
        }
      }
      
      if (doneEvent) {
        console.log(`   ✅ Stream completed successfully`);
      }
      
      // Validation
      const isValid = intentEvent && chunks.length > 0 && doneEvent;
      
      if (isValid) {
        console.log(`   ✅ TEST PASSED`);
        results.push({ test: test.name, passed: true, duration });
      } else {
        console.log(`   ❌ TEST FAILED - Missing expected events`);
        results.push({ test: test.name, passed: false, duration });
      }
      
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}`);
      results.push({ test: test.name, passed: false, error: error.message });
    }
    
    // Wait between requests
    if (i < tests.length - 1) {
      console.log('   ⏳ Waiting 3 seconds...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  // Final summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 FINAL RESULTS');
  console.log('='.repeat(70));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\n✅ Passed: ${passed}/${results.length}`);
  console.log(`❌ Failed: ${failed}/${results.length}`);
  
  if (passed === results.length) {
    console.log('\n🎉 ALL TESTS PASSED!');
    console.log('✨ Your production API is working perfectly!');
    console.log('🚀 Safe to use in production.');
  } else {
    console.log('\n⚠️  SOME TESTS FAILED');
    console.log('Failed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.test}: ${r.error || 'Validation failed'}`);
    });
  }
  
  // Performance summary
  const avgDuration = results
    .filter(r => r.duration)
    .reduce((sum, r) => sum + r.duration, 0) / results.filter(r => r.duration).length;
  
  if (avgDuration) {
    console.log(`\n⚡ Average response time: ${Math.round(avgDuration)}ms`);
  }
  
  console.log('\n' + '='.repeat(70));
  
  process.exit(passed === results.length ? 0 : 1);
}

// Run the test
console.log('Starting production test in 2 seconds...\n');
setTimeout(() => {
  runProductionTest().catch(error => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
}, 2000);
