/**
 * Test User's Specific Queries
 */

import { qaAgent } from '../src/services/qaAgent';

async function testUserQueries() {
  console.log('\n╔════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    USER QUERY TESTS                                        ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

  const queries = [
    'WHERE WAS SAWIB 25 held',
    'WHERE WAS MENA 25 HELD',
    'WHERE WAS SATE 26 GOING TO HELD',
    'WHAT IS THE JUDGING CRITERIA',
    'HOW TO ENTER STEVIE AWARDS',
  ];

  for (const query of queries) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Query: "${query}"`);
    console.log(`${'='.repeat(80)}\n`);

    try {
      const startTime = Date.now();
      const answer = await qaAgent.query(query);
      const duration = Date.now() - startTime;

      console.log(`✅ SUCCESS (${duration}ms)\n`);
      console.log(`Answer:\n${answer}\n`);
    } catch (error: any) {
      console.log(`❌ FAILED\n`);
      console.log(`Error: ${error.message}\n`);
    }
  }

  process.exit(0);
}

testUserQueries().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
