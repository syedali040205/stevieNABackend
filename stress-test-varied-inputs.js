/**
 * Comprehensive Stress Test with Varied Inputs
 * 
 * Tests complete flow with different:
 * - Nomination subjects (individual, team, organization, product)
 * - Organization types (for-profit, non-profit)
 * - Gender program preferences (yes, no, skip)
 * - Recognition scopes (US, global, both)
 * - Achievement descriptions (various industries)
 */

const https = require('https');

const TARGET_URL = 'https://stevienabackend.onrender.com';

// Test scenarios with varied inputs
const TEST_SCENARIOS = [
  {
    name: 'Tech Team - For-Profit - Global',
    inputs: {
      greeting: 'I want to nominate my team',
      name: 'Sarah Johnson',
      email: 'sarah.j@techcorp.com',
      org_type: 'for-profit',
      gender_programs: 'yes',
      scope: 'both',
      description: 'Our engineering team developed a revolutionary AI-powered analytics platform that increased data processing speed by 300% and reduced costs by 60%. The solution now serves 200+ enterprise clients globally.',
      impact: 'Generated $5M in new revenue and improved customer retention by 40%',
      innovation: 'First-to-market real-time AI analytics with predictive modeling',
    }
  },
  {
    name: 'Individual Leader - Non-Profit - US Only',
    inputs: {
      greeting: 'I need to nominate an individual',
      name: 'Michael Chen',
      email: 'mchen@nonprofit.org',
      org_type: 'non-profit',
      gender_programs: 'no',
      scope: 'us_only',
      description: 'Jane Smith led a community initiative that provided education to 10,000 underserved children, established 15 learning centers, and trained 200 volunteer teachers across 5 states.',
      impact: '95% of participants showed improved academic performance',
      innovation: 'Developed a peer-to-peer mentorship model that scaled rapidly',
    }
  },
  {
    name: 'Product Launch - For-Profit - US Only',
    inputs: {
      greeting: 'I want to nominate a product',
      name: 'David Martinez',
      email: 'david.m@startup.io',
      org_type: 'for-profit',
      gender_programs: 'skip',
      scope: 'us_only',
      description: 'We launched a sustainable packaging solution that reduces plastic waste by 80%. The product has been adopted by 50 major retailers and prevents 2 million pounds of plastic waste annually.',
      impact: 'Saved clients $3M in packaging costs while improving sustainability',
      innovation: 'Biodegradable material that maintains product freshness longer than plastic',
    }
  },
  {
    name: 'Organization - Non-Profit - Global',
    inputs: {
      greeting: 'I want to nominate our organization',
      name: 'Emily Rodriguez',
      email: 'emily@globalaid.org',
      org_type: 'non-profit',
      gender_programs: 'yes',
      scope: 'global',
      description: 'Our organization provided clean water access to 500,000 people in 12 countries, built 200 wells, and trained 1,000 local technicians for sustainable maintenance.',
      impact: 'Reduced waterborne diseases by 70% in served communities',
      innovation: 'Solar-powered water purification system with remote monitoring',
    }
  },
  {
    name: 'Sales Team - For-Profit - Global',
    inputs: {
      greeting: 'I want to nominate my sales team',
      name: 'Robert Kim',
      email: 'robert.k@salesforce.com',
      org_type: 'for-profit',
      gender_programs: 'no',
      scope: 'both',
      description: 'Our sales team exceeded targets by 250%, closed 500 new enterprise deals, and expanded into 15 new markets. They pioneered a consultative selling approach that became company standard.',
      impact: '$50M in new annual recurring revenue',
      innovation: 'AI-driven customer insights platform for personalized outreach',
    }
  },
];

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function sendMessage(sessionId, message, timeout = 45000) {
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
              // Ignore
            }
          }
        }
      });

      res.on('end', () => {
        const duration = Date.now() - startTime;
        const fullResponse = chunks.join('');
        
        resolve({
          success: res.statusCode === 200,
          response: fullResponse,
          duration,
          hasRecommendations: responseData.includes('"type":"recommendations"'),
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });

    req.write(data);
    req.end();
  });
}

