/**
 * Test org_type normalization
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testOrgTypeNormalization() {
  console.log('🔍 Testing org_type normalization...\n');

  try {
    // Test with underscore (what's in DB)
    const { data: underscoreData } = await supabase
      .from('stevie_categories')
      .select('id, category_name')
      .eq('metadata->>nomination_subject_type', 'company')
      .contains('metadata->applicable_org_types', ['non_profit'])
      .limit(5);

    console.log(`1. Query with "non_profit" (underscore): ${underscoreData?.length || 0} results`);
    if (underscoreData && underscoreData.length > 0) {
      console.log(`   ✅ Found: ${underscoreData[0].category_name}`);
    }

    // Test with hyphen (what TypeScript sends)
    const { data: hyphenData } = await supabase
      .from('stevie_categories')
      .select('id, category_name')
      .eq('metadata->>nomination_subject_type', 'company')
      .contains('metadata->applicable_org_types', ['non-profit'])
      .limit(5);

    console.log(`\n2. Query with "non-profit" (hyphen): ${hyphenData?.length || 0} results`);
    if (hyphenData && hyphenData.length > 0) {
      console.log(`   ✅ Found: ${hyphenData[0].category_name}`);
    } else {
      console.log(`   ❌ No results - this is the problem!`);
    }

    console.log('\n📝 Solution: SQL function will normalize "non-profit" → "non_profit"');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testOrgTypeNormalization();
