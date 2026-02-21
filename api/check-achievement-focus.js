/**
 * Check what achievement_focus values exist in the database
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkAchievementFocus() {
  console.log('🔍 Checking achievement_focus values in database...\n');

  try {
    // Get all unique achievement_focus values
    const { data, error } = await supabase
      .from('stevie_categories')
      .select('metadata')
      .limit(100);

    if (error) {
      console.error('❌ Error:', error);
      return;
    }

    // Extract all unique focus values
    const focusSet = new Set();
    data.forEach(row => {
      if (row.metadata && row.metadata.achievement_focus) {
        row.metadata.achievement_focus.forEach(focus => {
          focusSet.add(focus);
        });
      }
    });

    console.log('Unique achievement_focus values:');
    console.log(Array.from(focusSet).sort());
    console.log(`\nTotal unique values: ${focusSet.size}`);

    // Check for sustainability/agriculture related
    const sustainabilityRelated = Array.from(focusSet).filter(f => 
      f.toLowerCase().includes('sustain') || 
      f.toLowerCase().includes('agricult') ||
      f.toLowerCase().includes('environment')
    );

    console.log('\n🌱 Sustainability/Agriculture related:');
    console.log(sustainabilityRelated);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkAchievementFocus();
