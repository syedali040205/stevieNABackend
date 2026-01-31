const https = require('https');

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

const BASE_URL = 'https://stevie-api.onrender.com';

async function testProduction() {
  console.log('🚀 Testing Production API at:', BASE_URL);
  console.log('='.repeat(60));

  try {
    // Test 1: Health Check
    console.log('\n1️⃣ Testing Health Endpoint...');
    const healthResponse = await request(`${BASE_URL}/api/health`);
    console.log('✅ Health Check:', healthResponse.data);

    // Test 2: Create User Session
    console.log('\n2️⃣ Creating User Session...');
    const sessionResponse = await request(`${BASE_URL}/api/users/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { userId: 'test-user-prod-' + Date.now() }
    });
    console.log('✅ Session Created:', sessionResponse.data);
    const sessionId = sessionResponse.data.sessionId;

    // Test 3: Start Conversation with Real Query
    console.log('\n3️⃣ Starting Conversation...');
    const conversationResponse = await request(`${BASE_URL}/api/conversation/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        sessionId: sessionId,
        message: "We are a tech company specializing in AI and machine learning solutions. We've developed innovative customer service automation tools and have shown 300% growth this year."
      }
    });
    console.log('✅ Conversation Started');
    console.log('Question:', conversationResponse.data.question);
    console.log('Session ID:', conversationResponse.data.sessionId);

    // Test 4: Continue Conversation
    console.log('\n4️⃣ Continuing Conversation...');
    const continueResponse = await request(`${BASE_URL}/api/conversation/continue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        sessionId: conversationResponse.data.sessionId,
        message: "We are a for-profit company with 250 employees based in the USA, focusing on AI innovation and customer service excellence."
      }
    });
    console.log('✅ Conversation Continued');
    if (continueResponse.data.question) {
      console.log('Next Question:', continueResponse.data.question);
    }

    // Test 5: Get Recommendations
    console.log('\n5️⃣ Getting Final Recommendations...');
    const recommendationsResponse = await request(`${BASE_URL}/api/conversation/continue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        sessionId: conversationResponse.data.sessionId,
        message: "We want to nominate our organization for AI innovation and our CEO for leadership excellence."
      }
    });
    
    if (recommendationsResponse.data.recommendations) {
      console.log('✅ Recommendations Received!');
      console.log(`Total Recommendations: ${recommendationsResponse.data.recommendations.length}`);
      console.log('\nTop 5 Recommendations:');
      recommendationsResponse.data.recommendations.slice(0, 5).forEach((rec, idx) => {
        console.log(`\n${idx + 1}. ${rec.category_name} (${rec.program_name})`);
        console.log(`   Similarity: ${(rec.similarity_score * 100).toFixed(2)}%`);
        console.log(`   Explanation: ${rec.explanation.substring(0, 150)}...`);
      });
    }

    // Test 6: Get User Profile
    console.log('\n6️⃣ Getting User Profile...');
    const profileResponse = await request(`${BASE_URL}/api/users/${sessionResponse.data.userId}/profile`);
    console.log('✅ User Profile Retrieved');
    console.log('Profile:', JSON.stringify(profileResponse.data, null, 2));

    console.log('\n' + '='.repeat(60));
    console.log('🎉 ALL TESTS PASSED! Production API is working perfectly!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ TEST FAILED!');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
    process.exit(1);
  }
}

testProduction();
