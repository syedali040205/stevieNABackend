import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import { getSupabaseClient } from './src/config/supabase';
import { openaiService } from './src/services/openaiService';

/**
 * Batch KB ingestion script - processes in batches to avoid memory issues
 * 
 * Usage: npx ts-node ingest-kb-batch.ts
 */

const supabase = getSupabaseClient();
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pinecone.index(process.env.PINECONE_INDEX_NAME || 'stevie-kb-documents');

const BATCH_SIZE = 10; // Process 10 sections at a time

interface MarkdownSection {
  title: string;
  content: string;
  level: number;
}

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
    } else {
      // Content before first header - create a section for it
      if (line.trim()) {
        if (!currentSection) {
          currentSection = { title: 'Introduction', content: line + '\n', level: 1 };
        }
      }
    }
  }

  if (currentSection && currentSection.content.trim()) {
    sections.push(currentSection);
  }

  return sections.filter(s => s.content.trim().length >= 50);
}

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

async function ingestSection(fileName: string, section: MarkdownSection): Promise<boolean> {
  try {
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

    // 3. Generate embeddings (batch if possible)
    const embeddings: number[][] = [];
    for (const chunk of chunks) {
      const embedding = await openaiService.generateEmbedding(chunk);
      embeddings.push(embedding);
      await new Promise(resolve => setTimeout(resolve, 100)); // Rate limit protection
    }

    // 4. Upsert to Pinecone
    const vectors = embeddings.map((embedding, idx) => ({
      id: `${document.id}_chunk_${idx}`,
      values: embedding,
      metadata: {
        document_id: document.id,
        title: title,
        chunk_index: idx,
        chunk_text: chunks[idx],
        program: 'general',
        category: 'kb_article',
        content_type: 'kb_article',
        created_at: document.created_at,
        source_file: fileName,
        section_title: section.title,
      },
    }));

    await index.upsert(vectors as any);

    return true;
  } catch (error: any) {
    console.error(`   ❌ ${section.title}: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Starting batch KB document ingestion...\n');

  const docsDir = path.join(__dirname, '..', 'docs');
  
  if (!fs.existsSync(docsDir)) {
    console.error('❌ docs/ directory not found!');
    process.exit(1);
  }

  const files = fs.readdirSync(docsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => path.join(docsDir, f));

  if (files.length === 0) {
    console.error('❌ No .md files found!');
    process.exit(1);
  }

  console.log(`Found ${files.length} file(s)\n`);

  let totalIngested = 0;
  let totalSections = 0;

  for (const file of files) {
    const fileName = path.basename(file, '.md');
    console.log(`\n📄 ${fileName}`);

    const content = fs.readFileSync(file, 'utf-8');
    const sections = parseMarkdown(content);
    
    console.log(`   ${sections.length} sections to process`);
    totalSections += sections.length;

    // Process in batches
    for (let i = 0; i < sections.length; i += BATCH_SIZE) {
      const batch = sections.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(sections.length / BATCH_SIZE);
      
      console.log(`   Batch ${batchNum}/${totalBatches} (sections ${i + 1}-${Math.min(i + BATCH_SIZE, sections.length)})`);

      for (const section of batch) {
        const success = await ingestSection(fileName, section);
        if (success) {
          totalIngested++;
          process.stdout.write('.');
        } else {
          process.stdout.write('x');
        }
      }
      
      console.log(` ${batch.length} processed`);
      
      // Delay between batches
      if (i + BATCH_SIZE < sections.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`   ✅ ${totalIngested} sections ingested so far`);
  }

  console.log(`\n✅ Complete! ${totalIngested}/${totalSections} sections ingested`);
  console.log('\n📝 Next steps:');
  console.log('   1. Check: SELECT COUNT(*) FROM documents WHERE content_type = \'kb_article\';');
  console.log('   2. Test Q&A in chatbot');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
