import 'dotenv/config';
import { documentManager } from './src/services/documentManager';
import { pineconeClient } from './src/services/pineconeClient';
import { getSupabaseClient } from './src/config/supabase';

/**
 * Quick demo: Upload and immediately delete a document
 * 
 * Usage: npx ts-node demo-delete-document.ts
 */

const supabase = getSupabaseClient();

async function quickDemo() {
  console.log('⚡ Quick Delete Demo\n');

  // Get initial stats
  const statsBefore = await pineconeClient.getStats();
  console.log(`📊 Initial state:`);
  console.log(`   Pinecone vectors: ${statsBefore.totalRecordCount}\n`);

  // Upload
  console.log('1️⃣ Uploading document...');
  const documentId = await documentManager.ingestDocument({
    title: 'Temporary Test Document',
    content: 'This document will be deleted immediately after creation.',
    program: 'general',
    category: 'kb_article',
  });
  console.log(`   ✅ Created: ${documentId}\n`);

  // Verify upload
  const statsAfterUpload = await pineconeClient.getStats();
  console.log(`2️⃣ After upload:`);
  console.log(`   Pinecone vectors: ${statsAfterUpload.totalRecordCount} (+${statsAfterUpload.totalRecordCount - statsBefore.totalRecordCount})\n`);

  // Delete
  console.log('3️⃣ Deleting document...');
  await documentManager.deleteDocument(documentId, 'demo', 'Quick demo');
  console.log(`   ✅ Deleted: ${documentId}\n`);

  // Verify deletion
  const statsAfterDelete = await pineconeClient.getStats();
  console.log(`4️⃣ After deletion:`);
  console.log(`   Pinecone vectors: ${statsAfterDelete.totalRecordCount} (-${statsAfterUpload.totalRecordCount - statsAfterDelete.totalRecordCount})`);

  // Check Supabase
  const { data: doc } = await supabase
    .from('documents')
    .select('deleted_at')
    .eq('id', documentId)
    .single();

  console.log(`   Supabase: ${doc?.deleted_at ? 'Soft deleted ✅' : 'Still active ⚠️'}\n`);

  console.log('✅ Demo complete!\n');
  console.log('💡 Key points:');
  console.log('   • One API call deletes from all systems');
  console.log('   • Supabase: Soft delete (can restore)');
  console.log('   • Pinecone: Hard delete (vectors removed)');
  console.log('   • S3: File deleted (if exists)');
}

quickDemo()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });
