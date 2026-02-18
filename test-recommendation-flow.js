/**
 * End-to-End Test: Complete Recommendation Flow
 * Tests the entire conversation flow from greeting to recommendations
 */

const https = require('https');

const BASE_URL = 'stevienabackend.onrender.com';

// Generate UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Make a chat request
function sendMessage(sessionId, message) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      session_id: sessionId,
      message,
    });

    const options = {
      hostname: BASE_URL,
      port: 443,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
      timeout: 60000,
    };

    console.log(`\n📤 Sending: "${message}"`);
    const startTime = Date.now();

    const req = https.request(options, (res) => {
      let responseData = '';
      let chunks = [];

      res.on('data', (chunk) => {
        responseData += chunk.toString();
        
        // Parse SSE chunks
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const json = JSON.parse(line.substring(6));
              if (json.type === 'chunk') {
                chunks.push(json.content);
              } else if (json.type === 'recommendations') {
                chunks.push(`\n\n🎯 RECOMMENDATIONS RECEIVED: ${json.count} categories`);
              }
            } catch (e) {
              // Ignore parse errors for keepalive messages
            }
          }
        }
      });

      res.on('end', () => {
        const duration = Date.now() - startTime;
        const fullResponse = chunks.join('');
        
        console.log(`📥 Response (${duration}ms):`);
        console.log(fullResponse || '(empty response)');
        
        resolve({
          statusCode: res.statusCode,
          response: fullResponse,
          duration,
          rawData: responseData,
        });
      });
    });

    req.on('error', (error) => {
      console.error(`❌ Error: ${error.message}`);
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(data);
    req.end();
  });
}

