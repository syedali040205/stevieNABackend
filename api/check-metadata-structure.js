/**
 * Check the exact metadata structure
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkMetadataStructure() {
  console.log('🔍 Checking metadata structure...\n');

  try {
    // Get a few categories with their full metadata
    const { data, error } = await supabase
      .from('stevie_categories')
      .select('id, category_name, metadata')
      .limit(3);

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    console.log('Sample categories with metadata:\n');
    data.forEach((cat, index) => {
      console.log(`${index + 1}. ${cat.category_name}`);
      console.log(`   ID: ${cat.id}`);
      console.log(`   Metadata:`, JSON.stringify(cat.metadata, null, 2));
      console.log('');
    });

    // Check if metadata column exists and is populated
    const { count } = await supabase
      .from('stevie_categories')
      .select('*', { count: 'exact', head: true })
      .not('metadata', 'is', null);

    console.log(`\nCategories with metadata: ${count} / 1348`);

    // Check org_types specifically
    console.log('\nChecking applicable_org_types values:');
    const { data: orgTypeData } = await supabase
      .from('stevie_categories')
      .select('category_name, metadata->applicable_org_types')
      .limit(5);

    orgTypeData?.forEach(cat => {
      console.log(`- ${cat.category_name}:`);
      console.log(`  ${JSON.stringify(cat.applicable_org_types)}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkMetadataStructure();