async function runScenario(scenario, scenarioNum, totalScenarios) {
  const sessionId = generateUUID();
  const startTime = Date.now();
  
  console.log(`\n${'━'.repeat(80)}`);
  console.log(`SCENARIO ${scenarioNum}/${totalScenarios}: ${scenario.name}`);
  console.log(`${'━'.repeat(80)}`);
  console.log(`Session: ${sessionId}`);

  const results = {
    scenario: scenario.name,
    sessionId,
    success: false,
    steps: [],
    totalDuration: 0,
    error: null,
  };

  try {
    const inputs = scenario.inputs;

    // Step 1: Greeting
    console.log('\n[1/10] Greeting...');
    const s1 = await sendMessage(sessionId, inputs.greeting);
    results.steps.push({ step: 1, duration: s1.duration, success: s1.success });
    console.log(`   ✓ ${(s1.duration / 1000).toFixed(1)}s`);

    // Step 2: Name
    console.log('[2/10] Name...');
    const s2 = await sendMessage(sessionId, inputs.name);
    results.steps.push({ step: 2, duration: s2.duration, success: s2.success });
    console.log(`   ✓ ${(s2.duration / 1000).toFixed(1)}s`);

    // Step 3: Email
    console.log('[3/10] Email...');
    const s3 = await sendMessage(sessionId, inputs.email);
    results.steps.push({ step: 3, duration: s3.duration, success: s3.success });
    console.log(`   ✓ ${(s3.duration / 1000).toFixed(1)}s`);

    // Step 4: Org type
    console.log('[4/10] Organization type...');
    const s4 = await sendMessage(sessionId, inputs.org_type);
    results.steps.push({ step: 4, duration: s4.duration, success: s4.success });
    console.log(`   ✓ ${(s4.duration / 1000).toFixed(1)}s`);

    // Step 5: Gender programs
    console.log('[5/10] Gender programs...');
    const s5 = await sendMessage(sessionId, inputs.gender_programs);
    results.steps.push({ step: 5, duration: s5.duration, success: s5.success });
    console.log(`   ✓ ${(s5.duration / 1000).toFixed(1)}s`);

    // Step 6: Recognition scope
    console.log('[6/10] Recognition scope...');
    const s6 = await sendMessage(sessionId, inputs.scope);
    results.steps.push({ step: 6, duration: s6.duration, success: s6.success });
    console.log(`   ✓ ${(s6.duration / 1000).toFixed(1)}s`);

    // Step 7: Description
    console.log('[7/10] Description...');
    const s7 = await sendMessage(sessionId, inputs.description);
    results.steps.push({ step: 7, duration: s7.duration, success: s7.success });
    console.log(`   ✓ ${(s7.duration / 1000).toFixed(1)}s`);

    // Step 8: Impact follow-up
    console.log('[8/10] Impact follow-up...');
    const s8 = await sendMessage(sessionId, inputs.impact);
    results.steps.push({ step: 8, duration: s8.duration, success: s8.success, hasRecs: s8.hasRecommendations });
    console.log(`   ✓ ${(s8.duration / 1000).toFixed(1)}s`);

    if (!s8.hasRecommendations) {
      // Step 9: Innovation follow-up
      console.log('[9/10] Innovation follow-up...');
      const s9 = await sendMessage(sessionId, inputs.innovation);
      results.steps.push({ step: 9, duration: s9.duration, success: s9.success, hasRecs: s9.hasRecommendations });
      console.log(`   ✓ ${(s9.duration / 1000).toFixed(1)}s`);

      if (!s9.hasRecommendations) {
        // Step 10: Request recommendations
        console.log('[10/10] Requesting recommendations...');
        const s10 = await sendMessage(sessionId, 'Show me the categories', 60000);
        results.steps.push({ step: 10, duration: s10.duration, success: s10.success, hasRecs: s10.hasRecommendations });
        console.log(`   ✓ ${(s10.duration / 1000).toFixed(1)}s`);
        results.success = s10.hasRecommendations;
      } else {
        results.success = true;
      }
    } else {
      results.success = true;
    }

    results.totalDuration = Date.now() - startTime;
    
    if (results.success) {
      console.log(`\n✅ SUCCESS - Total: ${(results.totalDuration / 1000).toFixed(1)}s`);
    } else {
      console.log(`\n❌ FAILED - No recommendations generated`);
    }

  } catch (error) {
    results.error = error.message;
    results.totalDuration = Date.now() - startTime;
    console.log(`\n❌ ERROR: ${error.message}`);
  }

  return results;
}

