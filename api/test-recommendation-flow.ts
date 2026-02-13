import 'dotenv/config';
import { unifiedChatbotService } from './src/services/unifiedChatbotService';
import crypto from 'crypto';

/**
 * Test the simplified recommendation flow:
 * 1. User says "I want to nominate"
 * 2. Bot asks for name
 * 3. User provides name
 * 4. Bot asks for email
 * 5. User provides email
 * 6. Bot asks what they're nominating
 * 7. User says "team"
 * 8. Bot asks for achievement description
 * 9. User provides description
 * 10. Bot generates recommendations
 */
async function testRecommendationFlow() {
  console.log('🧪 Testing Simplified Recommendation Flow\n');
  
  const sessionId = crypto.randomUUID();
  // Test as anonymous user (no userId)
  
  const messages = [
    'I want to nominate',
    'Vinay',
    'vinay@example.com',
    'team',
    'We built an AI-powered smart mirror that won top 5 in an ideathon'
  ];
  
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`👤 USER (Message ${i + 1}): ${message}`);
    console.log('='.repeat(60));
    
    try {
      let botResponse = '';
      let hasRecommendations = false;
      
      for await (const chunk of unifiedChatbotService.chat(sessionId, message)) {
        if (chunk.type === 'intent') {
          console.log(`\n🎯 Context: ${chunk.intent} (confidence: ${chunk.confidence})`);
        } else if (chunk.type === 'chunk') {
          botResponse += chunk.content;
        } else if (chunk.type === 'recommendations') {
          hasRecommendations = true;
          console.log(`\n✨ Generated ${chunk.count} recommendations`);
          console.log('\nTop 3 categories:');
          chunk.data.slice(0, 3).forEach((rec: any, idx: number) => {
            console.log(`  ${idx + 1}. ${rec.category_name} (${Math.round(rec.similarity_score * 100)}%)`);
            console.log(`     Program: ${rec.program_name}`);
          });
        }
      }
      
      if (botResponse) {
        console.log(`\n🤖 BOT: ${botResponse}`);
      }
      
      if (hasRecommendations) {
        console.log('\n✅ Flow completed successfully!');
        break;
      }
      
      // Wait a bit between messages
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error: any) {
      console.error(`\n❌ Error: ${error.message}`);
      console.error(error.stack);
      break;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🏁 Test Complete');
  console.log('='.repeat(60));
}

// Run the test
testRecommendationFlow()
  .then(() => {
    console.log('\n✅ Test finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
