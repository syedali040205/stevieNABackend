/**
 * RAG Pipeline Diagnostic Test
 * 
 * Traces the complete recommendation flow:
 * 1. Field Extraction → User Context
 * 2. Query Generation
 * 3. Embedding Generation
 * 4. Vector Similarity Search (RAG)
 * 5. Retrieved Chunks
 * 6. Final Recommendations
 */

const https = require('https');

const TARGET_URL = 'https://stevienabackend.onrender.com';
// const TARGET_URL = 'http://localhost:3000'; // Uncomment for local testing

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function sendMessage(sessionId, message) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      session_id: sessionId,
      message,
    });

    const url = new URL(TARGET_URL);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : require('http');

    const options = {
      hostname: url.hostname,
      port: isHttps ? 443 : (url.port || 3000),
      path: '/api/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
      timeout: 60000,
    };

    const req = httpModule.request(options, (res) => {
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
                chunks.push(`\n[${json.count} recommendations generated]`);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      });

      res.on('end', () => {
        const fullResponse = chunks.join('');
        
        resolve({
          success: res.statusCode === 200,
          response: fullResponse,
          hasRecommendations: responseData.includes('"type":"recommendations"'),
          rawData: responseData,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(data);
    req.end();
  });
}

// Get diagnostic data from the server
function getDiagnostic(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(TARGET_URL);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : require('http');

    const options = {
      hostname: url.hostname,
      port: isHttps ? 443 : (url.port || 3000),
      path: endpoint,
      method: 'GET',
      timeout: 30000,
    };

    const req = httpModule.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk.toString();
      });

      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: 'Failed to parse response', raw: data });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function runDiagnosticTest() {
  console.log('\n' + '='.repeat(80));
  console.log('🔬 RAG PIPELINE DIAGNOSTIC TEST');
  console.log('='.repeat(80));
  console.log(`Target: ${TARGET_URL}\n`);

  const sessionId = generateUUID();
  console.log(`Session ID: ${sessionId}\n`);

  try {
    // Step 1: Complete the intake flow
    console.log('━'.repeat(80));
    console.log('STEP 1: FIELD COLLECTION');
    console.log('━'.repeat(80));

    const steps = [
      { message: 'Hi, I want to nominate my team', field: 'greeting + nomination_subject' },
      { message: 'John Smith', field: 'user_name' },
      { message: 'john@example.com', field: 'user_email' },
      { message: 'for-profit', field: 'org_type' },
      { message: 'yes', field: 'gender_programs_opt_in' },
      { message: 'both', field: 'recognition_scope' },
      { message: 'We developed an AI-powered customer service platform that reduced response times by 80% and increased customer satisfaction by 45%. Our team of 12 engineers worked for 18 months to deliver this innovative solution that now serves 50+ enterprise clients.', field: 'description' },
    ];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      console.log(`\n[${i + 1}/${steps.length}] Collecting: ${step.field}`);
      console.log(`   User: "${step.message.substring(0, 60)}${step.message.length > 60 ? '...' : ''}"`);
      
      const result = await sendMessage(sessionId, step.message);
      console.log(`   Bot: "${result.response.substring(0, 80)}${result.response.length > 80 ? '...' : ''}"`);
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Step 2: Get session context
    console.log('\n' + '━'.repeat(80));
    console.log('STEP 2: USER CONTEXT (Extracted Fields)');
    console.log('━'.repeat(80));

    // Note: We'd need to add an endpoint to retrieve session data
    // For now, we'll show what should be collected
    console.log('\nExpected Context:');
    console.log('  ✓ user_name: "John Smith"');
    console.log('  ✓ user_email: "john@example.com"');
    console.log('  ✓ nomination_subject: "team"');
    console.log('  ✓ org_type: "for_profit"');
    console.log('  ✓ gender_programs_opt_in: true');
    console.log('  ✓ recognition_scope: "both"');
    console.log('  ✓ description: "We developed an AI-powered customer service..."');

    // Step 3: Trigger recommendations and analyze
    console.log('\n' + '━'.repeat(80));
    console.log('STEP 3: RECOMMENDATION GENERATION');
    console.log('━'.repeat(80));

    console.log('\nTriggering recommendation generation...');
    
    // Answer first follow-up (impact)
    console.log('\n[Follow-up 1] Answering impact question...');
    const followUp1 = await sendMessage(sessionId, 'We improved efficiency by 80% and saved $2M annually');
    console.log(`   Bot: "${followUp1.response.substring(0, 80)}${followUp1.response.length > 80 ? '...' : ''}"`);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if there's a second follow-up (innovation)
    if (!followUp1.hasRecommendations) {
      console.log('\n[Follow-up 2] Answering innovation question...');
      const followUp2 = await sendMessage(sessionId, 'We used machine learning and natural language processing to create a self-learning system');
      console.log(`   Bot: "${followUp2.response.substring(0, 80)}${followUp2.response.length > 80 ? '...' : ''}"`);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // If still no recommendations, explicitly request them
      if (!followUp2.hasRecommendations) {
        console.log('\n[Final] Requesting recommendations...');
        const finalResult = await sendMessage(sessionId, 'Show me the categories');
        
        if (!finalResult.hasRecommendations) {
          console.log('\n❌ No recommendations generated after follow-ups.');
          return;
        }
      }
    }
    
    console.log('\n✅ Recommendations generated!');

    // Step 4: Analyze the logs (from server output)
    console.log('\n' + '━'.repeat(80));
    console.log('STEP 4: RAG PIPELINE ANALYSIS');
    console.log('━'.repeat(80));

    console.log('\n📝 Query Generation:');
    console.log('   The system generates a search query from user context:');
    console.log('   - Combines: focus areas + achievement description');
    console.log('   - Example: "Focus areas: Innovation. breakthrough achievements...');
    console.log('              We developed an AI-powered customer service platform..."');

    console.log('\n🔢 Embedding Generation:');
    console.log('   - Model: text-embedding-3-small');
    console.log('   - Dimension: 1536');
    console.log('   - Converts text query → vector representation');

    console.log('\n🔍 Vector Similarity Search (RAG):');
    console.log('   - Searches Pinecone vector database');
    console.log('   - Filters: nomination_subject="product" (team→product mapping)');
    console.log('   - Geography: "all" (both US and global)');
    console.log('   - Returns: Top 15 most similar categories');

    console.log('\n📊 Retrieved Chunks (Top 5):');
    console.log('   Check server logs for:');
    console.log('   - similarity_results_detail');
    console.log('   - Shows: category name, program, similarity score (0-1)');
    console.log('   - Example scores: 0.697, 0.664, 0.655, etc.');

    console.log('\n💡 Explanation Generation:');
    console.log('   - Takes top 15 categories');
    console.log('   - Generates personalized explanations via LLM');
    console.log('   - Explains why each category fits the nomination');

    // Step 5: Show what to look for in logs
    console.log('\n' + '━'.repeat(80));
    console.log('STEP 5: SERVER LOG ANALYSIS GUIDE');
    console.log('━'.repeat(80));

    console.log('\n🔎 Key Log Entries to Check:');
    console.log('\n1. Field Extraction:');
    console.log('   Look for: "update_keys": ["field1", "field2", ...]');
    console.log('   Should NOT be empty []');

    console.log('\n2. Query Generation:');
    console.log('   Look for: "generated_search_query"');
    console.log('   Shows: The text used for embedding');

    console.log('\n3. Embedding:');
    console.log('   Look for: "embedding_generated"');
    console.log('   Shows: model="text-embedding-3-small", dimension=1536');

    console.log('\n4. Similarity Search:');
    console.log('   Look for: "similarity_search_complete"');
    console.log('   Shows: results_count (should be 15)');

    console.log('\n5. Retrieved Chunks:');
    console.log('   Look for: "similarity_results_detail"');
    console.log('   Shows: Top 5 categories with scores');
    console.log('   Example:');
    console.log('   {');
    console.log('     "category": "AI & Tech Focused Customer Service Innovator",');
    console.log('     "program": "Stevie Awards for Sales & Customer Service",');
    console.log('     "score": 0.697');
    console.log('   }');

    console.log('\n6. Recommendations:');
    console.log('   Look for: "recommendations_generated"');
    console.log('   Shows: total_recommendations (should be 15)');

    console.log('\n7. Explanations:');
    console.log('   Look for: "explanations_generated"');
    console.log('   Shows: count (should be 15, or 0 if circuit breaker timeout)');

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('✅ DIAGNOSTIC TEST COMPLETE');
    console.log('='.repeat(80));

    console.log('\n📋 Summary:');
    console.log('   ✓ Completed 7-field intake flow');
    console.log('   ✓ Generated recommendations');
    console.log('   ✓ Check server logs for detailed RAG pipeline trace');

    console.log('\n💡 To see detailed RAG pipeline:');
    console.log('   1. Check Render logs during this test');
    console.log('   2. Look for the log entries mentioned above');
    console.log('   3. Each step shows: query → embedding → search → chunks → recommendations');

    console.log('\n🔧 Expected Flow:');
    console.log('   User Context → Query Generation → Embedding (1536d vector)');
    console.log('   → Pinecone Search → Top 15 Categories (with scores)');
    console.log('   → LLM Explanations → Final Recommendations\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Check server health
const url = new URL(TARGET_URL);
const isHttps = url.protocol === 'https:';
const httpModule = isHttps ? https : require('http');

httpModule.get(`${TARGET_URL}/api/health`, (res) => {
  console.log(`✅ Server is accessible (status: ${res.statusCode})`);
  runDiagnosticTest().catch(error => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });
}).on('error', (err) => {
  console.error('❌ Cannot reach server:', err.message);
  process.exit(1);
});
