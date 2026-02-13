import 'dotenv/config';
import { unifiedChatbotService } from './src/services/unifiedChatbotService';
import crypto from 'crypto';

/**
 * Test chatbot RAG flow end-to-end
 * 
 * Usage: npx tsx test-chatbot-rag.ts
 */

async function testChatbotRAG() {
  console.log('🤖 Testing Chatbot RAG Flow\n');

  const sessionId = crypto.randomUUID();
  const testMessage = 'what are stevie awards';

  console.log(`Session ID: ${sessionId}`);
  console.log(`Message: "${testMessage}"\n`);

  try {
    console.log('Sending message to chatbot...\n');
    
    let intentReceived = false;
    let chunksReceived = 0;
    let fullResponse = '';

    for await (const event of unifiedChatbotService.chat(sessionId, testMessage)) {
      if (event.type === 'intent') {
        intentReceived = true;
        console.log(`✅ Intent: ${event.intent} (confidence: ${event.confidence})`);
      } else if (event.type === 'chunk') {
        chunksReceived++;
        fullResponse += event.content;
        process.stdout.write(event.content);
      } else if (event.type === 'status') {
        console.log(`\n📊 Status: ${event.message}`);
      }
    }

    console.log('\n\n📊 Summary:');
    console.log(`   Intent received: ${intentReceived}`);
    console.log(`   Chunks received: ${chunksReceived}`);
    console.log(`   Response length: ${fullResponse.length} chars`);
    console.log(`\n📝 Full response:\n${fullResponse}`);

    // Check if response contains KB info
    const hasKBInfo = fullResponse.toLowerCase().includes('stevie awards') || 
                      fullResponse.toLowerCase().includes('business awards') ||
                      fullResponse.toLowerCase().includes('2002');
    
    const hasNoInfo = fullResponse.toLowerCase().includes("don't have") ||
                      fullResponse.toLowerCase().includes("don't know") ||
                      fullResponse.toLowerCase().includes('stevieawards.com');

    console.log(`\n🔍 Analysis:`);
    console.log(`   Contains KB info: ${hasKBInfo}`);
    console.log(`   Says "no info": ${hasNoInfo}`);

    if (hasKBInfo && !hasNoInfo) {
      console.log('\n✅ RAG IS WORKING! Chatbot used KB articles.');
    } else if (hasNoInfo) {
      console.log('\n❌ RAG NOT WORKING! Chatbot says it has no info.');
      console.log('   This means KB articles are not being passed to the LLM.');
    } else {
      console.log('\n⚠️  UNCLEAR - Check response manually.');
    }

  } catch (error: any) {
    console.error('\n💥 Error:', error.message);
    console.error(error.stack);
  }
}

testChatbotRAG()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
