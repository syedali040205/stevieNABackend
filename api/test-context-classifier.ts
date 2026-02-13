import 'dotenv/config';
import { contextClassifier } from './src/services/contextClassifier';

/**
 * Test script for context classifier
 * 
 * Usage: npx ts-node test-context-classifier.ts
 */

async function testContextClassifier() {
  console.log('🧪 Testing Context Classifier\n');

  const testCases = [
    {
      message: 'I would like to nominate myself',
      expected: 'recommendation',
      description: 'User wants to nominate themselves',
    },
    {
      message: 'I want to nominate',
      expected: 'recommendation',
      description: 'User wants to nominate (short form)',
    },
    {
      message: 'help me find categories',
      expected: 'recommendation',
      description: 'User wants category recommendations',
    },
    {
      message: 'what is the deadline?',
      expected: 'qa',
      description: 'User asking about deadline',
    },
    {
      message: 'how much does it cost?',
      expected: 'qa',
      description: 'User asking about fees',
    },
    {
      message: 'I want to find the right award for my product',
      expected: 'recommendation',
      description: 'User wants product recommendations',
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    try {
      const result = await contextClassifier.classifyContext({
        message: testCase.message,
        conversationHistory: [],
        currentContext: undefined,
        userContext: {},
      });

      const isCorrect = result.context === testCase.expected;
      const status = isCorrect ? '✅ PASS' : '❌ FAIL';

      console.log(`${status} - ${testCase.description}`);
      console.log(`   Message: "${testCase.message}"`);
      console.log(`   Expected: ${testCase.expected}`);
      console.log(`   Got: ${result.context} (confidence: ${result.confidence})`);
      console.log(`   Reasoning: ${result.reasoning}`);
      console.log('');

      if (isCorrect) {
        passed++;
      } else {
        failed++;
      }
    } catch (error: any) {
      console.log(`❌ ERROR - ${testCase.description}`);
      console.log(`   Message: "${testCase.message}"`);
      console.log(`   Error: ${error.message}`);
      console.log('');
      failed++;
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('✅ All tests passed!');
  } else {
    console.log('❌ Some tests failed');
    process.exit(1);
  }
}

// Run
testContextClassifier()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
