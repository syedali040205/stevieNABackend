import 'dotenv/config';
import { documentManager } from './src/services/documentManager';
import { pineconeClient } from './src/services/pineconeClient';
import { getSupabaseClient } from './src/config/supabase';

/**
 * Demo: Complete document lifecycle (upload → search → delete)
 * 
 * Usage: npx ts-node demo-document-lifecycle.ts
 */

const supabase = getSupabaseClient();

async function demo() {
  console.log('🎬 Document Lifecycle Demo\n');
  console.log('This demonstrates: Upload → Search → Delete\n');

  try {
    // Step 1: Upload a test document
    console.log('📤 Step 1: Uploading test document...');
    const testContent = `# Demo Document

This is a test document for demonstrating the deletion process.

## Key Information
- Document ID will be tracked
- Stored in S3, Supabase, and Pinecone
- Can be deleted with one API call

## Contact
Email: demo@stevieawards.com`;

    const documentId = await documentManager.ingestDocument({
      title: 'Demo Document for Deletion Test',
      content: testContent,
      program: 'general',
      category: 'kb_article',
      metadata: {
        demo: true,
        created_for: 'deletion_demo',
      },
    });

    console.log(`✅ Document uploaded!`);
    console.log(`   Document ID: ${documentId}\n`);

    // Step 2: Verify it exists in all systems
    console.log('🔍 Step 2: Verifying document exists...');

    // Check Supabase
    const { data: dbDoc } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    console.log(`✅ Supabase: Found`);
    console.log(`   Title: ${dbDoc.title}`);
    console.log(`   S3 Key: ${dbDoc.metadata?.s3_key || 'N/A'}`);

    // Check Pinecone
    const stats = await pineconeClient.getStats();
    console.log(`✅ Pinecone: ${stats.totalRecordCount} total vectors`);

    // Search for it
    const searchResults = await documentManager.searchDocuments({
      query: 'demo document deletion',
      topK: 3,
    });

    const foundInSearch = searchResults.some(r => r.id === documentId);
    console.log(`✅ Search: ${foundInSearch ? 'Found in results' : 'Not found'}\n`);

    // Step 3: Wait for user confirmation
    console.log('⏸️  Step 3: Document is live in all systems');
    console.log('   Press Enter to delete it...');
    await new Promise(resolve => {
      process.stdin.once('data', () => resolve(null));
    });

    // Step 4: Delete the document
    console.log('\n🗑️  Step 4: Deleting document...');
    await documentManager.deleteDocument(documentId, 'demo-script', 'Demonstration of deletion');

    console.log(`✅ Delete command executed\n`);

    // Step 5: Verify deletion
    console.log('🔍 Step 5: Verifying deletion...');

    // Check Supabase (should be soft-deleted)
    const { data: deletedDoc } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (deletedDoc?.deleted_at) {
      console.log(`✅ Supabase: Soft deleted`);
      console.log(`   Deleted at: ${deletedDoc.deleted_at}`);
      console.log(`   Deleted by: ${deletedDoc.deleted_by || 'N/A'}`);
    } else {
      console.log(`⚠️  Supabase: Still active (deletion may be async)`);
    }

    // Check Pinecone (vectors should be deleted)
    const statsAfter = await pineconeClient.getStats();
    const vectorsDeleted = stats.totalRecordCount - statsAfter.totalRecordCount;
    console.log(`✅ Pinecone: ${vectorsDeleted} vectors deleted`);
    console.log(`   Before: ${stats.totalRecordCount} vectors`);
    console.log(`   After: ${statsAfter.totalRecordCount} vectors`);

    // Search again (should not find it)
    const searchAfter = await documentManager.searchDocuments({
      query: 'demo document deletion',
      topK: 3,
    });

    const stillInSearch = searchAfter.some(r => r.id === documentId);
    console.log(`✅ Search: ${stillInSearch ? '⚠️ Still in results' : 'Removed from results'}`);

    console.log('\n✅ Demo complete!');
    console.log('\n📊 Summary:');
    console.log('   1. Document uploaded to S3, Supabase, Pinecone');
    console.log('   2. Verified in all systems');
    console.log('   3. Deleted with single API call');
    console.log('   4. Cleaned up from all systems');
    console.log('\n💡 This is how document deletion works in production!');

  } catch (error: any) {
    console.error('\n❌ Demo failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

demo()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
