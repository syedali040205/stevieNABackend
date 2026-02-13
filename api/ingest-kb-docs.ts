import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { documentManager } from './src/services/documentManager';

/**
 * Script to ingest KB documents from docs/ folder
 * 
 * Usage: npx ts-node ingest-kb-docs.ts
 */

interface MarkdownSection {
  title: string;
  content: string;
  level: number;
}

/**
 * Parse markdown into sections based on headers
 */
function parseMarkdown(content: string): MarkdownSection[] {
  const lines = content.split('\n');
  const sections: MarkdownSection[] = [];
  let currentSection: MarkdownSection | null = null;

  for (const line of lines) {
    // Check if line is a header
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    
    if (headerMatch) {
      // Save previous section
      if (currentSection && currentSection.content.trim()) {
        sections.push(currentSection);
      }
      
      // Start new section
      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();
      currentSection = { title, content: '', level };
    } else if (currentSection) {
      // Add line to current section
      currentSection.content += line + '\n';
    }
  }

  // Add last section
  if (currentSection && currentSection.content.trim()) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Ingest a single markdown file
 */
async function ingestMarkdownFile(filePath: string): Promise<void> {
  const fileName = path.basename(filePath, '.md');
  console.log(`\n📄 Processing: ${fileName}`);

  // Read file
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Parse into sections
  const sections = parseMarkdown(content);
  console.log(`   Found ${sections.length} sections`);

  // Ingest each section as a separate document
  let ingestedCount = 0;
  for (const section of sections) {
    try {
      // Skip very short sections
      if (section.content.trim().length < 50) {
        continue;
      }

      const title = `${fileName} - ${section.title}`;
      const documentContent = `# ${section.title}\n\n${section.content.trim()}`;

      await documentManager.ingestDocument({
        title,
        content: documentContent,
        program: 'general',
        category: 'kb_article',
        metadata: {
          source_file: fileName,
          section_title: section.title,
          section_level: section.level,
        },
      });

      ingestedCount++;
      console.log(`   ✅ Ingested: ${section.title}`);
      
      // Add delay to avoid rate limiting (100ms between documents)
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error: any) {
      console.error(`   ❌ Failed to ingest section "${section.title}": ${error.message}`);
      
      // If it's a circuit breaker error, wait longer and continue
      if (error.message.includes('temporarily unavailable') || error.message.includes('circuit')) {
        console.log(`   ⏳ Waiting 5 seconds before continuing...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  console.log(`   📊 Total ingested: ${ingestedCount}/${sections.length} sections`);
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting KB document ingestion...\n');

  const docsDir = path.join(__dirname, '..', 'docs');
  
  // Check if docs directory exists
  if (!fs.existsSync(docsDir)) {
    console.error('❌ docs/ directory not found!');
    process.exit(1);
  }

  // Get all .md files
  const files = fs.readdirSync(docsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(docsDir, f));

  if (files.length === 0) {
    console.error('❌ No .md files found in docs/ directory!');
    process.exit(1);
  }

  console.log(`Found ${files.length} markdown file(s):\n`);
  files.forEach(f => console.log(`  - ${path.basename(f)}`));

  // Ingest each file
  for (const file of files) {
    try {
      await ingestMarkdownFile(file);
    } catch (error: any) {
      console.error(`\n❌ Failed to process ${path.basename(file)}: ${error.message}`);
    }
  }

  console.log('\n✅ KB document ingestion complete!');
  console.log('\n📝 Next steps:');
  console.log('   1. Verify documents in Supabase: SELECT * FROM documents;');
  console.log('   2. Check Pinecone index stats');
  console.log('   3. Test Q&A: Ask a question in the chatbot');
}

// Run
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