// Wait helper
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Main test flow
async function testRecommendationFlow() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 END-TO-END TEST: Recommendation Flow');
  console.log('='.repeat(70));

  const sessionId = generateUUID();
  console.log(`\n🆔 Session ID: ${sessionId}`);

  const testSteps = [
    {
      step: 1,
      message: 'Hi, I want to nominate myself',
      expectedContext: 'recommendation',
      description: 'Initial greeting - should trigger recommendation flow',
    },
    {
      step: 2,
      message: 'John Smith',
      expectedContext: 'recommendation',
      description: 'Provide name',
    },
    {
      step: 3,
      message: 'john.smith@example.com',
      expectedContext: 'recommendation',
      description: 'Provide email',
    },
    {
      step: 4,
      message: 'team',
      expectedContext: 'recommendation',
      description: 'What are you nominating - team',
    },
    {
      step: 5,
      message: 'United States',
      expectedContext: 'recommendation',
      description: 'Provide geography',
    },
    {
      step: 6,
      message: 'We developed an AI-powered smart mirror that won first place at the Innovation Ideathon. Our product uses machine learning to provide personalized health insights and has been recognized as one of the top 5 innovations in consumer electronics.',
      expectedContext: 'recommendation',
      description: 'Achievement description',
    },
    {
      step: 7,
      message: 'Our smart mirror has helped over 10,000 users improve their health routines. It reduced morning preparation time by 40% and increased user engagement with health tracking by 300%. The product generated $500K in revenue in the first year.',
      expectedContext: 'recommendation',
      description: 'Achievement impact',
    },
    {
      step: 8,
      message: 'We pioneered the use of AI for personalized health recommendations in smart mirrors. Our machine learning algorithms adapt to individual user patterns and provide real-time feedback. We also developed a unique gesture control system that works in humid bathroom environments.',
      expectedContext: 'recommendation',
      description: 'Achievement innovation',
    },
    {
      step: 9,
      message: 'We faced significant challenges with hardware integration, especially making the display work in high-humidity environments. We also had to overcome data privacy concerns by implementing on-device processing. The biggest challenge was achieving real-time AI inference on embedded hardware with limited computing power.',
      expectedContext: 'recommendation',
      description: 'Achievement challenges',
    },
    {
      step: 10,
      message: 'Yes, show me the categories',
      expectedContext: 'recommendation',
      description: 'Confirm to generate recommendations',
    },
  ];

  const results = [];
  let hasRecommendations = false;

  try {
    for (const testStep of testSteps) {
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`📍 STEP ${testStep.step}: ${testStep.description}`);
      console.log(`${'─'.repeat(70)}`);

      const result = await sendMessage(sessionId, testStep.message);
      
      results.push({
        step: testStep.step,
        message: testStep.message,
        statusCode: result.statusCode,
        duration: result.duration,
        success: result.statusCode === 200,
        hasContent: result.response.length > 0,
      });

      // Check if recommendations were generated
      if (result.rawData.includes('"type":"recommendations"')) {
        hasRecommendations = true;
        console.log('\n✅ RECOMMENDATIONS GENERATED!');
        
        // Try to parse and display recommendations
        try {
          const lines = result.rawData.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const json = JSON.parse(line.substring(6));
              if (json.type === 'recommendations') {
                console.log(`\n📊 Recommendation Summary:`);
                console.log(`   Total Categories: ${json.count}`);
                if (json.data && json.data.length > 0) {
                  console.log(`\n   Top 5 Categories:`);
                  json.data.slice(0, 5).forEach((rec, i) => {
                    console.log(`   ${i + 1}. ${rec.category_name} (${rec.program})`);
                    console.log(`      Match: ${(rec.similarity_score * 100).toFixed(1)}%`);
                  });
                }
              }
            }
          }
        } catch (e) {
          console.log('   (Could not parse recommendation details)');
        }
      }

      // Check for errors
      if (result.statusCode !== 200) {
        console.log(`\n⚠️  WARNING: Non-200 status code: ${result.statusCode}`);
      }

      if (result.response.length === 0) {
        console.log(`\n⚠️  WARNING: Empty response`);
      }

      // Wait between messages to simulate human behavior
      if (testStep.step < testSteps.length) {
        await wait(2000);
      }
    }

    // Print summary
    console.log(`\n\n${'='.repeat(70)}`);
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(70));

    const totalSteps = results.length;
    const successfulSteps = results.filter(r => r.success).length;
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;

    console.log(`\nTotal Steps: ${totalSteps}`);
    console.log(`Successful: ${successfulSteps}/${totalSteps}`);
    console.log(`Average Response Time: ${avgDuration.toFixed(0)}ms`);
    console.log(`Recommendations Generated: ${hasRecommendations ? '✅ YES' : '❌ NO'}`);

    console.log(`\n📋 Step-by-Step Results:`);
    results.forEach(r => {
      const status = r.success ? '✅' : '❌';
      const content = r.hasContent ? '📝' : '⚠️ ';
      console.log(`   ${status} ${content} Step ${r.step}: ${r.duration}ms - "${r.message.substring(0, 50)}..."`);
    });

    // Identify potential bugs
    console.log(`\n\n${'='.repeat(70)}`);
    console.log('🐛 POTENTIAL BUGS DETECTED');
    console.log('='.repeat(70));

    let bugsFound = 0;

    // Check for failures
    const failedSteps = results.filter(r => !r.success);
    if (failedSteps.length > 0) {
      bugsFound++;
      console.log(`\n❌ BUG #${bugsFound}: Failed requests`);
      console.log(`   Steps: ${failedSteps.map(r => r.step).join(', ')}`);
      console.log(`   Impact: Critical - conversation flow broken`);
    }

    // Check for empty responses
    const emptyResponses = results.filter(r => !r.hasContent);
    if (emptyResponses.length > 0) {
      bugsFound++;
      console.log(`\n⚠️  BUG #${bugsFound}: Empty responses`);
      console.log(`   Steps: ${emptyResponses.map(r => r.step).join(', ')}`);
      console.log(`   Impact: Medium - user gets no feedback`);
    }

    // Check if recommendations were generated
    if (!hasRecommendations) {
      bugsFound++;
      console.log(`\n❌ BUG #${bugsFound}: Recommendations not generated`);
      console.log(`   Impact: Critical - main feature not working`);
      console.log(`   Possible causes:`);
      console.log(`   - Field extraction failed`);
      console.log(`   - Recommendation engine error`);
      console.log(`   - Missing required fields`);
    }

    // Check for slow responses
    const slowSteps = results.filter(r => r.duration > 20000);
    if (slowSteps.length > 0) {
      bugsFound++;
      console.log(`\n⚠️  BUG #${bugsFound}: Slow responses (>20s)`);
      console.log(`   Steps: ${slowSteps.map(r => `${r.step} (${r.duration}ms)`).join(', ')}`);
      console.log(`   Impact: Low - poor user experience`);
    }

    if (bugsFound === 0) {
      console.log(`\n✅ NO BUGS DETECTED - All tests passed!`);
    } else {
      console.log(`\n\n⚠️  Total bugs found: ${bugsFound}`);
    }

    console.log(`\n${'='.repeat(70)}\n`);

    // Final verdict
    if (successfulSteps === totalSteps && hasRecommendations) {
      console.log('🎉 TEST PASSED: End-to-end flow working correctly!\n');
      process.exit(0);
    } else {
      console.log('❌ TEST FAILED: Issues detected in the flow\n');
      process.exit(1);
    }

  } catch (error) {
    console.error(`\n\n❌ TEST FAILED WITH ERROR:`);
    console.error(error);
    process.exit(1);
  }
}

// Run the test
console.log('\n🚀 Starting end-to-end test...\n');
testRecommendationFlow();
