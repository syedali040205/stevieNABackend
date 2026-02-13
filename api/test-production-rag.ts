import 'dotenv/config';

/**
 * Test production RAG without Redis
 * Simulates production environment
 * 
 * Usage: npx tsx test-production-rag.ts
 */

async function testProductionRAG() {
  console.log('🌐 Testing Production RAG (No Redis)\n');

  // Temporarily disable Redis to simulate production
  const originalRedisUrl = process.env.REDIS_URL;
  process.env.REDIS_URL = 'redis://invalid-host:6379';

  try {
    const { unifiedChatbotService } = await import('./src/services/unifiedChatbotService');
    const crypto = await import('crypto');

    const sessionId = crypto.randomUUID();
    const testMessage = 'what are stevie awards';

    console.log(`Session: ${sessionId}`);
    console.log(`Message: "${testMessage}"\n`);

    let fullResponse = '';
    let kbUsed = false;

    for await (const event of unifiedChatbotService.chat(sessionId, testMessage)) {
      if (event.type === 'intent') {
        console.log(`✅ Context: ${event.intent}`);
      } else if (event.type === 'chunk') {
        fullResponse += event.content;
        process.stdout.write(event.content);
      }
    }

    console.log('\n\n📊 Analysis:');
    
    // Check if response contains KB info
    const hasKBInfo = fullResponse.toLowerCase().includes('2002') ||
                      fullResponse.toLowerCase().includes('premier business awards') ||
                      fullResponse.toLowerCase().includes('world\'s premier');
    
    const hasNoInfo = fullResponse.toLowerCase().includes("don't have specific information") ||
                      fullResponse.toLowerCase().includes("don't know");

    console.log(`   Contains KB info: ${hasKBInfo}`);
    console.log(`   Says no info: ${hasNoInfo}`);

    if (hasKBInfo) {
      console.log('\n✅ RAG IS WORKING! Production will work fine without Redis.');
      console.log('   Redis is only for caching (performance), not required for RAG.');
    } else if (hasNoInfo) {
      console.log('\n❌ RAG NOT WORKING! Check Pinecone vectors.');
    }

  } catch (error: any) {
    console.error('\n💥 Error:', error.message);
  } finally {
    // Restore Redis URL
    process.env.REDIS_URL = originalRedisUrl;
  }
}

testProductionRAG()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
