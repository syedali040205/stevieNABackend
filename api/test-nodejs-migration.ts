/**
 * Test script to verify Node.js migration
 * 
 * Tests all new services to ensure they work correctly
 */

import { openaiService } from './src/services/openaiService';
import { intentClassifier } from './src/services/intentClassifier';
import { conversationManager } from './src/services/conversationManager';
import { fieldExtractor } from './src/services/fieldExtractor';

async function testOpenAIService() {
  console.log('\n🧪 Testing OpenAI Service...');
  
  try {
    // Test embedding generation
    const embedding = await openaiService.generateEmbedding('Hello world');
    console.log(`✅ Embedding generated: ${embedding.length} dimensions`);
    
    // Test chat completion
    const response = await openaiService.chatCompletion({
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say "test successful" in 2 words' }
      ],
      temperature: 0.0,
      maxTokens: 10,
    });
    console.log(`✅ Chat completion: "${response}"`);
    
    return true;
  } catch (error: any) {
    console.error(`❌ OpenAI Service failed: ${error.message}`);
    return false;
  }
}

async function testIntentClassifier() {
  console.log('\n🧪 Testing Intent Classifier...');
  
  try {
    const result = await intentClassifier.classifyIntent({
      message: 'What is the IBA program?',
      conversationHistory: [],
      userContext: {},
    });
    
    console.log(`✅ Intent classified: ${result.intent} (confidence: ${result.confidence})`);
    console.log(`   Reasoning: ${result.reasoning}`);
    
    return result.intent === 'question';
  } catch (error: any) {
    console.error(`❌ Intent Classifier failed: ${error.message}`);
    return false;
  }
}

async function testFieldExtractor() {
  console.log('\n🧪 Testing Field Extractor...');
  
  try {
    const result = await fieldExtractor.extractFields({
      message: 'I want to nominate our team for winning the innovation award',
      userContext: {},
    });
    
    console.log(`✅ Fields extracted:`, result);
    
    return Object.keys(result).length > 0;
  } catch (error: any) {
    console.error(`❌ Field Extractor failed: ${error.message}`);
    return false;
  }
}

async function testConversationManager() {
  console.log('\n🧪 Testing Conversation Manager...');
  
  try {
    let chunks = 0;
    let fullResponse = '';
    
    for await (const chunk of conversationManager.generateResponseStream({
      message: 'Hello',
      intent: { intent: 'greeting', confidence: 0.9 },
      conversationHistory: [],
      userContext: {},
      kbArticles: null,
    })) {
      chunks++;
      fullResponse += chunk;
    }
    
    console.log(`✅ Response generated: ${chunks} chunks`);
    console.log(`   Response: "${fullResponse.substring(0, 100)}..."`);
    
    return chunks > 0;
  } catch (error: any) {
    console.error(`❌ Conversation Manager failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Testing Node.js Migration\n');
  console.log('=' .repeat(50));
  
  const results = {
    openai: await testOpenAIService(),
    intent: await testIntentClassifier(),
    fields: await testFieldExtractor(),
    conversation: await testConversationManager(),
  };
  
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Test Results:');
  console.log(`   OpenAI Service: ${results.openai ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Intent Classifier: ${results.intent ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Field Extractor: ${results.fields ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Conversation Manager: ${results.conversation ? '✅ PASS' : '❌ FAIL'}`);
  
  const allPassed = Object.values(results).every(r => r);
  
  if (allPassed) {
    console.log('\n🎉 All tests passed! Migration successful.');
    console.log('\n✨ You can now:');
    console.log('   1. Start the API: npm run dev');
    console.log('   2. Test the chatbot endpoint');
    console.log('   3. Remove the Python service (ai-service/)');
  } else {
    console.log('\n⚠️  Some tests failed. Check the errors above.');
  }
  
  process.exit(allPassed ? 0 : 1);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
