import 'dotenv/config';
import { unifiedChatbotService } from './src/services/unifiedChatbotService';

/**
 * Clear KB search cache
 * 
 * Run this after uploading new documents to ensure fresh results
 * 
 * Usage: npx tsx clear-kb-cache.ts
 */

async function clearCache() {
  console.log('🗑️  Clearing KB search cache...\n');

  try {
    const deletedCount = await unifiedChatbotService.invalidateKBCache();
    console.log(`✅ Cleared ${deletedCount} cached KB searches\n`);
    
    if (deletedCount === 0) {
      console.log('ℹ️  No cached searches found (cache was empty or Redis unavailable)');
    } else {
      console.log('📝 Next: Test Q&A queries - they will fetch fresh results from Pinecone');
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

clearCache()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
