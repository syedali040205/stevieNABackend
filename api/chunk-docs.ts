import fs from 'fs';
import path from 'path';

/**
 * Split large markdown files into 1000-char chunks with 200-char overlap
 * 
 * Usage: npx ts-node chunk-docs.ts
 */

const CHUNK_SIZE = 1000; // characters
const OVERLAP = 200; // characters

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const chunk = text.substring(start, end);
    
    if (chunk.trim().length > 0) {
      chunks.push(chunk);
    }
    
    start = end - OVERLAP;
    if (start >= text.length) break;
  }
  
  return chunks;
}

function chunkMarkdownFile(inputPath: string, outputDir: string): void {
  const fileName = path.basename(inputPath, '.md');
  const content = fs.readFileSync(inputPath, 'utf-8');
  
  console.log(`\n📄 ${fileName}`);
  console.log(`   Size: ${content.length} chars`);
  
  const chunks = chunkText(content);
  
  console.log(`   Chunks: ${chunks.length}`);
  
  // Write chunks in batches to avoid memory issues
  const BATCH_SIZE = 10;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    
    batch.forEach((chunk, batchIndex) => {
      const index = i + batchIndex;
      const chunkFileName = `${fileName}_chunk${index + 1}.md`;
      const chunkPath = path.join(outputDir, chunkFileName);
      
      const chunkContent = `<!-- Source: ${fileName} | Chunk: ${index + 1}/${chunks.length} -->\n\n${chunk}`;
      
      fs.writeFileSync(chunkPath, chunkContent);
    });
    
    // Progress indicator
    if ((i + BATCH_SIZE) % 50 === 0) {
      process.stdout.write('.');
    }
  }
  
  console.log(`\n   ✅ Created ${chunks.length} chunk files`);
}

function main() {
  console.log('🚀 Chunking docs (1000 chars + 200 overlap)...\n');
  
  const docsDir = path.join(__dirname, '..', 'docs');
  const chunkedDir = path.join(docsDir, 'chunked');
  
  // Clean and recreate chunked directory
  if (fs.existsSync(chunkedDir)) {
    fs.rmSync(chunkedDir, { recursive: true });
  }
  fs.mkdirSync(chunkedDir);
  
  // Find markdown files (exclude test files)
  const files = fs.readdirSync(docsDir)
    .filter(f => f.endsWith('.md') && !f.startsWith('test'))
    .map(f => path.join(docsDir, f));
  
  if (files.length === 0) {
    console.error('❌ No markdown files found!');
    process.exit(1);
  }
  
  console.log(`Found ${files.length} file(s)\n`);
  
  let totalChunks = 0;
  
  for (const file of files) {
    chunkMarkdownFile(file, chunkedDir);
    const chunks = fs.readdirSync(chunkedDir).filter(f => 
      f.startsWith(path.basename(file, '.md'))
    );
    totalChunks += chunks.length;
  }
  
  console.log(`\n✅ Complete! ${totalChunks} total chunks created`);
  console.log(`\nSaved to: ${chunkedDir}`);
  console.log('\nNext: npx ts-node ingest-kb-batch.ts');
}

main();
