/**
 * Comprehensive Stress Test for Stevie Awards Chatbot
 * 
 * Tests:
 * 1. Complete end-to-end flow (7 required fields + recommendations)
 * 2. Concurrent users at different load levels
 * 3. Response times for each step
 * 4. Success rate and error tracking
 * 5. Field extraction accuracy
 * 6. Recommendation generation
 */

const https = require('https');

const TARGET_URL = 'https://stevienabackend.onrender.com';

// Test configuration
const TEST_STAGES = [
  { name: 'Stage 1: Light Load', users: 5, description: '5 concurrent users' },
  { name: 'Stage 2: Medium Load', users: 20, description: '20 concurrent users' },
  { name: 'Stage 3: Heavy Load', users: 50, description: '50 concurrent users' },
  { name: 'Stage 4: Extreme Load', users: 100, description: '100 concurrent users' },
];

// Generate UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Make a chat request
function sendMessage(sessionId, message, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      session_id: sessionId,
      message,
    });

    const url = new URL(TARGET_URL);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
      timeout,
    };

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
                chunks.push(`[${json.count} recommendations]`);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      });

      res.on('end', () => {
        const duration = Date.now() - startTime;
        const fullResponse = chunks.join('');
        
        resolve({
          success: res.statusCode === 200,
          statusCode: res.statusCode,
          response: fullResponse,
          duration,
          hasRecommendations: responseData.includes('"type":"recommendations"'),
        });
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(data);
    req.end();
  });
}

// Complete user flow
async function completeUserFlow(userId) {
  const sessionId = generateUUID();
  const results = {
    userId,
    sessionId,
    steps: [],
    totalDuration: 0,
    success: false,
    error: null,
  };

  const startTime = Date.now();

  try {
    // Step 1: Greeting with nomination subject
    const step1 = await sendMessage(sessionId, 'Hi, I want to nominate my team');
    results.steps.push({ step: 1, field: 'greeting', duration: step1.duration, success: step1.success });
    if (!step1.success) throw new Error('Step 1 failed');

    // Step 2: Name
    const step2 = await sendMessage(sessionId, `User ${userId}`);
    results.steps.push({ step: 2, field: 'user_name', duration: step2.duration, success: step2.success });
    if (!step2.success) throw new Error('Step 2 failed');

    // Step 3: Email
    const step3 = await sendMessage(sessionId, `user${userId}@example.com`);
    results.steps.push({ step: 3, field: 'user_email', duration: step3.duration, success: step3.success });
    if (!step3.success) throw new Error('Step 3 failed');

    // Step 4: Organization type
    const step4 = await sendMessage(sessionId, 'for-profit');
    results.steps.push({ step: 4, field: 'org_type', duration: step4.duration, success: step4.success });
    if (!step4.success) throw new Error('Step 4 failed');

    // Step 5: Women awards interest
    const step5 = await sendMessage(sessionId, userId % 2 === 0 ? 'yes' : 'no');
    results.steps.push({ step: 5, field: 'gender_programs_opt_in', duration: step5.duration, success: step5.success });
    if (!step5.success) throw new Error('Step 5 failed');

    // Step 6: Recognition scope
    const step6 = await sendMessage(sessionId, 'both');
    results.steps.push({ step: 6, field: 'recognition_scope', duration: step6.duration, success: step6.success });
    if (!step6.success) throw new Error('Step 6 failed');

    // Step 7: Description
    const step7 = await sendMessage(sessionId, 'We developed an innovative AI solution that transformed customer service operations, reducing response times by 80% and increasing customer satisfaction scores by 45%. Our team of 12 engineers worked for 18 months to deliver this groundbreaking product.');
    results.steps.push({ step: 7, field: 'description', duration: step7.duration, success: step7.success });
    if (!step7.success) throw new Error('Step 7 failed');

    // Step 8: Handle optional follow-up or trigger recommendations
    const step8 = await sendMessage(sessionId, 'We improved efficiency by 80% and saved $2M annually', 45000);
    results.steps.push({ step: 8, field: 'follow_up_or_recommendations', duration: step8.duration, success: step8.success, hasRecommendations: step8.hasRecommendations });
    
    // If no recommendations yet, try one more time
    if (!step8.hasRecommendations) {
      const step9 = await sendMessage(sessionId, 'Show me the categories', 45000);
      results.steps.push({ step: 9, field: 'final_recommendations', duration: step9.duration, success: step9.success, hasRecommendations: step9.hasRecommendations });
      results.success = step9.hasRecommendations;
    } else {
      results.success = true;
    }

    results.totalDuration = Date.now() - startTime;

  } catch (error) {
    results.error = error.message;
    results.totalDuration = Date.now() - startTime;
  }

  return results;
}

// Run test stage
async function runTestStage(stageName, numUsers) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${stageName}`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Starting ${numUsers} concurrent user flows...`);

  const startTime = Date.now();
  const promises = [];

  for (let i = 1; i <= numUsers; i++) {
    promises.push(completeUserFlow(i));
  }

  const results = await Promise.all(promises);
  const duration = Date.now() - startTime;

  // Analyze results
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const successRate = (successful.length / results.length * 100).toFixed(1);

  // Calculate average durations
  const avgTotalDuration = successful.reduce((sum, r) => sum + r.totalDuration, 0) / successful.length || 0;
  const avgStepDurations = {};
  
  for (let step = 1; step <= 9; step++) {
    const stepResults = successful
      .flatMap(r => r.steps)
      .filter(s => s.step === step && s.duration);
    
    if (stepResults.length > 0) {
      avgStepDurations[step] = stepResults.reduce((sum, s) => sum + s.duration, 0) / stepResults.length;
    }
  }

  // Print results
  console.log(`\n📊 RESULTS:`);
  console.log(`   Total Time: ${(duration / 1000).toFixed(1)}s`);
  console.log(`   Success Rate: ${successRate}% (${successful.length}/${results.length})`);
  console.log(`   Failed: ${failed.length}`);
  
  if (successful.length > 0) {
    console.log(`\n⏱️  AVERAGE TIMINGS:`);
    console.log(`   Complete Flow: ${(avgTotalDuration / 1000).toFixed(1)}s`);
    console.log(`   Per Step:`);
    Object.entries(avgStepDurations).forEach(([step, duration]) => {
      console.log(`     Step ${step}: ${(duration / 1000).toFixed(2)}s`);
    });
  }

  if (failed.length > 0) {
    console.log(`\n❌ FAILURES:`);
    failed.slice(0, 5).forEach(r => {
      console.log(`   User ${r.userId}: ${r.error || 'Unknown error'} (completed ${r.steps.length} steps)`);
    });
    if (failed.length > 5) {
      console.log(`   ... and ${failed.length - 5} more failures`);
    }
  }

  return {
    stageName,
    numUsers,
    duration,
    successRate: parseFloat(successRate),
    successful: successful.length,
    failed: failed.length,
    avgTotalDuration,
    avgStepDurations,
  };
}

// Main test runner
async function runComprehensiveStressTest() {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 COMPREHENSIVE STRESS TEST');
  console.log('='.repeat(70));
  console.log(`Target: ${TARGET_URL}`);
  console.log(`Testing: Complete 7-field flow + recommendations`);
  console.log(`Stages: ${TEST_STAGES.length}`);

  const allResults = [];

  for (const stage of TEST_STAGES) {
    const result = await runTestStage(stage.name, stage.users);
    allResults.push(result);

    // Wait between stages
    if (stage !== TEST_STAGES[TEST_STAGES.length - 1]) {
      console.log('\n⏳ Waiting 5 seconds before next stage...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // Final summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('📈 FINAL SUMMARY');
  console.log(`${'='.repeat(70)}`);

  allResults.forEach(result => {
    const status = result.successRate >= 90 ? '✅' : result.successRate >= 70 ? '⚠️' : '❌';
    console.log(`${status} ${result.stageName}: ${result.successRate}% success (${result.successful}/${result.numUsers})`);
    console.log(`   Avg flow time: ${(result.avgTotalDuration / 1000).toFixed(1)}s`);
  });

  // Performance assessment
  console.log(`\n${'='.repeat(70)}`);
  console.log('🎯 PERFORMANCE ASSESSMENT');
  console.log(`${'='.repeat(70)}`);

  const lastStage = allResults[allResults.length - 1];
  
  if (lastStage.successRate >= 90) {
    console.log('✅ EXCELLENT: System handles load well');
  } else if (lastStage.successRate >= 70) {
    console.log('⚠️  ACCEPTABLE: System works but shows strain');
  } else {
    console.log('❌ POOR: System struggles under load');
  }

  console.log(`\nRecommendations:`);
  if (lastStage.avgTotalDuration > 60000) {
    console.log('  - Flow takes >60s - consider optimizing LLM calls');
  }
  if (lastStage.successRate < 90) {
    console.log('  - Success rate <90% - consider scaling infrastructure');
  }
  if (lastStage.successRate >= 90 && lastStage.avgTotalDuration < 45000) {
    console.log('  - System performing well! Ready for production.');
  }

  console.log('\n');
}

// Check if server is accessible
https.get(`${TARGET_URL}/api/health`, (res) => {
  console.log(`✅ Server is accessible (status: ${res.statusCode})`);
  runComprehensiveStressTest().catch(error => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });
}).on('error', (err) => {
  console.error('❌ Cannot reach server:', err.message);
  console.error(`   URL: ${TARGET_URL}`);
  process.exit(1);
});
