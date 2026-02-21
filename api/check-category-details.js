/**
 * Check category details to understand the data structure
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkCategoryDetails() {
  console.log('🔍 Checking category details...\n');

  try {
    // Get categories with "sustain" or "agricult" in name or description
    const { data, error } = await supabase
      .from('stevie_categories')
      .select('category_name, description, metadata')
      .or('category_name.ilike.%sustain%,category_name.ilike.%agricult%,description.ilike.%sustain%,description.ilike.%agricult%')
      .limit(10);

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    console.log(`Found ${data.length} sustainability/agriculture related categories:\n`);
    
    data.forEach((cat, index) => {
      console.log(`${index + 1}. ${cat.category_name}`);
      console.log(`   Description: ${cat.description.substring(0, 100)}...`);
      console.log(`   Metadata:`, JSON.stringify(cat.metadata, null, 2));
      console.log('');
    });

    // Also check non-profit eligible categories
    console.log('\n🏢 Checking non-profit eligible categories...\n');
    
    const { data: nonprofitData, error: nonprofitError } = await supabase
      .from('stevie_categories')
      .select('category_name, metadata')
      .contains('metadata', { applicable_org_types: ['non-profit'] })
      .limit(5);

    if (nonprofitError) {
      console.error('❌ Error:', nonprofitError);
      return;
    }

    console.log(`Found ${nonprofitData.length} non-profit eligible categories:\n`);
    nonprofitData.forEach((cat, index) => {
      console.log(`${index + 1}. ${cat.category_name}`);
      console.log(`   Org Types:`, cat.metadata.applicable_org_types);
      console.log(`   Focus:`, cat.metadata.achievement_focus);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkCategoryDetails();
