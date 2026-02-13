/**
 * Test manual field enrichment patterns
 * 
 * Usage: npx tsx test-enrichment.ts
 */

// Test patterns
const testCases = [
  // company_age
  { input: '12 years', field: 'company_age', pattern: /(\d+)\s*(year|years|month|months|yr|yrs)/i },
  { input: '5 years', field: 'company_age', pattern: /(\d+)\s*(year|years|month|months|yr|yrs)/i },
  { input: '2 months', field: 'company_age', pattern: /(\d+)\s*(year|years|month|months|yr|yrs)/i },
  
  // career_stage
  { input: '5 years', field: 'career_stage', pattern: /(\d+)\s*(year|years|yr|yrs)/i },
  { input: '10 years', field: 'career_stage', pattern: /(\d+)\s*(year|years|yr|yrs)/i },
  
  // org_size
  { input: '3 people', field: 'org_size', pattern: /(\d+)\s*(people|peeps|person|employees|employee|members|member|staff)/i },
  { input: '5 peeps', field: 'org_size', pattern: /(\d+)\s*(people|peeps|person|employees|employee|members|member|staff)/i },
  { input: '10 employees', field: 'org_size', pattern: /(\d+)\s*(people|peeps|person|employees|employee|members|member|staff)/i },
];

console.log('🧪 Testing Field Enrichment Patterns\n');

let passed = 0;
let failed = 0;

for (const test of testCases) {
  const match = test.input.match(test.pattern);
  const success = match !== null;
  
  if (success) {
    console.log(`✅ ${test.field}: "${test.input}" → MATCHED`);
    passed++;
  } else {
    console.log(`❌ ${test.field}: "${test.input}" → FAILED`);
    failed++;
  }
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

// Test tech_orientation keyword matching
console.log('\n🔍 Testing tech_orientation keywords:\n');

const techTests = [
  { input: 'AI based', expected: 'AI/ML focused' },
  { input: 'artificial intelligence', expected: 'AI/ML focused' },
  { input: 'tech focused', expected: 'Technology-centric' },
  { input: 'tech central', expected: 'Technology-centric' },
  { input: 'minimal tech', expected: 'Minimal technology' },
  { input: 'not really', expected: 'Minimal technology' },
];

for (const test of techTests) {
  const lower = test.input.toLowerCase().trim();
  let result = null;
  
  if (lower.includes('ai') || lower.includes('artificial intelligence') || lower.includes('machine learning')) {
    result = 'AI/ML focused';
  } else if (lower.includes('tech') && (lower.includes('central') || lower.includes('core') || lower.includes('based') || lower.includes('focused'))) {
    result = 'Technology-centric';
  } else if (lower.includes('minimal') || lower.includes('not really') || lower.includes('not much')) {
    result = 'Minimal technology';
  }
  
  if (result === test.expected) {
    console.log(`✅ "${test.input}" → ${result}`);
  } else {
    console.log(`❌ "${test.input}" → Expected: ${test.expected}, Got: ${result}`);
  }
}

console.log('\n✅ Test complete!');
