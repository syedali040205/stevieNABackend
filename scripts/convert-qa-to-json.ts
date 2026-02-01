/**
 * Convert Q&A Data to JSON
 * 
 * This script helps convert your Q&A data from various formats into the JSON format
 * needed for ingestion.
 * 
 * Supported input formats:
 * 1. Plain text file (questions and answers separated by blank lines)
 * 2. CSV file (question, answer columns)
 * 3. Markdown file (Q&A format)
 * 
 * Usage:
 *   npm run convert-qa -- input.txt
 *   npm run convert-qa -- input.csv
 *   npm run convert-qa -- input.md
 */

import * as fs from 'fs';
import * as path from 'path';

interface FAQItem {
  question: string;
  answer: string;
  program?: string;
  category?: string;
  keywords?: string[];
  source_url?: string;
}

function parsePlainText(content: string): FAQItem[] {
  const faqs: FAQItem[] = [];
  // Handle both Windows (\r\n) and Unix (\n) line endings
  const lines = content.split(/\r?\n/);
  
  let currentQuestion = '';
  let currentAnswer = '';
  let inAnswer = false;
  
  console.log(`   Total lines: ${lines.length}`);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Skip empty lines and headers
    if (!trimmed || trimmed.match(/^[=#\-]+$/) || trimmed.match(/^\d+\./)) {
      continue;
    }
    
    if (trimmed.startsWith('Q:') || trimmed.startsWith('Question:')) {
      // Save previous Q&A if exists
      if (currentQuestion && currentAnswer) {
        faqs.push({
          question: currentQuestion.trim(),
          answer: currentAnswer.trim(),
          program: 'general',
          category: 'general'
        });
      }
      
      // Start new question
      currentQuestion = trimmed.replace(/^(Q:|Question:)\s*/i, '');
      currentAnswer = '';
      inAnswer = false;
      
    } else if (trimmed.startsWith('A:') || trimmed.startsWith('Answer:')) {
      currentAnswer = trimmed.replace(/^(A:|Answer:)\s*/i, '');
      inAnswer = true;
      
    } else if (inAnswer && trimmed) {
      // Continue answer on next line
      currentAnswer += ' ' + trimmed;
    }
  }
  
  // Save last Q&A
  if (currentQuestion && currentAnswer) {
    faqs.push({
      question: currentQuestion.trim(),
      answer: currentAnswer.trim(),
      program: 'general',
      category: 'general'
    });
  }
  
  console.log(`   Parsed ${faqs.length} Q&A pairs`);
  if (faqs.length > 0) {
    console.log(`   First Q: ${faqs[0].question.substring(0, 50)}...`);
  }
  
  return faqs;
}

/**
 * Parse CSV format
 * Expected format: question,answer,program,category
 */
function parseCSV(content: string): FAQItem[] {
  const faqs: FAQItem[] = [];
  const lines = content.split('\n');
  
  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Simple CSV parsing (doesn't handle quotes with commas)
    const parts = line.split(',').map(p => p.trim());
    
    if (parts.length >= 2) {
      faqs.push({
        question: parts[0],
        answer: parts[1],
        program: parts[2] || 'general',
        category: parts[3] || 'general'
      });
    }
  }
  
  return faqs;
}

/**
 * Parse Markdown format
 * Expected format:
 * ## Question here?
 * Answer here.
 * 
 * ## Another question?
 * Another answer.
 */
function parseMarkdown(content: string): FAQItem[] {
  const faqs: FAQItem[] = [];
  const sections = content.split(/^##\s+/m).filter(s => s.trim());
  
  for (const section of sections) {
    const lines = section.split('\n');
    const question = lines[0].trim();
    const answer = lines.slice(1).join(' ').trim();
    
    if (question && answer) {
      faqs.push({
        question: question,
        answer: answer,
        program: 'general',
        category: 'general'
      });
    }
  }
  
  return faqs;
}

/**
 * Auto-detect program from question/answer
 */
function detectProgram(question: string, answer: string): string {
  const text = (question + ' ' + answer).toLowerCase();
  
  if (text.includes('international business awards') || text.includes('iba')) {
    return 'IBA';
  }
  if (text.includes('american business awards') || text.includes('aba')) {
    return 'ABA';
  }
  if (text.includes('stevie awards for women')) {
    return 'Women';
  }
  if (text.includes('stevie awards for sales')) {
    return 'Sales';
  }
  if (text.includes('asia-pacific')) {
    return 'APAC';
  }
  
  return 'general';
}

/**
 * Auto-detect category from question
 */
function detectCategory(question: string): string {
  const q = question.toLowerCase();
  
  if (q.includes('eligib') || q.includes('who can')) {
    return 'eligibility';
  }
  if (q.includes('deadline') || q.includes('when')) {
    return 'deadlines';
  }
  if (q.includes('cost') || q.includes('fee') || q.includes('price')) {
    return 'fees';
  }
  if (q.includes('judg') || q.includes('select')) {
    return 'judging';
  }
  if (q.includes('submit') || q.includes('enter')) {
    return 'submission';
  }
  if (q.includes('categor')) {
    return 'categories';
  }
  
  return 'general';
}

/**
 * Extract keywords from question
 */
function extractKeywords(question: string, answer: string): string[] {
  const text = (question + ' ' + answer).toLowerCase();
  const keywords: string[] = [];
  
  // Common important terms
  const terms = [
    'eligibility', 'deadline', 'fee', 'cost', 'judging', 'submission',
    'category', 'award', 'winner', 'entry', 'nomination', 'organization',
    'company', 'non-profit', 'government', 'international', 'american'
  ];
  
  for (const term of terms) {
    if (text.includes(term)) {
      keywords.push(term);
    }
  }
  
  return keywords.slice(0, 5); // Max 5 keywords
}

/**
 * Enhance FAQs with auto-detected metadata
 */
function enhanceFAQs(faqs: FAQItem[]): FAQItem[] {
  return faqs.map(faq => ({
    ...faq,
    program: faq.program === 'general' ? detectProgram(faq.question, faq.answer) : faq.program,
    category: faq.category === 'general' ? detectCategory(faq.question) : faq.category,
    keywords: faq.keywords || extractKeywords(faq.question, faq.answer)
  }));
}

/**
 * Main conversion function
 */
function convertQAToJSON() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('❌ No input file specified\n');
    console.log('Usage:');
    console.log('  npm run convert-qa -- input.txt');
    console.log('  npm run convert-qa -- input.csv');
    console.log('  npm run convert-qa -- input.md\n');
    console.log('Supported formats:');
    console.log('  .txt - Plain text (Q: / A: format)');
    console.log('  .csv - CSV (question,answer,program,category)');
    console.log('  .md  - Markdown (## Question format)');
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
  const ext = path.extname(inputFile).toLowerCase();
  
  let faqs: FAQItem[] = [];
  
  // Parse based on file extension
  if (ext === '.txt') {
    console.log('   Format: Plain text');
    faqs = parsePlainText(content);
  } else if (ext === '.csv') {
    console.log('   Format: CSV');
    faqs = parseCSV(content);
  } else if (ext === '.md') {
    console.log('   Format: Markdown');
    faqs = parseMarkdown(content);
  } else {
    console.error(`❌ Unsupported file format: ${ext}`);
    console.log('   Supported: .txt, .csv, .md');
    process.exit(1);
  }
  
  console.log(`   Found: ${faqs.length} Q&A pairs\n`);
  
  if (faqs.length === 0) {
    console.error('❌ No Q&A pairs found in file');
    console.log('\nExpected format for .txt files:');
    console.log('Q: Your question here?');
    console.log('A: Your answer here.\n');
    process.exit(1);
  }
  
  // Enhance with auto-detected metadata
  console.log('🔍 Auto-detecting programs and categories...');
  faqs = enhanceFAQs(faqs);
  
  // Show summary
  const programs = new Set(faqs.map(f => f.program));
  const categories = new Set(faqs.map(f => f.category));
  console.log(`   Programs: ${Array.from(programs).join(', ')}`);
  console.log(`   Categories: ${Array.from(categories).join(', ')}\n`);
  
  // Write output
  const outputPath = path.join(path.dirname(__dirname), 'scripts', 'faq-data.json');
  const output = {
    faqs: faqs,
    metadata: {
      source: inputFile,
      converted_at: new Date().toISOString(),
      total_faqs: faqs.length,
      programs: Array.from(programs),
      categories: Array.from(categories)
    }
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`✅ Converted to: ${outputPath}`);
  console.log(`   Total FAQs: ${faqs.length}\n`);
  
  console.log('Next steps:');
  console.log('  1. Review faq-data.json and edit if needed');
  console.log('  2. Run: npm run ingest-faq');
  console.log('  3. Test: npm run test-chatbot-search');
}

// Run conversion
convertQAToJSON();
