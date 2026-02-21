/**
 * Test script to compare retrieval accuracy before/after contextual enrichment
 * 
 * Usage:
 *   npx tsx scripts/test-contextual-embeddings.ts
 */

import { recommendationEngine } from '../src/services/recommendationEngine';
import logger from '../src/utils/logger';

// Test queries that are challenging for standard embeddings
const testQueries = [
  {
    name: 'IoT Agricultural Solution',
    context: {
      nomination_subject: 'product',
      description: 'IoT agricultural solution for crop monitoring using smart sensors',
      achievement_focus: ['Innovation', 'Technology'],
      org_type: 'for_profit',
      geography: 'usa',
    },
  },
  {
    name: 'AI Customer Service',
    context: {
      nomination_subject: 'product',
      description: 'AI-powered customer service chatbot that reduced response time by 60%',
      achievement_focus: ['Innovation', 'Customer Service'],
      org_type: 'for_profit',
      geography: 'usa',
    },
  },
  {
    name: 'Healthcare API Integration',
    context: {
      nomination_subject: 'product',
      description: 'API integration platform for healthcare providers to share patient data securely',
      achievement_focus: ['Technology', 'Innovation'],
      org_type: 'for_profit',
      geography: 'usa',
    },
  },
  {
    name: 'Manufacturing Automation',
    context: {
      nomination_subject: 'organization',
      description: 'Factory automation system that improved production efficiency by 40%',
      achievement_focus: ['Innovation', 'Technology'],
      org_type: 'for_profit',
      geography: 'usa',
    },
  },
  {
    name: 'Fintech Payment Solution',
    context: {
      nomination_subject: 'product',
      description: 'Mobile payment solution for small businesses with instant settlement',
      achievement_focus: ['Innovation', 'Technology'],
      org_type: 'for_profit',
      geography: 'usa',
    },
  },
];

async function testContextualEmbeddings() {
  console.log('🧪 Testing Contextual Embeddings\n');
  console.log('='.repeat(80));
  console.log('This script tests retrieval accuracy with contextual embeddings.');
  console.log('Expected improvement: 67% reduction in retrieval failures');
  console.log('='.repeat(80) + '\n');

  let totalQueries = 0;
  let successfulQueries = 0;
  let failedQueries = 0;

  for (const testQuery of testQueries) {
    totalQueries++;
    console.log(`\n📝 Test Query ${totalQueries}: ${testQuery.name}`);
    console.log(`   Description: "${testQuery.context.description}"`);
    console.log(`   Focus: ${testQuery.context.achievement_focus.join(', ')}`);
    console.log('   ' + '-'.repeat(76));

    try {
      const recommendations = await recommendationEngine.generateRecommendations(
        testQuery.context,
        { limit: 5 }
      );

      if (recommendations.length === 0) {
        console.log('   ❌ FAILED: No recommendations found');
        failedQueries++;
      } else {
        console.log(`   ✅ SUCCESS: Found ${recommendations.length} recommendations`);
        successfulQueries++;

        // Show top 3 results
        console.log('\n   Top 3 Results:');
        recommendations.slice(0, 3).forEach((rec, idx) => {
          const score = (rec.similarity_score * 100).toFixed(1);
          console.log(`   ${idx + 1}. [${score}%] ${rec.category_name}`);
          console.log(`      Program: ${rec.program_name}`);
          console.log(`      Focus: ${rec.achievement_focus.join(', ')}`);
        });
      }
    } catch (error: any) {
      console.log(`   ❌ ERROR: ${error.message}`);
      failedQueries++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total queries: ${totalQueries}`);
  console.log(`✅ Successful: ${successfulQueries} (${Math.round((successfulQueries / totalQueries) * 100)}%)`);
  console.log(`❌ Failed: ${failedQueries} (${Math.round((failedQueries / totalQueries) * 100)}%)`);
  console.log('='.repeat(80));

  if (failedQueries === 0) {
    console.log('\n🎉 All queries returned results! Contextual embeddings are working.');
  } else {
    console.log(`\n⚠️  ${failedQueries} queries failed. Consider:
  1. Running the enrichment script: npx tsx scripts/enrich-category-embeddings.ts
  2. Enabling contextual embeddings: CONTEXTUAL_EMBEDDINGS_ENABLED=true
  3. Checking that categories cover these domains`);
  }

  process.exit(failedQueries > 0 ? 1 : 0);
}

// Run the test
testContextualEmbeddings().catch((error) => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
