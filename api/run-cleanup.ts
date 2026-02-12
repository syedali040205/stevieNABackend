/**
 * Run cleanup script to remove kb_embeddings table and search_similar_content function
 * 
 * This script checks the database state and provides SQL to run in Supabase SQL Editor
 */

import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runCleanup() {
  console.log('🧹 Checking database state...\n');

  try {
    // Check if documents table exists
    console.log('1️⃣ Checking documents table...');
    const { error: docsError } = await supabase
      .from('documents')
      .select('id')
      .limit(1);

    if (docsError) {
      console.log('   ⚠️  documents table not found:', docsError.message);
    } else {
      console.log('   ✅ documents table exists');
    }

    // Check if stevie_categories table exists
    console.log('\n2️⃣ Checking stevie_categories table...');
    const { error: catError } = await supabase
      .from('stevie_categories')
      .select('id')
      .limit(1);

    if (catError) {
      console.log('   ⚠️  stevie_categories table not found:', catError.message);
    } else {
      console.log('   ✅ stevie_categories table exists (pgvector preserved)');
    }

    console.log('\n' + '='.repeat(70));
    console.log('📋 CLEANUP INSTRUCTIONS');
    console.log('='.repeat(70));
    console.log('\nSupabase requires SQL to be run via the SQL Editor.');
    console.log('\n🔗 Open Supabase SQL Editor:');
    console.log('   https://supabase.com/dashboard/project/azjuwdasjqbwpgpzsnue/sql/new\n');
    console.log('📝 Copy and paste this SQL:\n');
    console.log('-- ============================================');
    console.log('-- Cleanup: Remove kb_embeddings and search_similar_content');
    console.log('-- ============================================\n');
    console.log('-- Drop search_similar_content function (if exists)');
    console.log('DROP FUNCTION IF EXISTS search_similar_content CASCADE;\n');
    console.log('-- Drop kb_embeddings table (if exists)');
    console.log('DROP TABLE IF EXISTS kb_embeddings CASCADE;\n');
    console.log('-- Verify cleanup');
    console.log('SELECT table_name FROM information_schema.tables');
    console.log('WHERE table_schema = \'public\'');
    console.log('  AND table_name IN (\'kb_embeddings\', \'documents\', \'stevie_categories\');');
    console.log('-- Expected: documents and stevie_categories only\n');
    console.log('='.repeat(70));
    console.log('\n✅ After running the SQL, your database will be clean!');
    console.log('✅ documents table will remain (for Pinecone metadata)');
    console.log('✅ stevie_categories table will remain (for pgvector recommendations)');
    console.log('✅ kb_embeddings table will be removed (using Pinecone now)');
    console.log('✅ search_similar_content function will be removed (using Pinecone now)\n');

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

runCleanup();
