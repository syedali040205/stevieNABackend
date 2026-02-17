/**
 * Load Test Script for Stevie Awards Chatbot
 * Tests 1500 concurrent users hitting the API
 */

const https = require('https');
const { performance } = require('perf_hooks');

const BASE_URL = 'https://stevienabackend.onrender.com';
const CONCURRENT_USERS = 1500;
const REQUESTS_PER_USER = 5; // Each user sends 3 messages

// Test scenarios
const TEST_MESSAGES = [
  'Hi, I want to nominate myself',
  'What are the Stevie Awards?',
  'Help me find a good nomination category',
  'I want to nominate my team',
  'Tell me about the nomination process',
];

// Generate random session ID
function generateSessionId() {
  return `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

// Make a single request
function makeRequest(sessionId, message) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      sessionId,
      message,
    });

    const options = {
      hostname: 'stevienabackend.onrender.com',
      port: 443,
      path: '/api/unified-chatbot',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
      timeout: 30000, // 30 second timeout
    };

    const startTime = performance.now();
    
    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        resolve({
          statusCode: res.statusCode,
          duration,
          success: res.statusCode === 200,
        });
      });
    });

    req.on('error', (error) => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      resolve({
        statusCode: 0,
        duration,
        success: false,
        error: error.message,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      resolve({
        statusCode: 0,
        duration,
        success: false,
        error: 'Timeout',
      });
    });

    req.write(data);
    req.end();
  });
}

// Simulate a single user
async function simulateUser(userId) {
  const sessionId = generateSessionId();
  const results = [];

  for (let i = 0; i < REQUESTS_PER_USER; i++) {
    const message = TEST_MESSAGES[Math.floor(Math.random() * TEST_MESSAGES.length)];
    
    try {
      const result = await makeRequest(sessionId, message);
      results.push(result);
      
      // Wait a bit between messages (simulate human behavior)
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      results.push({
        statusCode: 0,
        duration: 0,
        success: false,
        error: error.message,
      });
    }
  }

  return results;
}

// Run load test
async function runLoadTest() {
  console.log(`\n🚀 Starting load test...`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`Concurrent users: ${CONCURRENT_USERS}`);
  console.log(`Requests per user: ${REQUESTS_PER_USER}`);
  console.log(`Total requests: ${CONCURRENT_USERS * REQUESTS_PER_USER}\n`);

  const startTime = performance.now();

  // Create all user simulations
  const userPromises = [];
  for (let i = 0; i < CONCURRENT_USERS; i++) {
    userPromises.push(simulateUser(i));
    
    // Log progress every 100 users
    if ((i + 1) % 100 === 0) {
      console.log(`Spawned ${i + 1}/${CONCURRENT_USERS} users...`);
    }
  }

  console.log(`\n⏳ All users spawned. Waiting for responses...\n`);

  // Wait for all users to complete
  const allResults = await Promise.all(userPromises);
  
  const endTime = performance.now();
  const totalDuration = (endTime - startTime) / 1000; // Convert to seconds

  // Flatten results
  const flatResults = allResults.flat();

  // Calculate statistics
  const totalRequests = flatResults.length;
  const successfulRequests = flatResults.filter(r => r.success).length;
  const failedRequests = totalRequests - successfulRequests;
  const successRate = (successfulRequests / totalRequests * 100).toFixed(2);

  const durations = flatResults.filter(r => r.success).map(r => r.duration);
  const avgDuration = durations.length > 0 
    ? (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2)
    : 0;
  
  const sortedDurations = durations.sort((a, b) => a - b);
  const p50 = sortedDurations[Math.floor(sortedDurations.length * 0.5)] || 0;
  const p95 = sortedDurations[Math.floor(sortedDurations.length * 0.95)] || 0;
  const p99 = sortedDurations[Math.floor(sortedDurations.length * 0.99)] || 0;
  const maxDuration = sortedDurations[sortedDurations.length - 1] || 0;

  const requestsPerSecond = (totalRequests / totalDuration).toFixed(2);

  // Status code breakdown
  const statusCodes = {};
  flatResults.forEach(r => {
    statusCodes[r.statusCode] = (statusCodes[r.statusCode] || 0) + 1;
  });

  // Error breakdown
  const errors = {};
  flatResults.filter(r => !r.success && r.error).forEach(r => {
    errors[r.error] = (errors[r.error] || 0) + 1;
  });

  // Print results
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 LOAD TEST RESULTS`);
  console.log(`${'='.repeat(60)}\n`);

  console.log(`⏱️  Total Duration: ${totalDuration.toFixed(2)}s`);
  console.log(`📨 Total Requests: ${totalRequests}`);
  console.log(`✅ Successful: ${successfulRequests} (${successRate}%)`);
  console.log(`❌ Failed: ${failedRequests}`);
  console.log(`🚀 Requests/sec: ${requestsPerSecond}\n`);

  console.log(`⚡ Response Times (ms):`);
  console.log(`   Average: ${avgDuration}ms`);
  console.log(`   P50 (median): ${p50.toFixed(2)}ms`);
  console.log(`   P95: ${p95.toFixed(2)}ms`);
  console.log(`   P99: ${p99.toFixed(2)}ms`);
  console.log(`   Max: ${maxDuration.toFixed(2)}ms\n`);

  console.log(`📋 Status Codes:`);
  Object.entries(statusCodes).sort().forEach(([code, count]) => {
    const percentage = (count / totalRequests * 100).toFixed(2);
    console.log(`   ${code}: ${count} (${percentage}%)`);
  });

  if (Object.keys(errors).length > 0) {
    console.log(`\n⚠️  Errors:`);
    Object.entries(errors).sort((a, b) => b[1] - a[1]).forEach(([error, count]) => {
      const percentage = (count / totalRequests * 100).toFixed(2);
      console.log(`   ${error}: ${count} (${percentage}%)`);
    });
  }

  console.log(`\n${'='.repeat(60)}\n`);

  // Performance assessment
  if (successRate >= 99) {
    console.log(`✅ EXCELLENT: ${successRate}% success rate`);
  } else if (successRate >= 95) {
    console.log(`✅ GOOD: ${successRate}% success rate`);
  } else if (successRate >= 90) {
    console.log(`⚠️  ACCEPTABLE: ${successRate}% success rate`);
  } else {
    console.log(`❌ POOR: ${successRate}% success rate - needs optimization`);
  }

  if (avgDuration < 1000) {
    console.log(`✅ FAST: Average response time ${avgDuration}ms`);
  } else if (avgDuration < 3000) {
    console.log(`⚠️  ACCEPTABLE: Average response time ${avgDuration}ms`);
  } else {
    console.log(`❌ SLOW: Average response time ${avgDuration}ms - needs optimization`);
  }

  console.log();
}

// Run the test
runLoadTest().catch(console.error);
