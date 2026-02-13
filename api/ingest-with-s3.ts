import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Pinecone } from '@pinecone-database/pinecone';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSupabaseClient } from './src/config/supabase';
import OpenAI from 'openai';

/**
 * Ingest KB documents with S3 storage
 * 
 * Usage: npx ts-node ingest-with-s3.ts
 */

const supabase = getSupabaseClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
const index = pinecone.index('stevie-kb-documents');
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

function chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.substring(start, end);
    
    if (chunk.trim().length > 0) {
      chunks.push(chunk);
    }
    
    start = end - overlap;
    if (start >= text.length - overlap) break; // Prevent infinite loop
  }

  return chunks.length > 0 ? chunks : [text]; // Return at least one chunk
}

async function ingestDocument(filePath: string): Promise<void> {
  const fileName = path.basename(filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  
  console.log(`\n📄 ${fileName}`);
  console.log(`   Size: ${content.length} chars`);

  try {
    // 1. Upload to S3
    console.log('   1/4 Uploading to S3...');
    const s3Key = `kb_articles/${Date.now()}_${fileName}`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: s3Key,
      Body: content,
      ContentType: 'text/markdown',
      Metadata: {
        'original-filename': fileName,
        'upload-date': new Date().toISOString(),
      },
    }));
    
    console.log(`   ✅ S3: ${s3Key}`);

    // 2. Create document in Supabase
    console.log('   2/4 Creating DB record...');
    const { data: doc, error: dbError } = await supabase
      .from('documents')
      .insert({
        title: fileName.replace('.md', ''),
        content,
        content_type: 'kb_article',
        program: 'general',
        metadata: {
          s3_key: s3Key,
          original_filename: fileName,
          file_size: content.length,
          content_type_file: 'text/markdown',
        },
      })
      .select()
      .single();

    if (dbError || !doc) {
      throw new Error(`DB error: ${dbError?.message}`);
    }

    console.log(`   ✅ DB: ${doc.id}`);

    // 3. Chunk and generate embeddings
    console.log('   3/4 Generating embeddings...');
    const chunks = chunkText(content);
    console.log(`   Chunks: ${chunks.length}`);

    const embeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i++) {
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: chunks[i],
      });
      embeddings.push(embeddingResponse.data[0].embedding);
      
      // Rate limit protection
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`   ✅ Embeddings: ${embeddings.length}`);

    // 4. Upsert to Pinecone
    console.log('   4/4 Upserting to Pinecone...');
    const vectors = embeddings.map((embedding, idx) => ({
      id: `${doc.id}_chunk_${idx}`,
      values: embedding,
      metadata: {
        document_id: doc.id,
        title: doc.title,
        chunk_index: idx,
        chunk_text: chunks[idx],
        program: 'general',
        category: 'kb_article',
        content_type: 'kb_article',
        s3_key: s3Key,
        created_at: doc.created_at,
      },
    }));

    await index.upsert({ records: vectors });

    console.log(`   ✅ Pinecone: ${vectors.length} vectors`);
    console.log(`   ✅ Complete!`);
  } catch (error: any) {
    console.error(`   ❌ Error: ${error.message}`);
    throw error;
  }
}

async function main() {
  console.log('🚀 KB Document Ingestion with S3\n');

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

  let successCount = 0;
  let failCount = 0;

  for (const file of files) {
    try {
      await ingestDocument(file);
      successCount++;
    } catch (error) {
      failCount++;
    }
  }

  console.log(`\n✅ Ingestion complete!`);
  console.log(`   Success: ${successCount}`);
  console.log(`   Failed: ${failCount}`);
  console.log('\n📝 Next: Test Q&A in the chatbot');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