async function runStressTest() {
  console.log('\n' + '='.repeat(80));
  console.log('🔥 COMPREHENSIVE STRESS TEST - VARIED INPUTS');
  console.log('='.repeat(80));
  console.log(`Target: ${TARGET_URL}`);
  console.log(`Scenarios: ${TEST_SCENARIOS.length}`);
  console.log(`Testing: Different nomination types, org types, and inputs\n`);

  const allResults = [];

  for (let i = 0; i < TEST_SCENARIOS.length; i++) {
    const result = await runScenario(TEST_SCENARIOS[i], i + 1, TEST_SCENARIOS.length);
    allResults.push(result);

    // Wait between scenarios
    if (i < TEST_SCENARIOS.length - 1) {
      console.log('\n⏳ Waiting 3 seconds before next scenario...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // Final summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('📊 FINAL RESULTS');
  console.log(`${'='.repeat(80)}\n`);

  const successful = allResults.filter(r => r.success);
  const failed = allResults.filter(r => !r.success);
  const successRate = (successful.length / allResults.length * 100).toFixed(1);

  console.log(`Success Rate: ${successRate}% (${successful.length}/${allResults.length})`);
  console.log(`Failed: ${failed.length}\n`);

  if (successful.length > 0) {
    const avgDuration = successful.reduce((sum, r) => sum + r.totalDuration, 0) / successful.length;
    console.log(`Average Duration: ${(avgDuration / 1000).toFixed(1)}s`);
    
    console.log(`\n✅ Successful Scenarios:`);
    successful.forEach(r => {
      console.log(`   • ${r.scenario}: ${(r.totalDuration / 1000).toFixed(1)}s`);
    });
  }

  if (failed.length > 0) {
    console.log(`\n❌ Failed Scenarios:`);
    failed.forEach(r => {
      console.log(`   • ${r.scenario}: ${r.error || 'No recommendations'}`);
    });
  }

  // Performance assessment
  console.log(`\n${'='.repeat(80)}`);
  console.log('🎯 ASSESSMENT');
  console.log(`${'='.repeat(80)}\n`);

  if (successRate >= 90) {
    console.log('✅ EXCELLENT: System handles varied inputs reliably');
  } else if (successRate >= 70) {
    console.log('⚠️  ACCEPTABLE: System works but has some issues');
  } else {
    console.log('❌ POOR: System struggles with varied inputs');
  }

  console.log(`\n📋 Tested Variations:`);
  console.log(`   ✓ Nomination types: individual, team, organization, product`);
  console.log(`   ✓ Org types: for-profit, non-profit`);
  console.log(`   ✓ Gender programs: yes, no, skip`);
  console.log(`   ✓ Scopes: US-only, global, both`);
  console.log(`   ✓ Industries: tech, non-profit, sustainability, sales\n`);
}

// Check server health
https.get(`${TARGET_URL}/api/health`, (res) => {
  console.log(`✅ Server is accessible (status: ${res.statusCode})`);
  runStressTest().catch(error => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });
}).on('error', (err) => {
  console.error('❌ Cannot reach server:', err.message);
  process.exit(1);
});
