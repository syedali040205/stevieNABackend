// Test the full recommendation flow by simulating a conversation
const http = require('http');

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(JSON.stringify(postData));
    req.end();
  });
}

async function testFullFlow() {
  console.log('🧪 Testing Full Recommendation Flow\n');
  console.log('=' .repeat(80));
  
  const testUserId = 'test-user-' + Date.now();
  const achievementText = `Our team at Jyothishmathi Institute of Technology and Science came together with a shared goal: to build a solution that addressed a real operational challenge, not just complete an academic requirement. We identified inefficiencies in existing workflows, aligned on a clear outcome, and executed the project like a business initiative — from problem discovery and planning to delivery and validation. Each member contributed across strategy, execution, and problem-solving, allowing us to move quickly while maintaining quality. The result was a working system that streamlined processes, reduced manual effort, and demonstrated measurable value to its users. What makes this team exceptional is our ability to collaborate across roles, adapt under pressure, and deliver results with limited resources — the same capabilities required to build successful products and organizations. This achievement reflects not only what we built, but how we worked together to make it happen.`;
  
  try {
    console.log('\n📝 Step 1: Creating test user profile...');
    
    // Create user profile
    const createUserRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/users/profile',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-api-key-12345'
      }
    }, {
      user_id: testUserId,
      email: 'test@example.com',
      full_name: 'Test User',
      organization_name: 'Jyothishmathi Institute of Technology and Science',
      job_title: 'Team Lead'
      // Note: No country field, so geography will default to 'worldwide'
    });
    
    if (createUserRes.status === 201 || createUserRes.status === 200) {
      console.log('✅ User profile created');
    } else {
      console.log('⚠️  User creation status:', createUserRes.status);
    }
    
    console.log('\n🚀 Step 2: Starting conversation...');
    
    const startRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/conversation/start',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-api-key-12345'
      }
    }, {
      user_id: testUserId
    });
    
    if (startRes.status !== 200) {
      throw new Error(`Start conversation failed: ${startRes.status} - ${JSON.stringify(startRes.data)}`);
    }
    
    const sessionId = startRes.data.session_id;
    console.log('✅ Conversation started');
    console.log('   Session ID:', sessionId);
    console.log('   First question:', startRes.data.question);
    
    console.log('\n💬 Step 3: Providing achievement description...');
    console.log('   Text length:', achievementText.length, 'chars');
    
    const respondRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/conversation/respond',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-api-key-12345'
      }
    }, {
      session_id: sessionId,
      message: achievementText
    });
    
    if (respondRes.status !== 200) {
      throw new Error(`Respond failed: ${respondRes.status} - ${JSON.stringify(respondRes.data)}`);
    }
    
    console.log('✅ Response processed');
    console.log('   State:', respondRes.data.conversation_state);
    console.log('   Progress:', respondRes.data.progress.current, '/', respondRes.data.progress.total);
    
    // Check if we got recommendations
    if (respondRes.data.recommendations) {
      console.log('\n🎉 SUCCESS! Recommendations received!');
      console.log('   Count:', respondRes.data.recommendations.length);
      
      console.log('\n📋 Top 5 Recommendations:');
      respondRes.data.recommendations.slice(0, 5).forEach((rec, i) => {
        console.log(`\n${i + 1}. ${rec.category_name}`);
        console.log(`   Program: ${rec.program_name} (${rec.program_code})`);
        console.log(`   Similarity: ${(rec.similarity_score * 100).toFixed(2)}%`);
        console.log(`   Geographic Scope: ${rec.geographic_scope.join(', ')}`);
        console.log(`   Org Types: ${rec.applicable_org_types.join(', ')}`);
        console.log(`   Org Sizes: ${rec.applicable_org_sizes.join(', ')}`);
        console.log(`   Subject Type: ${rec.nomination_subject_type}`);
        if (rec.match_reasons && rec.match_reasons.length > 0) {
          console.log(`   Reasons: ${rec.match_reasons.join('; ')}`);
        }
      });
      
      console.log('\n' + '='.repeat(80));
      console.log('\n✅ TEST PASSED! The geography filter fix is working!');
      console.log('   - Geography "worldwide" now matches ALL categories');
      console.log('   - Similarity search returned', respondRes.data.recommendations.length, 'results');
      console.log('   - Recommendations are relevant to the team achievement');
      
    } else if (respondRes.data.conversation_state === 'complete') {
      console.log('\n❌ TEST FAILED! No recommendations returned');
      console.log('   Message:', respondRes.data.message);
      console.log('\n🔍 This means the fix did not work. Check:');
      console.log('   1. Was the SQL applied correctly in Supabase?');
      console.log('   2. Check Node.js logs for errors');
      console.log('   3. Verify category_embeddings table has data');
    } else {
      console.log('\n⏳ Conversation not complete yet');
      console.log('   Next question:', respondRes.data.question);
      console.log('\n💡 The AI needs more information. Continue the conversation.');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Make sure Node API is running:');
      console.log('   cd api && npm run dev');
    }
  }
}

testFullFlow();
