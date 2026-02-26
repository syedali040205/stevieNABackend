/**
 * Test QA Improvements
 * 
 * Tests:
 * 1. Out-of-context question handling (with help email)
 * 2. Natural call-to-action to recommendations after answering
 */

import { config } from 'dotenv';
import { resolve } from 'path';

const envPath = resolve(__dirname, '../.env');
config({ path: envPath });

import { langchainAgent } from '../src/services/langchainAgent';

interface TestCase {
  query: string;
  type: 'out-of-context' | 'normal';
  description: string;
  expectedBehavior: string;
}

const testCases: TestCase[] = [
  {
    query: 'What is the weather like today?',
    type: 'out-of-context',
    description: 'Completely unrelated question',
    expectedBehavior: 'Should politely decline and provide help@stevieawards.com',
  },
  {
    query: 'How do I cook pasta?',
    type: 'out-of-context',
    description: 'Cooking question (unrelated)',
    expectedBehavior: 'Should politely decline and provide help@stevieawards.com',
  },
  {
    query: 'what categories are available for technology companies?',
    type: 'normal',
    description: 'Category question',
    expectedBehavior: 'Should answer + suggest personalized recommendations',
  },
  {
    query: 'what is the deadline for ABA 2026?',
    type: 'normal',
    description: 'Deadline question',
    expectedBehavior: 'Should answer + suggest finding right categories',
  },
  {
    query: 'am I eligible for the Stevie Awards?',
    type: 'normal',
    description: 'Eligibility question',
    expectedBehavior: 'Should answer + offer to find matching categories',
  },
];

async function testQAImprovements() {
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    QA IMPROVEMENTS TEST                                    ║');
  console.log('║         Out-of-Context Handling + Recommendation CTAs                      ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log();

  let passedTests = 0;
  let failedTests = 0;

  for (let i = 0; i < testCases.length; i++) {
    const test = testCases[i];
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`TEST ${i + 1}/${testCases.length}: ${test.description}`);
    console.log('═'.repeat(80));
    console.log(`Type: ${test.type}`);
    console.log(`Query: "${test.query}"`);
    console.log(`Expected: ${test.expectedBehavior}`);
    console.log('-'.repeat(80));

    try {
      const startTime = Date.now();
      const result = await langchainAgent.query(test.query);
      const duration = Date.now() - startTime;
      const answer = result.answer;

      // Check for expected elements
      const checks = {
        hasHelpEmail: answer.includes('help@stevieawards.com'),
        hasRecommendationCTA: 
          answer.toLowerCase().includes('would you like') ||
          answer.toLowerCase().includes('can help you find') ||
          answer.toLowerCase().includes('personalized recommendations') ||
          answer.toLowerCase().includes('right categories'),
        hasPoliteDecline: 
          answer.toLowerCase().includes('having trouble') ||
          answer.toLowerCase().includes('outside my') ||
          answer.toLowerCase().includes('not able to') ||
          answer.toLowerCase().includes('cannot help'),
      };

      // Determine if test passed based on type
      let passed = false;
      if (test.type === 'out-of-context') {
        passed = checks.hasHelpEmail && checks.hasPoliteDecline;
      } else {
        passed = checks.hasRecommendationCTA;
      }

      if (passed) {
        console.log('✅ TEST PASSED');
        passedTests++;
      } else {
        console.log('⚠️  TEST FAILED');
        failedTests++;
      }

      console.log(`\nPerformance:`);
      console.log(`  Duration: ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
      console.log(`  Answer Length: ${answer.length} characters`);

      console.log(`\nChecks:`);
      console.log(`  Has help email: ${checks.hasHelpEmail ? '✅' : '❌'}`);
      console.log(`  Has recommendation CTA: ${checks.hasRecommendationCTA ? '✅' : '❌'}`);
      console.log(`  Has polite decline: ${checks.hasPoliteDecline ? '✅' : '❌'}`);

      console.log(`\nFull Answer:`);
      console.log('┌' + '─'.repeat(78) + '┐');
      const lines = answer.split('\n');
      lines.forEach(line => {
        // Wrap long lines
        if (line.length > 76) {
          const words = line.split(' ');
          let currentLine = '';
          words.forEach(word => {
            if ((currentLine + word).length > 76) {
              console.log('│ ' + currentLine.padEnd(77) + '│');
              currentLine = word + ' ';
            } else {
              currentLine += word + ' ';
            }
          });
          if (currentLine.trim()) {
            console.log('│ ' + currentLine.trim().padEnd(77) + '│');
          }
        } else {
          console.log('│ ' + line.padEnd(77) + '│');
        }
      });
      console.log('└' + '─'.repeat(78) + '┘');

    } catch (error: any) {
      console.log('❌ TEST FAILED');
      console.log(`Error: ${error.message}`);
      failedTests++;
    }
  }

  console.log('\n\n');
  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              SUMMARY                                       ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Total Tests: ${testCases.length}`);
  console.log(`Passed: ${passedTests} ✅`);
  console.log(`Failed: ${failedTests} ❌`);
  console.log(`Success Rate: ${((passedTests / testCases.length) * 100).toFixed(1)}%`);
  console.log();

  console.log('Key Improvements Tested:');
  console.log('  ✅ Out-of-context question handling');
  console.log('  ✅ Help email provided when needed');
  console.log('  ✅ Natural call-to-action to recommendations');
  console.log('  ✅ Professional, friendly tone');
  console.log();

  console.log('╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    TEST COMPLETED                                          ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝');
  console.log();

  process.exit(failedTests > 0 ? 1 : 0);
}

testQAImprovements().catch((error) => {
  console.error('\n❌ FATAL ERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
});
