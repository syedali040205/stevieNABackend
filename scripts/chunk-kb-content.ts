/**
 * Chunk Knowledge Base Content
 * 
 * This script takes raw KB content and chunks it into semantic pieces.
 * Each chunk is a self-contained piece of information that can be
 * independently retrieved and used as context for LLM responses.
 * 
 * Chunking Strategy:
 * - Each Q&A pair becomes a separate chunk
 * - Title = Question
 * - Content = Answer
 * - Metadata includes program, category, keywords
 */

import * as fs from 'fs';
import * as path from 'path';

interface KBChunk {
  title: string;
  content: string;
  program: string;
  category: string;
  keywords: string[];
  metadata: {
    program_full_name?: string;
    section?: string;
  };
}

/**
 * Parse raw content into chunks
 */
function chunkKBContent(rawContent: string): KBChunk[] {
  const chunks: KBChunk[] = [];
  
  // Split into lines
  const lines = rawContent.split(/\r?\n/);
  
  let currentProgram = 'general';
  let currentProgramFullName = '';
  let currentSection = '';
  let currentQuestion = '';
  let currentAnswer = '';
  let inAnswer = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines and separators
    if (!line || line === '---') {
      continue;
    }
    
    // Detect section headers (e.g., "## General Information About Stevie Awards")
    if (line.startsWith('##') && !line.startsWith('###') && !line.match(/^##\s*\d+\./)) {
      currentSection = line.replace(/^#+\s*/, '');
      continue;
    }
    
    // Detect program headers (e.g., "## 1. American Business Awards (ABA)")
    const programMatch = line.match(/^##\s*(\d+)\.\s+(.+?)\s*(?:\(([A-Z]+)\))?$/);
    if (programMatch) {
      currentProgramFullName = programMatch[2].trim();
      currentProgram = programMatch[3] || detectProgramCode(currentProgramFullName);
      currentSection = currentProgramFullName;
      continue;
    }
    
    // Detect question (with or without ###)
    const questionMatch = line.match(/^###?\s*Q:\s*(.+)$/);
    if (questionMatch) {
      // Save previous chunk if exists
      if (currentQuestion && currentAnswer) {
        chunks.push(createChunk(
          currentQuestion,
          currentAnswer,
          currentProgram,
          currentProgramFullName,
          currentSection
        ));
      }
      
      // Start new chunk
      currentQuestion = questionMatch[1].trim();
      currentAnswer = '';
      inAnswer = false;
      continue;
    }
    
    // Detect answer (with or without **)
    const answerMatch = line.match(/^\*?\*?A:\*?\*?\s*(.+)$/);
    if (answerMatch) {
      currentAnswer = answerMatch[1].trim();
      inAnswer = true;
      continue;
    }
    
    // Continue answer on next lines (include lists and regular text)
    if (inAnswer && line && !line.startsWith('#')) {
      // Add space before non-list items, newline for list items
      if (line.match(/^[-\d]+\./)) {
        currentAnswer += ' ' + line;
      } else {
        currentAnswer += ' ' + line;
      }
    }
  }
  
  // Save last chunk
  if (currentQuestion && currentAnswer) {
    chunks.push(createChunk(
      currentQuestion,
      currentAnswer,
      currentProgram,
      currentProgramFullName,
      currentSection
    ));
  }
  
  return chunks;
}

/**
 * Create a KB chunk with metadata
 */
function createChunk(
  question: string,
  answer: string,
  program: string,
  programFullName: string,
  section: string
): KBChunk {
  return {
    title: question,
    content: answer,
    program: program,
    category: detectCategory(question, answer),
    keywords: extractKeywords(question, answer, program),
    metadata: {
      program_full_name: programFullName || undefined,
      section: section || undefined
    }
  };
}

/**
 * Detect program code from full name
 */
function detectProgramCode(programName: string): string {
  const name = programName.toLowerCase();
  
  if (name.includes('american business')) return 'ABA';
  if (name.includes('international business')) return 'IBA';
  if (name.includes('sales') && name.includes('customer')) return 'Sales';
  if (name.includes('women')) return 'Women';
  if (name.includes('great employers')) return 'Employers';
  if (name.includes('technology excellence')) return 'Tech';
  if (name.includes('asia-pacific')) return 'APAC';
  if (name.includes('middle east') || name.includes('mena')) return 'MENA';
  if (name.includes('german')) return 'GSA';
  
  return 'general';
}

/**
 * Detect category from content
 */
function detectCategory(title: string, content: string): string {
  const text = (title + ' ' + content).toLowerCase();
  
  if (text.includes('eligib') || text.includes('who can')) return 'eligibility';
  if (text.includes('deadline') || text.includes('when are') || text.includes('schedule')) return 'deadlines';
  if (text.includes('cost') || text.includes('fee') || text.includes('price')) return 'fees';
  if (text.includes('judg') || text.includes('select')) return 'judging';
  if (text.includes('submit') || text.includes('enter')) return 'submission';
  if (text.includes('categor') || text.includes('category groups')) return 'categories';
  if (text.includes('website') || text.includes('url') || text.includes('link')) return 'resources';
  if (text.includes('important dates') || text.includes('banquet')) return 'dates';
  if (text.includes('past winner') || text.includes('previous winner')) return 'past_winners';
  if (text.includes('language')) return 'languages';
  if (text.includes('trophy') || text.includes('gold') || text.includes('silver') || text.includes('bronze')) return 'awards';
  if (text.includes('benefit') || text.includes('what you get')) return 'benefits';
  if (text.includes('search') || text.includes('contact') || text.includes('newsletter')) return 'resources';
  
  return 'general';
}

/**
 * Extract keywords from content
 */
function extractKeywords(title: string, content: string, program: string): string[] {
  const text = (title + ' ' + content).toLowerCase();
  const keywords: string[] = [];
  
  // Add program as keyword
  if (program && program !== 'general') {
    keywords.push(program.toLowerCase());
  }
  
  const terms = [
    'eligibility', 'deadline', 'fee', 'cost', 'judging', 'submission',
    'category', 'award', 'winner', 'entry', 'nomination', 'organization',
    'company', 'non-profit', 'government', 'international', 'american',
    'sales', 'customer service', 'women', 'employer', 'technology', 'hr',
    'asia-pacific', 'mena', 'german', 'banquet', 'ceremony', 'trophy',
    'gold', 'silver', 'bronze', 'grand stevie', 'people\'s choice',
    'new york', 'istanbul', 'seoul', 'language', 'website', 'contact',
    'sponsor', 'judge', 'newsletter', 'merchandise', 'benefit'
  ];
  
  for (const term of terms) {
    if (text.includes(term) && !keywords.includes(term)) {
      keywords.push(term);
    }
  }
  
  return keywords.slice(0, 10); // Max 10 keywords per chunk
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('❌ No input file specified\n');
    console.log('Usage:');
    console.log('  npm run chunk-kb -- input.txt\n');
    process.exit(1);
  }
  
  const inputFile = args[0];
  const inputPath = path.resolve(inputFile);
  
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ File not found: ${inputPath}`);
    process.exit(1);
  }
  
  console.log('📚 Stevie Awards Knowledge Base Chunking\n');
  console.log('='.repeat(50));
  console.log(`\n📖 Reading: ${inputFile}`);
  
  const rawContent = fs.readFileSync(inputPath, 'utf-8');
  console.log(`   File size: ${rawContent.length} characters`);
  
  console.log('\n🔪 Chunking content...');
  const chunks = chunkKBContent(rawContent);
  
  console.log(`   Created: ${chunks.length} chunks\n`);
  
  if (chunks.length === 0) {
    console.error('❌ No chunks created from file');
    process.exit(1);
  }
  
  // Show summary
  const programs = new Set(chunks.map(c => c.program));
  const categories = new Set(chunks.map(c => c.category));
  
  console.log('📊 Summary:');
  console.log(`   Total chunks: ${chunks.length}`);
  console.log(`   Programs: ${Array.from(programs).join(', ')}`);
  console.log(`   Categories: ${Array.from(categories).join(', ')}`);
  
  // Show program breakdown
  console.log('\n📋 Chunks per program:');
  programs.forEach(program => {
    const count = chunks.filter(c => c.program === program).length;
    console.log(`   ${program}: ${count} chunks`);
  });
  
  // Show category breakdown
  console.log('\n📋 Chunks per category:');
  const categoryCount = new Map<string, number>();
  categories.forEach(category => {
    const count = chunks.filter(c => c.category === category).length;
    categoryCount.set(category, count);
  });
  
  // Sort by count descending
  const sortedCategories = Array.from(categoryCount.entries())
    .sort((a, b) => b[1] - a[1]);
  
  sortedCategories.forEach(([category, count]) => {
    console.log(`   ${category}: ${count} chunks`);
  });
  
  // Write output
  const outputPath = path.join(path.dirname(__dirname), 'scripts', 'kb-data.json');
  const output = {
    chunks: chunks,
    metadata: {
      source: inputFile,
      chunked_at: new Date().toISOString(),
      total_chunks: chunks.length,
      programs: Array.from(programs),
      categories: Array.from(categories),
      chunking_strategy: 'one_qa_per_chunk'
    }
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  
  console.log(`\n✅ Chunked data saved to: ${outputPath}`);
  console.log(`   Total chunks: ${chunks.length}\n`);
  
  console.log('📝 Next steps:');
  console.log('  1. Review kb-data.json');
  console.log('  2. Run database migration: scripts/migrations/003_chatbot_tables.sql');
  console.log('  3. Run: npm run ingest-kb');
  console.log('  4. Test: npm run test-chatbot-search\n');
}

// Run
main();
