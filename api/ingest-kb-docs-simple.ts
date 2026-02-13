import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import { getSupabaseClient } from './src/config/supabase';
import { openaiService } from './src/services/openaiService';

/**
 * Simple KB ingestion script that bypasses circuit breaker
 * 
 * Usage: npx ts-node ingest-kb-docs-simple.ts
 */

interface MarkdownSection {
  title: string;
  content: string;
  level: number;
}

const supabase = getSupabaseClient();
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pinecone.index(process.env.PINECONE_INDEX_NAME || 'stevie-kb-documents');

/**
 * Parse markdown into sections based on headers
 */
function parseMarkdown(content: string): MarkdownSection[] {
  const lines = content.split('\n');
  const sections: MarkdownSection[] = [];
  let currentSection: MarkdownSection | null = null;

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
    
    if (headerMatch) {
      if (currentSection && currentSection.content.trim()) {
        sections.push(currentSection);
      }
      
      const level = headerMatch[1].length;
      const title = headerMatch[2].trim();
      currentSection = { title, content: '', level };
    } else if (currentSection) {
      currentSection.content += line + '\n';
    }
  }

  if (currentSection && currentSection.content.trim()) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Chunk text into smaller pieces
 */
function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.substring(start, end));
    start = end - overlap;
    
    if (start >= text.length) break;
  }

  return chunks;
}

/**
 * Ingest a single section
 */
async function ingestSection(
  fileName: string,
  section: MarkdownSection
): Promise<boolean> {
  try {
    // Skip very short sections
    if (section.content.trim().length < 50) {
      return false;
    }

    const title = `${fileName} - ${section.title}`;
    const documentContent = `# ${section.title}\n\n${section.content.trim()}`;

    // 1. Create document in Supabase
    const { data: document, error: dbError } = await supabase
      .from('documents')
      .insert({
        title,
        content: documentContent,
        content_type: 'kb_article',
        program: 'general',
        metadata: {
          source_file: fileName,
          section_title: section.title,
          section_level: section.level,
        },
      })
      .select()
      .single();

    if (dbError || !document) {
      throw new Error(`DB error: ${dbError?.message}`);
    }

    // 2. Chunk the content
    const chunks = chunkText(documentContent, 1000, 200);

    // 3. Generate embeddings
    const embeddings: number[][] = [];
    for (const chunk of chunks) {
      const embedding = await openaiService.generateEmbedding(chunk);
      embeddings.push(embedding);
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // 4. Upsert to Pinecone
    const vectors = embeddings.map((embedding, index) => ({
      id: `${document.id}_chunk_${index}`,
      values: embedding,
      metadata: {
        document_id: document.id,
        title: title,
        chunk_index: index,
        chunk_text: chunks[index],
        program: 'general',
        category: 'kb_article',
        content_type: 'kb_article',
        created_at: document.created_at,
        source_file: fileName,
        section_title: section.title,
      },
    }));

    await index.upsert(vectors as any);

    console.log(`   ✅ ${section.title} (${chunks.length} chunks)`);
    return true;
  } catch (error: any) {
    console.error(`   ❌ ${section.title}: ${error.message}`);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting KB document ingestion (simple mode)...\n');

  const docsDir = path.join(__dirname, '..', 'docs');
  
  if (!fs.existsSync(docsDir)) {
    console.error('❌ docs/ directory not found!');
    process.exit(1);
  }

  const files = fs.readdirSync(docsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(docsDir, f));

  if (files.length === 0) {
    console.error('❌ No .md files found in docs/ directory!');
    process.exit(1);
  }

  console.log(`Found ${files.length} markdown file(s):\n`);
  files.forEach(f => console.log(`  - ${path.basename(f)}`));
  console.log('');

  let totalIngested = 0;
  let totalSections = 0;

  for (const file of files) {
    const fileName = path.basename(file, '.md');
    console.log(`\n📄 Processing: ${fileName}`);

    const content = fs.readFileSync(file, 'utf-8');
    const sections = parseMarkdown(content);
    
    // Filter out short sections first
    const validSections = sections.filter(s => s.content.trim().length >= 50);
    
    console.log(`   Found ${validSections.length} valid sections (${sections.length} total)`);
    totalSections += validSections.length;

    let fileIngested = 0;
    for (let i = 0; i < validSections.length; i++) {
      const section = validSections[i];
      console.log(`   [${i + 1}/${validSections.length}] Processing: ${section.title.substring(0, 50)}...`);
      
      const success = await ingestSection(fileName, section);
      if (success) {
        fileIngested++;
        totalIngested++;
      }
      
      // Delay between sections to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Force garbage collection every 10 sections if available
      if (i % 10 === 0 && global.gc) {
        global.gc();
      }
    }

    console.log(`   📊 Ingested: ${fileIngested}/${validSections.length} sections`);
  }

  console.log(`\n✅ KB document ingestion complete!`);
  console.log(`   Total: ${totalIngested}/${totalSections} sections ingested`);
  console.log('\n📝 Next steps:');
  console.log('   1. Verify: SELECT COUNT(*) FROM documents WHERE content_type = \'kb_article\';');
  console.log('   2. Check Pinecone index stats');
  console.log('   3. Test Q&A in the chatbot');
}

// Run
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
