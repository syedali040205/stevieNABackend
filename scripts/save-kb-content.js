/**
 * Save KB Content from Clipboard
 * 
 * Usage: Paste your content, then press Ctrl+D (Unix) or Ctrl+Z then Enter (Windows)
 */

const fs = require('fs');
const path = require('path');

console.log('📝 Paste your KB content below, then press Ctrl+Z and Enter (Windows) or Ctrl+D (Unix):\n');

let content = '';

process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
  content += chunk;
});

process.stdin.on('end', () => {
  if (!content.trim()) {
    console.error('\n❌ No content provided');
    process.exit(1);
  }
  
  const outputPath = path.join(__dirname, 'stevie-kb-content.txt');
  fs.writeFileSync(outputPath, content, 'utf8');
  
  console.log(`\n✅ Content saved to: ${outputPath}`);
  console.log(`   Size: ${content.length} characters`);
  console.log(`   Lines: ${content.split('\n').length}`);
  console.log('\nNext step: npm run chunk-kb -- scripts/stevie-kb-content.txt');
});
