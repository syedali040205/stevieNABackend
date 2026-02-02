const axios = require('axios');

const testContext = {
  geography: 'worldwide',
  organization_name: 'Jyothishmathi Institute of Technology and Science',
  org_type: 'non_profit',
  org_size: 'medium',
  nomination_subject: 'team',
  description: `Our team at Jyothishmathi Institute of Technology and Science came together with a shared goal: to build a solution that addressed a real operational challenge, not just complete an academic requirement. We identified inefficiencies in existing workflows, aligned on a clear outcome, and executed the project like a business initiative — from problem discovery and planning to delivery and validation. Each member contributed across strategy, execution, and problem-solving, allowing us to move quickly while maintaining quality. The result was a working system that streamlined processes, reduced manual effort, and demonstrated measurable value to its users. What makes this team exceptional is our ability to collaborate across roles, adapt under pressure, and deliver results with limited resources — the same capabilities required to build successful products and organizations. This achievement reflects not only what we built, but how we worked together to make it happen.`,
  achievement_focus: ['innovation', 'teamwork', 'problem_solving', 'project_management', 'operational_excellence']
};

function formatUserQueryText(context) {
  const parts = [];
  
  if (context.organization_name && context.geography) {
    parts.push(`Organization: ${context.organization_name} in ${context.geography}.`);
  }
  
  const orgDetails = [];
  if (context.org_type) orgDetails.push(`Type: ${context.org_type}`);
  if (context.org_size) orgDetails.push(`Size: ${context.org_size}`);
  if (orgDetails.length > 0) parts.push(orgDetails.join(', ') + '.');
  
  if (context.nomination_subject) parts.push(`Nominating: ${context.nomination_subject}.`);
  if (context.description) parts.push(`Achievement: ${context.description}.`);
  if (context.achievement_focus?.length > 0) {
    parts.push(`Focus areas: ${context.achievement_focus.join(', ')}.`);
  }
  
  return parts.join(' ');
}

async function testEmbedding() {
  console.log('🧪 Testing Embedding Generation\n');
  console.log('Context:');
  console.log('  Geography:', testContext.geography);
  console.log('  Org Type:', testContext.org_type);
  console.log('  Org Size:', testContext.org_size);
  console.log('  Subject:', testContext.nomination_subject);
  console.log('  Focus:', testContext.achievement_focus.join(', '));
  
  const queryText = formatUserQueryText(testContext);
  console.log('\n📝 Formatted Query Text:');
  console.log(queryText);
  console.log(`\nLength: ${queryText.length} characters`);
  
  try {
    console.log('\n🔄 Calling Python AI Service...');
    const response = await axios.post(
      'http://localhost:8000/api/generate-embedding',
      {
        text: queryText,
        model: 'text-embedding-3-small'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'stevie-internal-key-2024-secure'
        },
        timeout: 30000
      }
    );
    
    console.log('\n✅ Embedding Generated Successfully!');
    console.log(`   Dimensions: ${response.data.embedding.length}`);
    console.log(`   Tokens Used: ${response.data.tokens_used}`);
    console.log(`   First 5 values: [${response.data.embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    
    console.log('\n🔍 What happens next in the flow:');
    console.log('   1. This embedding is passed to search_similar_categories()');
    console.log(`   2. With geography parameter: "${testContext.geography}"`);
    console.log('   3. Database function filters categories WHERE:');
    console.log('      - user_geography IS NULL (FALSE)');
    console.log(`      - OR user_geography = 'worldwide' (TRUE after fix)`);
    console.log(`      - OR user_geography = ANY(c.geographic_scope) (depends on category)`);
    console.log(`      - OR 'worldwide' = ANY(c.geographic_scope) (depends on category)`);
    console.log('\n   ⚠️  BEFORE FIX: Only matches categories with "worldwide" in scope');
    console.log('   ✅ AFTER FIX: Matches ALL categories when geography is "worldwide"');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Make sure Python AI service is running:');
      console.log('   cd ai-service');
      console.log('   python -m uvicorn app.main:app --reload --port 8000');
    }
  }
}

testEmbedding();
