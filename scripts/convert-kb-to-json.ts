/**
 * Convert Knowledge Base Content to JSON
 * 
 * This script converts raw KB content into structured JSON format.
 * KB articles are semantic chunks of information that provide context
 * for the LLM to generate answers, not pre-written Q&A pairs.
 */

import * as fs from 'fs';
import * as path from 'path';

interface KBArticle {
  title: string;
  content: string;
  program?: string;
  category?: string;
  keywords?: string[];
  source_url?: string;
  metadata?: Record<string, any>;
}

/**
 * Parse the raw KB text file into structured articles
 */
function parseKBContent(content: string): KBArticle[] {
  const articles: KBArticle[] = [];
  
  // Split by major sections (programs)
  const sections = content.split(/\n(?=\d+\.\s+[A-Z])/);
  
  for (const section of sections) {
    const lines = section.split(/\r?\n/).filter(line => line.trim());
    
    if (lines.length === 0) continue;
    
    // Detect program from section header
    const programMatch = section.match(/\d+\.\s+(.+?)\s*(?:\(([A-Z]+)\))?$/m);
    let currentProgram = 'general';
    let programFullName = '';
    
    if (programMatch) {
      programFullName = programMatch[1].trim();
      currentProgram = programMatch[2] || detectProgramCode(programFullName);
    }
    
    // Extract all Q&A pairs as individual KB articles
    const qaMatches = section.matchAll(/Q:\s*(.+?)\nA:\s*(.+?)(?=\n\nQ:|$)/gs);
    
    for (const match of qaMatches) {
      const question = match[1].trim();
      const answer = match[2].trim().replace(/\n/g, ' ');
      
      // Create KB article from Q&A
      const article: KBArticle = {
        title: question,
        content: answer,
        program: currentProgram,
        category: detectCategory(question, answer),
        keywords: extractKeywords(question, answer),
        metadata: {
          program_full_name: programFullName || undefined
        }
      };
      
      articles.push(article);
    }
  }
  
  return articles;
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
  if (text.includes('deadline') || text.includes('when')) return 'deadlines';
  if (text.includes('cost') || text.includes('fee') || text.includes('price')) return 'fees';
  if (text.includes('judg') || text.includes('select')) return 'judging';
  if (text.includes('submit') || text.includes('enter')) return 'submission';
  if (text.includes('categor')) return 'categories';
  if (text.includes('website') || text.includes('url') || text.includes('link')) return 'resources';
  if (text.includes('date') || text.includes('schedule')) return 'dates';
  if (text.includes('winner') || text.includes('award')) return 'awards';
  if (text.includes('language')) return 'languages';
  if (text.includes('past winner')) return 'past_winners';
  
  return 'general';
}

/**
 * Extract keywords from content
 */
function extractKeywords(title: string, content: string): string[] {
  const text = (title + ' ' + content).toLowerCase();
  const keywords: string[] = [];
  
  const terms = [
    'eligibility', 'deadline', 'fee', 'cost', 'judging', 'submission',
    'category', 'award', 'winner', 'entry', 'nomination', 'organization',
    'company', 'non-profit', 'government', 'international', 'american',
    'sales', 'customer service', 'women', 'employer', 'technology', 'hr',
    'asia-pacific', 'mena', 'german', 'banquet', 'ceremony', 'trophy',
    'gold', 'silver', 'bronze', 'grand stevie', 'people\'s choice'
  ];
  
  for (const term of terms) {
    if (text.includes(term)) {
      keywords.push(term);
    }
  }
  
  return keywords.slice(0, 8); // Max 8 keywords
}

/**
 * Main conversion function
 */
function convertKBToJSON() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('❌ No input file specified\n');
    console.log('Usage:');
    console.log('  npm run convert-kb -- input.txt\n');
    process.exit(1);
  }
  
  const inputFile = args[0];
  const inputPath = path.resolve(inputFile);
  
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ File not found: ${inputPath}`);
    process.exit(1);
  }
  
  console.log(`📖 Reading: ${inputFile}`);
  const content = fs.readFileSync(inputPath, 'utf-8');
  
  console.log('   Parsing KB content...');
  const articles = parseKBContent(content);
  
  console.log(`   Found: ${articles.length} KB articles\n`);
  
  if (articles.length === 0) {
    console.error('❌ No KB articles found in file');
    process.exit(1);
  }
  
  // Show summary
  const programs = new Set(articles.map(a => a.program));
  const categories = new Set(articles.map(a => a.category));
  console.log(`   Programs: ${Array.from(programs).join(', ')}`);
  console.log(`   Categories: ${Array.from(categories).join(', ')}\n`);
  
  // Write output
  const outputPath = path.join(path.dirname(__dirname), 'scripts', 'kb-data.json');
  const output = {
    articles: articles,
    metadata: {
      source: inputFile,
      converted_at: new Date().toISOString(),
      total_articles: articles.length,
      programs: Array.from(programs),
      categories: Array.from(categories)
    }
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`✅ Converted to: ${outputPath}`);
  console.log(`   Total articles: ${articles.length}\n`);
  
  console.log('Next steps:');
  console.log('  1. Review kb-data.json and edit if needed');
  console.log('  2. Run: npm run ingest-kb');
  console.log('  3. Test: npm run test-chatbot-search');
}

// Run conversion
convertKBToJSON();
