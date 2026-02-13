import 'dotenv/config';
import { pineconeClient } from './src/services/pineconeClient';

/**
 * Check if Pinecone is ready for ingestion
 * 
 * Usage: npx ts-node check-pinecone-ready.ts
 */

async function checkPineconeReady() {
  console.log('🔍 Checking Pinecone configuration...\n');

  try {
    // Check environment variables
    console.log('📋 Environment Variables:');
    console.log(`   PINECONE_API_KEY: ${process.env.PINECONE_API_KEY ? '✅ Set' : '❌ Missing'}`);
    console.log(`   PINECONE_INDEX_NAME: ${process.env.PINECONE_INDEX_NAME || '❌ Missing'}`);
    console.log(`   PINECONE_ENVIRONMENT: ${process.env.PINECONE_ENVIRONMENT || '❌ Missing'}`);
    console.log('');

    if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX_NAME) {
      console.log('❌ Missing required environment variables!');
      console.log('   Please check your .env file.');
      process.exit(1);
    }

    // Try to get index stats
    console.log('🔌 Testing Pinecone connection...');
    const stats = await pineconeClient.getStats();

    console.log('✅ Pinecone connection successful!\n');
    console.log('📊 Index Stats:');
    console.log(`   Total vectors: ${stats.totalRecordCount || 0}`);
    console.log(`   Dimension: ${stats.dimension || 'unknown'}`);
    console.log('');

    if (stats.totalRecordCount === 0) {
      console.log('ℹ️  Index is empty - ready for ingestion!');
      console.log('   Run: npx ts-node ingest-kb-docs.ts');
    } else {
      console.log(`ℹ️  Index already contains ${stats.totalRecordCount} vectors`);
      console.log('   You can still run ingestion to add more documents.');
    }

    console.log('\n✅ Pinecone is ready!');
  } catch (error: any) {
    console.error('\n❌ Pinecone check failed!');
    console.error(`   Error: ${error.message}`);
    console.error('');

    if (error.message.includes('Index') && error.message.includes('not found')) {
      console.error('💡 Solution: Create the Pinecone index first');
      console.error('   1. Go to https://app.pinecone.io/');
      console.error('   2. Click "Create Index"');
      console.error('   3. Use these settings:');
      console.error('      - Name: stevie-kb-documents');
      console.error('      - Dimensions: 1536');
      console.error('      - Metric: cosine');
      console.error('      - Cloud: AWS');
      console.error('      - Region: us-east-1');
    } else if (error.message.includes('API key')) {
      console.error('💡 Solution: Check your PINECONE_API_KEY in .env');
    } else {
      console.error('💡 Check the error message above for details');
    }

    process.exit(1);
  }
}

// Run
checkPineconeReady()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
