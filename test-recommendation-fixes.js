/**
 * Test script to verify recommendation fixes
 * 
 * Tests:
 * 1. Conversation flow follows correct order (name → email → subject)
 * 2. Recommendations generated after 3 fields
 * 3. Multi-program results with boosting
 */

const API_URL = process.env.API_URL || 'https://stevie-na.onrender.com';

async function testConversationFlow() {
  console.log('=== Testing Conversation Flow ===\n');
  
  const sessionId = `test-${Date.now()}`;
  
  // Step 1: Start conversation with recommendation intent
  console.log('Step 1: User says they want recommendations');
  let response = await fetch(`${API_URL}/api/unified-chatbot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      message: 'I want to find award categories for my product'
    })
  });
  
  let text = await response.text();
  console.log('Response:', text.substring(0, 200));
  console.log('✓ Should ask for NAME first\n');
  
  // Step 2: Provide name
  console.log('Step 2: User provides name');
  response = await fetch(`${API_URL}/api/unified-chatbot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      message: 'My name is John Smith'
    })
  });
  
  text = await response.text();
  console.log('Response:', text.substring(0, 200));
  console.log('✓ Should ask for EMAIL second\n');
  
  // Step 3: Provide email
  console.log('Step 3: User provides email');
  response = await fetch(`${API_URL}/api/unified-chatbot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      message: 'john@techcompany.com'
    })
  });
  
  text = await response.text();
  console.log('Response:', text.substring(0, 200));
  console.log('✓ Should ask for NOMINATION SUBJECT third\n');
  
  // Step 4: Provide nomination subject
  console.log('Step 4: User provides nomination subject');
  response = await fetch(`${API_URL}/api/unified-chatbot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      message: 'I want to nominate our product'
    })
  });
  
  text = await response.text();
  console.log('Response:', text.substring(0, 300));
  console.log('✓ Should offer to generate recommendations\n');
  
  // Step 5: Confirm recommendations
  console.log('Step 5: User confirms they want recommendations');
  response = await fetch(`${API_URL}/api/unified-chatbot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      message: 'Yes please, our product is an AI-powered smart mirror that won top 5 in an ideathon competition'
    })
  });
  
  text = await response.text();
  console.log('Response length:', text.length);
  console.log('✓ Should generate recommendations with multiple programs\n');
  
  // Parse recommendations
  const lines = text.split('\n');
  const recommendationLines = lines.filter(line => line.includes('"type":"recommendations"'));
  
  if (recommendationLines.length > 0) {
    const recData = JSON.parse(recommendationLines[0].replace('data: ', ''));
    console.log('\n=== Recommendations Generated ===');
    console.log(`Total: ${recData.count} categories`);
    
    // Group by program
    const byProgram = {};
    recData.data.forEach(rec => {
      if (!byProgram[rec.program_name]) {
        byProgram[rec.program_name] = [];
      }
      byProgram[rec.program_name].push({
        category: rec.category_name,
        score: Math.round(rec.similarity_score * 1000) / 1000
      });
    });
    
    console.log('\nBy Program:');
    Object.keys(byProgram).forEach(program => {
      console.log(`\n${program}:`);
      byProgram[program].forEach(cat => {
        console.log(`  - ${cat.category} (score: ${cat.score})`);
      });
    });
    
    // Check if Technology Excellence is present
    const hasTechExcellence = Object.keys(byProgram).some(p => 
      p.includes('Technology Excellence')
    );
    
    if (hasTechExcellence) {
      console.log('\n✓ Technology Excellence categories found (boosting working!)');
    } else {
      console.log('\n✗ No Technology Excellence categories (boosting may not be applied)');
    }
    
    // Check similarity scores
    const allScores = recData.data.map(r => r.similarity_score);
    const avgScore = allScores.reduce((a, b) => a + b, 0) / allScores.length;
    const maxScore = Math.max(...allScores);
    
    console.log(`\nScore Stats:`);
    console.log(`  Average: ${Math.round(avgScore * 1000) / 1000}`);
    console.log(`  Max: ${Math.round(maxScore * 1000) / 1000}`);
    
    if (maxScore > 0.1) {
      console.log('  ✓ Scores look good (> 0.1)');
    } else {
      console.log('  ✗ Scores are low (< 0.1) - may need better embeddings');
    }
  } else {
    console.log('✗ No recommendations found in response');
  }
}

async function testDirectRecommendation() {
  console.log('\n\n=== Testing Direct Recommendation API ===\n');
  
  const context = {
    user_name: 'Test User',
    user_email: 'test@example.com',
    nomination_subject: 'product',
    description: 'AI-powered smart mirror with personal assistant features that won top 5 in an ideathon competition. Uses artificial intelligence and IoT technology for luxury consumer electronics market.',
    org_type: 'for_profit',
    org_size: 'small',
    achievement_focus: ['Artificial Intelligence', 'Product Innovation', 'Smart Technology', 'Consumer Electronics']
  };
  
  console.log('Context:', JSON.stringify(context, null, 2));
  
  const response = await fetch(`${API_URL}/api/recommendations/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(context)
  });
  
  const data = await response.json();
  
  console.log(`\nTotal recommendations: ${data.recommendations?.length || 0}`);
  
  if (data.recommendations && data.recommendations.length > 0) {
    // Group by program
    const byProgram = {};
    data.recommendations.forEach(rec => {
      if (!byProgram[rec.program_name]) {
        byProgram[rec.program_name] = [];
      }
      byProgram[rec.program_name].push({
        category: rec.category_name,
        score: Math.round(rec.similarity_score * 1000) / 1000
      });
    });
    
    console.log('\nTop 10 by Program:');
    Object.keys(byProgram).forEach(program => {
      console.log(`\n${program}:`);
      byProgram[program].slice(0, 5).forEach(cat => {
        console.log(`  - ${cat.category} (score: ${cat.score})`);
      });
    });
    
    // Check for Technology Excellence
    const techExcellence = data.recommendations.filter(r => 
      r.program_name.includes('Technology Excellence')
    );
    
    console.log(`\nTechnology Excellence categories: ${techExcellence.length}`);
    if (techExcellence.length > 0) {
      console.log('Top 3:');
      techExcellence.slice(0, 3).forEach(rec => {
        console.log(`  - ${rec.category_name} (score: ${Math.round(rec.similarity_score * 1000) / 1000})`);
      });
    }
  }
}

// Run tests
(async () => {
  try {
    await testConversationFlow();
    await testDirectRecommendation();
    
    console.log('\n\n=== Test Complete ===');
    console.log('\nNext Steps:');
    console.log('1. Verify conversation flow asks for name → email → subject');
    console.log('2. Check that recommendations include Technology Excellence');
    console.log('3. Verify similarity scores are reasonable (> 0.1)');
    console.log('4. If scores are low, run database/apply-fixes-and-boosting.sql');
  } catch (error) {
    console.error('Test failed:', error.message);
  }
})();
