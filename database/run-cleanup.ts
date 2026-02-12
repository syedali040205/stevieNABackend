/**
 * Run cleanup script to remove kb_embeddings table and search_similar_content function
 * 
 * This script executes the SQL cleanup via Supabase client
 */

import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '..', 'api', '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runCleanup() {
  console.log('🧹 Starting database cleanup...\n');

  try {
    // Step 1: Check if kb_embeddings table exists
    console.log('1️⃣ Checking for kb_embeddings table...');
    const { data: kbTable, error: kbError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'kb_embeddings')
      .single();

    if (kbError && kbError.code !== 'PGRST116') {
      console.log('   ℹ️  kb_embeddings table does not exist (already clean)');
    } else if (kbTable) {
      console.log('   ⚠️  kb_embeddings table found - will be dropped');
    }

    // Step 2: Drop search_similar_content function
    console.log('\n2️⃣ Dropping search_similar_content function...');
    const { error: funcError } = await supabase.rpc('exec_sql', {
      sql: 'DROP FUNCTION IF EXISTS search_similar_content CASCADE;'
    });

    if (funcError) {
      // Try alternative approach - direct SQL execution
      console.log('   ℹ️  Using alternative method...');
      const { error: altError } = await supabase
        .from('_sql')
        .select('*')
        .limit(0); // This won't work, but we'll use raw SQL below
      
      // Note: Supabase doesn't allow arbitrary SQL execution via client
      // We'll need to use the SQL editor in Supabase dashboard
      console.log('   ⚠️  Cannot execute DROP FUNCTION via client');
      console.log('   📝 Please run this SQL in Supabase SQL Editor:');
      console.log('      DROP FUNCTION IF EXISTS search_similar_content CASCADE;');
    } else {
      console.log('   ✅ Function dropped successfully');
    }

    // Step 3: Drop kb_embeddings table
    console.log('\n3️⃣ Dropping kb_embeddings table...');
    // Note: We can't drop tables via Supabase client either
    console.log('   ⚠️  Cannot execute DROP TABLE via client');
    console.log('   📝 Please run this SQL in Supabase SQL Editor:');
    console.log('      DROP TABLE IF EXISTS kb_embeddings CASCADE;');

    // Step 4: Verify documents table exists
    console.log('\n4️⃣ Verifying documents table exists...');
    const { data: docsTable, error: docsError } = await supabase
      .from('documents')
      .select('id')
      .limit(1);

    if (docsError) {
      console.log('   ⚠️  documents table not found:', docsError.message);
    } else {
      console.log('   ✅ documents table exists');
    }

    // Step 5: Verify stevie_categories table exists
    console.log('\n5️⃣ Verifying stevie_categories table exists...');
    const { data: catTable, error: catError } = await supabase
      .from('stevie_categories')
      .select('id')
      .limit(1);

    if (catError) {
      console.log('   ⚠️  stevie_categories table not found:', catError.message);
    } else {
      console.log('   ✅ stevie_categories table exists (pgvector preserved)');
    }

    console.log('\n' + '='.repeat(70));
    console.log('📋 MANUAL CLEANUP REQUIRED');
    console.log('='.repeat(70));
    console.log('\nSupabase does not allow DDL operations via the client API.');
    console.log('Please run the following SQL in your Supabase SQL Editor:\n');
    console.log('1. Go to: https://supabase.com/dashboard/project/azjuwdasjqbwpgpzsnue/sql');
    console.log('2. Copy and paste the SQL from: NA/database/cleanup-kb-embeddings.sql');
    console.log('3. Click "Run" to execute the cleanup\n');
    console.log('Or run these commands directly:\n');
    console.log('-- Drop function');
    console.log('DROP FUNCTION IF EXISTS search_similar_content CASCADE;\n');
    console.log('-- Drop table');
    console.log('DROP TABLE IF EXISTS kb_embeddings CASCADE;\n');
    console.log('='.repeat(70));

  } catch (error: any) {
    console.error('\n❌ Error during cleanup:', error.message);
    process.exit(1);
  }
}

runCleanup();
