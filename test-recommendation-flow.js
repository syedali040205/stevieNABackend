const axios = require('axios');

// Test data - simulating the user context after field extraction
const testContext = {
  geography: 'worldwide', // Default when no country in profile
  organization_name: 'Jyothishmathi Institute of Technology and Science',
  org_type: 'non_profit', // Educational institution
  org_size: 'medium',
  nomination_subject: 'team',
  description: `Our team at Jyothishmathi Institute of Technology and Science came together with a shared goal: to build a solution that addressed a real operational challenge, not just complete an academic requirement. We identified inefficiencies in existing workflows, aligned on a clear outcome, and executed the project like a business initiative — from problem discovery and planning to delivery and validation. Each member contributed across strategy, execution, and problem-solving, allowing us to move quickly while maintaining quality. The result was a working system that streamlined processes, reduced manual effort, and demonstrated measurable value to its users. What makes this team exceptional is our ability to collaborate across roles, adapt under pressure, and deliver results with limited resources — the same capabilities required to build successful products and organizations. This achievement reflects not only what we built, but how we worked together to make it happen.`,
  achievement_focus: [
    'innovation',
    'teamwork',
    'problem_solving',
    'project_management',
    'operational_excellence'
  ]
};

const API_URL = 'http://localhost:3000';
const AI_SERVICE_URL = 'http://localhost:8000';
const API_KEY = 'test-api-key-12345';

async function testRecommendationFlow() {
  console.log('🧪 Testing Recommendation Flow\n');
  console.log('=' .repeat(80));
  
  try {
    // Step 1: Generate embedding
    console.log('\n📊 Step 1: Generating user embedding...');
    console.log('Context:', JSON.stringify(testContext, null, 2));
    
    const embeddingResponse = await axios.post(
      `${AI_SERVICE_URL}/api/generate-embedding`,
      {
        text: formatUserQueryText(testContext),
        model: 'text-embedding-3-small'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'stevie-internal-key-2024-secure'
        }
      }
    );
    
    const embedding = embeddingResponse.data.embedding;
    console.log(`✅ Embedding generated: ${embedding.length} dimensions, ${embeddingResponse.data.tokens_used} tokens`);
    
    // Step 2: Test database function directly via Supabase
    console.log('\n🔍 Step 2: Testing similarity search with geography filter...');
    console.log(`Geography: "${testContext.geography}"`);
    
    // We'll use the Node API to test this since it has Supabase client
    const searchResponse = await axios.post(
      `${API_URL}/api/test/similarity-search`,
      {
        embedding: embedding,
        geography: testContext.geography,
        limit: 10
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        }
      }
    ).catch(error => {
      if (error.response?.status === 404) {
        console.log('⚠️  Test endpoint not available, will test via full recommendation flow');
        return null;
      }
      throw error;
    });
    
    if (searchResponse) {
      console.log(`✅ Similarity search returned ${searchResponse.data.results.length} results`);
      if (searchResponse.data.results.length > 0) {
        console.log('\nTop 3 matches:');
        searchResponse.data.results.slice(0, 3).forEach((result, i) => {
          console.log(`  ${i + 1}. ${result.category_name} (${result.program_name})`);
          console.log(`     Similarity: ${(result.similarity_score * 100).toFixed(2)}%`);
        });
      }
    }
    
    // Step 3: Test full recommendation engine
    console.log('\n🎯 Step 3: Testing full recommendation engine...');
    
    const recommendationResponse = await axios.post(
      `${API_URL}/api/test/recommendations`,
      {
        context: testContext,
        limit: 10,
        includeExplanations: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': API_KEY
        }
      }
    ).catch(error => {
      if (error.response?.status === 404) {
        console.log('⚠️  Test endpoint not available');
        console.log('\n💡 To test the full flow, you need to:');
        console.log('   1. Apply the SQL fix: scripts/fix-geography-filter.sql');
        console.log('   2. Use the frontend or create a test user session');
        return null;
      }
      throw error;
    });
    
    if (recommendationResponse) {
      const recommendations = recommendationResponse.data.recommendations;
      console.log(`✅ Recommendation engine returned ${recommendations.length} results`);
      
      if (recommendations.length > 0) {
        console.log('\n📋 Top 5 Recommendations:');
        recommendations.slice(0, 5).forEach((rec, i) => {
          console.log(`\n${i + 1}. ${rec.category_name}`);
          console.log(`   Program: ${rec.program_name} (${rec.program_code})`);
          console.log(`   Similarity: ${(rec.similarity_score * 100).toFixed(2)}%`);
          console.log(`   Geographic Scope: ${rec.geographic_scope.join(', ')}`);
          console.log(`   Org Types: ${rec.applicable_org_types.join(', ')}`);
        });
      } else {
        console.log('\n❌ NO RECOMMENDATIONS FOUND!');
        console.log('\n🔧 This confirms the bug. The geography filter is blocking all results.');
        console.log('   Geography value: "worldwide"');
        console.log('   Expected: Match ALL categories');
        console.log('   Actual: Only matching categories with "worldwide" in geographic_scope');
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Test completed!');
    console.log('\n📝 Next Steps:');
    console.log('   1. Run the SQL fix in Supabase SQL Editor:');
    console.log('      File: scripts/fix-geography-filter.sql');
    console.log('   2. Re-run this test to verify the fix works');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    
    console.log('\n💡 Manual Test Instructions:');
    console.log('   Since test endpoints are not available, test manually:');
    console.log('   1. Apply SQL fix: scripts/fix-geography-filter.sql in Supabase');
    console.log('   2. Use frontend to submit the team achievement description');
    console.log('   3. Check if recommendations are returned');
  }
}

// Helper function to format user query text (matches embeddingManager.ts)
function formatUserQueryText(context) {
  const parts = [];
  
  if (context.organization_name && context.geography) {
    parts.push(`Organization: ${context.organization_name} in ${context.geography}.`);
  } else if (context.organization_name) {
    parts.push(`Organization: ${context.organization_name}.`);
  } else if (context.geography) {
    parts.push(`Location: ${context.geography}.`);
  }
  
  const orgDetails = [];
  if (context.org_type) {
    orgDetails.push(`Type: ${context.org_type}`);
  }
  if (context.org_size) {
    orgDetails.push(`Size: ${context.org_size}`);
  }
  if (orgDetails.length > 0) {
    parts.push(orgDetails.join(', ') + '.');
  }
  
  if (context.nomination_subject) {
    parts.push(`Nominating: ${context.nomination_subject}.`);
  }
  
  if (context.description) {
    parts.push(`Achievement: ${context.description}.`);
  }
  
  if (context.achievement_focus && context.achievement_focus.length > 0) {
    parts.push(`Focus areas: ${context.achievement_focus.join(', ')}.`);
  }
  
  return parts.join(' ');
}

// Run the test
testRecommendationFlow();
