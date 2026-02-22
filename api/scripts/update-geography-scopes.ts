import 'dotenv/config';
import { getSupabaseClient } from '../src/config/supabase';

/**
 * Update geographic_scope in metadata to use consistent values
 * 
 * Current values: ["Asia", "Pacific"], ["Middle East", "North Africa"]
 * New values: ["Asia-Pacific"], ["MENA"]
 * 
 * This makes it easier to map user input like "India" → "Asia-Pacific"
 */

async function updateGeographyScopes() {
  const supabase = getSupabaseClient();
  
  console.log('🗺️  Updating Geography Scopes in Metadata\n');
  console.log('='.repeat(80));
  
  // Get total count first
  const { count, error: countError } = await supabase
    .from('stevie_categories')
    .select('*', { count: 'exact', head: true });
  
  if (countError) {
    console.log('❌ Error counting categories:', countError.message);
    process.exit(1);
  }
  
  console.log(`📊 Total categories in database: ${count}\n`);
  
  // Fetch all categories in batches
  const batchSize = 1000;
  const categories: any[] = [];
  
  for (let offset = 0; offset < (count || 0); offset += batchSize) {
    console.log(`📥 Fetching batch ${Math.floor(offset / batchSize) + 1}/${Math.ceil((count || 0) / batchSize)}...`);
    
    const { data: batch, error: fetchError } = await supabase
      .from('stevie_categories')
      .select('id, category_name, metadata')
      .range(offset, offset + batchSize - 1);
    
    if (fetchError) {
      console.log('❌ Error fetching categories:', fetchError.message);
      process.exit(1);
    }
    
    categories.push(...(batch || []));
  }
  
  console.log(`✅ Fetched ${categories.length} categories\n`);
  
  let updatedCount = 0;
  let errors = 0;
  
  for (const category of categories) {
    const geoScope = category.metadata?.geographic_scope;
    
    if (!Array.isArray(geoScope)) {
      continue; // Skip if no geographic_scope
    }
    
    let newGeoScope = [...geoScope];
    let changed = false;
    
    // Replace ["Asia", "Pacific"] with ["Asia-Pacific"]
    if (geoScope.includes('Asia') && geoScope.includes('Pacific')) {
      newGeoScope = newGeoScope.filter(g => g !== 'Asia' && g !== 'Pacific');
      newGeoScope.push('Asia-Pacific');
      changed = true;
    } else if (geoScope.includes('Asia') && !geoScope.includes('Pacific')) {
      // Just "Asia" → "Asia-Pacific"
      newGeoScope = newGeoScope.map(g => g === 'Asia' ? 'Asia-Pacific' : g);
      changed = true;
    } else if (geoScope.includes('Pacific') && !geoScope.includes('Asia')) {
      // Just "Pacific" → "Asia-Pacific"
      newGeoScope = newGeoScope.map(g => g === 'Pacific' ? 'Asia-Pacific' : g);
      changed = true;
    }
    
    // Replace ["Middle East", "North Africa"] with ["MENA"]
    if (geoScope.includes('Middle East') && geoScope.includes('North Africa')) {
      newGeoScope = newGeoScope.filter(g => g !== 'Middle East' && g !== 'North Africa');
      newGeoScope.push('MENA');
      changed = true;
    } else if (geoScope.includes('Middle East') && !geoScope.includes('North Africa')) {
      // Just "Middle East" → "MENA"
      newGeoScope = newGeoScope.map(g => g === 'Middle East' ? 'MENA' : g);
      changed = true;
    } else if (geoScope.includes('North Africa') && !geoScope.includes('Middle East')) {
      // Just "North Africa" → "MENA"
      newGeoScope = newGeoScope.map(g => g === 'North Africa' ? 'MENA' : g);
      changed = true;
    }
    
    // Replace ["Germany", "Austria", "Switzerland"] with ["DACH"]
    if (geoScope.includes('Germany') && geoScope.includes('Austria') && geoScope.includes('Switzerland')) {
      newGeoScope = newGeoScope.filter(g => g !== 'Germany' && g !== 'Austria' && g !== 'Switzerland');
      newGeoScope.push('DACH');
      changed = true;
    }
    
    if (changed) {
      // Update the metadata
      const updatedMetadata = {
        ...category.metadata,
        geographic_scope: newGeoScope
      };
      
      const { error: updateError } = await supabase
        .from('stevie_categories')
        .update({ metadata: updatedMetadata })
        .eq('id', category.id);
      
      if (updateError) {
        console.log(`❌ Error updating ${category.category_name}:`, updateError.message);
        errors++;
      } else {
        console.log(`✅ Updated: ${category.category_name}`);
        console.log(`   Old: ${JSON.stringify(geoScope)}`);
        console.log(`   New: ${JSON.stringify(newGeoScope)}`);
        updatedCount++;
      }
    }
  }
  
  console.log('\n\n📊 SUMMARY');
  console.log('='.repeat(80));
  console.log(`✅ Updated: ${updatedCount} categories`);
  console.log(`❌ Errors: ${errors}`);
  console.log(`📝 Total: ${categories.length} categories`);
  
  console.log('\n\n🗺️  NEW GEOGRAPHY VALUES:');
  console.log('='.repeat(80));
  console.log('   - Global: Available worldwide');
  console.log('   - USA: United States only');
  console.log('   - Asia-Pacific: Asia-Pacific region (India, China, Japan, etc.)');
  console.log('   - MENA: Middle East & North Africa');
  console.log('   - DACH: Germany, Austria, Switzerland');
  
  console.log('\n\n💡 NEXT STEPS:');
  console.log('='.repeat(80));
  console.log('1. Update GeographyMapper to use these new values');
  console.log('2. Test with "India" → should now return Asia-Pacific categories');
  
  process.exit(0);
}

updateGeographyScopes().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
