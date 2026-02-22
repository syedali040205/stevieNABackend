import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { getSupabaseClient } from '../src/config/supabase';

async function listCategories() {
  const supabase = getSupabaseClient();
  
  console.log('📊 Fetching all Stevie Award categories...\n');
  
  const { data: categories, error } = await supabase
    .from('stevie_categories')
    .select(`
      id,
      category_name,
      description,
      achievement_focus,
      stevie_programs (
        program_name
      )
    `)
    .order('category_name');
  
  if (error) {
    console.error('❌ Error:', error);
    return;
  }
  
  console.log(`✅ Found ${categories?.length || 0} categories\n`);
  
  // Group by achievement focus
  const byFocus: Record<string, any[]> = {};
  
  categories?.forEach(cat => {
    const focus = cat.achievement_focus?.[0] || 'Other';
    if (!byFocus[focus]) byFocus[focus] = [];
    byFocus[focus].push(cat);
  });
  
  // Display by focus area
  Object.keys(byFocus).sort().forEach(focus => {
    console.log(`\n🎯 ${focus} (${byFocus[focus].length} categories)`);
    console.log('='.repeat(80));
    
    byFocus[focus].slice(0, 5).forEach(cat => {
      console.log(`\n  📌 ${cat.category_name}`);
      console.log(`     Program: ${(cat.stevie_programs as any)?.program_name || 'N/A'}`);
      console.log(`     Description: ${cat.description?.substring(0, 100)}...`);
    });
    
    if (byFocus[focus].length > 5) {
      console.log(`\n  ... and ${byFocus[focus].length - 5} more`);
    }
  });
  
  // Search for social/humanitarian categories
  console.log('\n\n🔍 Searching for social impact / humanitarian categories...');
  console.log('='.repeat(80));
  
  const socialKeywords = ['social', 'humanitarian', 'community', 'charitable', 'responsibility', 'impact', 'healthcare', 'nonprofit', 'cause'];
  
  const socialCategories = categories?.filter(cat => {
    const text = `${cat.category_name} ${cat.description}`.toLowerCase();
    return socialKeywords.some(keyword => text.includes(keyword));
  });
  
  if (socialCategories && socialCategories.length > 0) {
    console.log(`\n✅ Found ${socialCategories.length} social impact related categories:\n`);
    socialCategories.forEach(cat => {
      console.log(`  • ${cat.category_name}`);
      console.log(`    ${cat.description?.substring(0, 150)}...`);
      console.log('');
    });
  } else {
    console.log('\n❌ No social impact / humanitarian categories found!');
    console.log('   Stevie Awards are primarily BUSINESS awards.');
  }
  
  process.exit(0);
}

listCategories();
