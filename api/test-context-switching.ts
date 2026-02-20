import 'dotenv/config';
import { unifiedChatbotService } from './src/services/unifiedChatbotService';
import crypto from 'crypto';

/**
 * Test context switching:
 * 1. User asks Q&A questions
 * 2. User switches to recommendation
 * 3. Bot should clear demographics and start from name
 * 4. User completes recommendation flow
 * 5. User switches back to Q&A
 * 6. Bot should answer questions again
 */
async function testContextSwitching() {
  console.log('🧪 Testing Context Switching (Q&A ↔ Recommendation)\n');