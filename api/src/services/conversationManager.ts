import { openaiService } from './openaiService';
import logger from '../utils/logger';
import {
  DEMOGRAPHIC_STEPS,
  getFirstMissingStep,
  STEP_TO_CONTEXT_KEY,
} from './demographicQuestions';

/**
 * Conversation Manager Service
 * 
 * Generates natural, streaming responses based on user intent.
 * Handles question answering, information collection, and mixed intents.
 */
export class ConversationManager {
  /**
   * Generate streaming response based on intent
   */
  async *generateResponseStream(params: {
    message: string;
    intent: { intent: string; confidence: number; reasoning?: string };
    conversationHistory: Array<{ role: string; content: string }>;
    userContext: any;
    kbArticles?: Array<any> | null;
  }): AsyncGenerator<string, void, unknown> {
    const { message, intent, conversationHistory, userContext, kbArticles } = params;

    const intentType = intent.intent;

    logger.info('generating_response', {
      intent: intentType,
      has_kb_articles: kbArticles !== null && kbArticles !== undefined && kbArticles.length > 0,
    });

    try {
      // Build system prompt
      const systemPrompt = this.buildSystemPrompt(intentType);

      // Build user prompt
      const userPrompt = this.buildUserPrompt({
        message,
        intentType,
        conversationHistory,
        userContext,
        kbArticles,
      });

      // Stream response
      let chunkCount = 0;
      for await (const chunk of openaiService.chatCompletionStream({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        maxTokens: 500,
      })) {
        chunkCount++;
        yield chunk;
      }

      logger.info('response_stream_complete', { chunks: chunkCount });
    } catch (error: any) {
      logger.error('response_generation_error', { error: error.message });
      yield 'I apologize, but I encountered an error. Could you please try again?';
    }
  }

  /**
   * Build system prompt based on intent
   */
  private buildSystemPrompt(intentType: string): string {
    const basePrompt = `You are a warm, conversational AI assistant for the Stevie Awards.

YOUR PERSONALITY:
- Natural and friendly - like ChatGPT, not a scripted bot
- Conversational - use natural language, contractions, casual tone
- Helpful and knowledgeable about Stevie Awards
- Adaptive - follow the user's lead, don't force a script
- Memory-keeper - remember what they've told you

CONVERSATION STYLE:
- Talk like a human having a real conversation
- Use "I", "you", "we" naturally
- Don't number your questions or use bullet points unless listing categories
- Flow naturally between topics
- Acknowledge what they say before moving forward
- Be concise - 2-3 sentences max per response

INFORMATION GATHERING (conversational demographic layer — do NOT feel like a form):
- Ask ONE question at a time, in the exact order the system specifies
- Use the umbrella-style question phrasing provided (e.g. "Where are you based, and where does most of your work or business happen?")
- Acknowledge what they said before asking the next thing
- Don't ask for info they've already given
- When all required demographics are collected, offer to find matching categories (and optionally a brief achievement description for better matches)

WHEN YOU DON'T KNOW THE ANSWER:
- If you can't find information in the knowledge base or don't know the answer
- Tell them to check stevieawards.com or reach out to help@stevieawards.com
- Be honest about your limitations
- NEVER guess or make up facts, dates, deadlines, fees, or eligibility rules

IMPORTANT:
- Never repeat yourself
- Never ask the same question twice
- Keep responses SHORT and conversational
- Let the conversation flow naturally`;

    if (intentType === 'recommendation') {
      return basePrompt + `

RIGHT NOW: They want category recommendations.
- We collect demographics in a set order so we can recommend the right Stevie programs (American, International, Technology Excellence, Women in Business, etc.).
- The system will tell you EXACTLY which piece of info to ask for next and the umbrella question to use. Ask for ONE thing at a time.
- Use the exact umbrella phrasing when given — it's designed to feel natural and get the right info for program routing.
- Optional question (women-in-business programs): ask only when it's the next in order; if they skip or say no, that's fine.
- Once we have all required demographics, offer to find matching categories. A brief achievement description then improves category fit.
- Keep it conversational and encouraging. Never number your questions or sound like a form.`;
    } else if (intentType === 'question') {
      return basePrompt + `

RIGHT NOW: They asked a question.
- Answer it naturally using ONLY the KB articles provided
- If no KB articles are provided or they don't cover the question, say you don't have that info and suggest stevieawards.com or help@stevieawards.com
- Keep it conversational and concise
- After answering, continue the conversation naturally`;
    } else if (intentType === 'information') {
      return basePrompt + `

RIGHT NOW: They're sharing information.
- Acknowledge what they shared
- Ask a natural follow-up question if needed
- Don't be robotic or scripted
- Keep it SHORT - 1-2 sentences`;
    } else {
      // mixed
      return basePrompt + `

RIGHT NOW: They asked a question AND shared info.
- Answer their question first using ONLY KB articles provided
- If no KB info available, honestly say so and suggest stevieawards.com or help@stevieawards.com
- Acknowledge the info they shared
- Continue naturally`;
    }
  }

  /**
   * Build user prompt with context
   */
  private buildUserPrompt(params: {
    message: string;
    intentType: string;
    conversationHistory: Array<{ role: string; content: string }>;
    userContext: any;
    kbArticles?: Array<any> | null;
  }): string {
    const { message, intentType, conversationHistory, userContext, kbArticles } = params;

    // Check if recommendations were just shown
    const recent = conversationHistory.slice(-4);
    const recommendationsShown = recent.some(
      (msg) =>
        msg.role === 'assistant' &&
        msg.content.length > 100 &&
        (msg.content.toLowerCase().includes('matching categories') ||
          msg.content.includes('✨') ||
          msg.content.toLowerCase().includes('here are'))
    );

    // Build context summary (include all demographic + optional fields we have)
    const contextParts: string[] = [];
    if (userContext.user_name) contextParts.push(`Name: ${userContext.user_name}`);
    if (userContext.user_email) contextParts.push(`Email: ${userContext.user_email}`);
    if (userContext.geography) contextParts.push(`Location/region: ${userContext.geography}`);
    if (userContext.org_type) contextParts.push(`Org type: ${userContext.org_type}`);
    if (userContext.career_stage) contextParts.push(`Career stage: ${userContext.career_stage}`);
    if (userContext.gender_programs_opt_in !== undefined) contextParts.push(`Consider women-in-business programs: ${userContext.gender_programs_opt_in ? 'yes' : 'no'}`);
    if (userContext.company_age) contextParts.push(`Company age: ${userContext.company_age}`);
    if (userContext.org_size) contextParts.push(`Team size: ${userContext.org_size}`);
    if (userContext.tech_orientation) contextParts.push(`Tech orientation: ${userContext.tech_orientation}`);
    if (userContext.recognition_scope) contextParts.push(`Recognition scope: ${userContext.recognition_scope}`);
    if (userContext.nomination_subject) contextParts.push(`Nominating: ${userContext.nomination_subject}`);
    if (userContext.organization_name) contextParts.push(`Organization: ${userContext.organization_name}`);
    if (userContext.description) contextParts.push(`About: ${userContext.description.substring(0, 150)}`);
    const contextSummary = contextParts.length > 0 ? contextParts.join('\n') : 'Just started conversation';

    // Build recent conversation
    const historyLines = conversationHistory.slice(-6).map((msg) => {
      const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
      return `${role}: ${msg.content}`;
    });
    const historySummary = historyLines.length > 0 ? historyLines.join('\n') : 'No previous messages';

    // If recommendations were just shown
    if (recommendationsShown) {
      return `RECOMMENDATIONS WERE JUST SHOWN!

WHAT WE KNOW:
${contextSummary}

RECENT CONVERSATION:
${historySummary}

THEY SAID: "${message}"

The user just received category recommendations. DO NOT ask if they want recommendations again!

Instead:
- Ask if they want more details about any category
- Ask if they want to see more categories
- Ask if they have questions about the nomination process
- Offer to help with next steps

Keep it SHORT and helpful.`;
    }

    // Build prompt based on intent
    if (intentType === 'recommendation') {
      const nextStep = getFirstMissingStep(userContext, true);
      const missingLabels: string[] = [];
      for (const step of DEMOGRAPHIC_STEPS) {
        const key = STEP_TO_CONTEXT_KEY[step.id];
        const val = userContext[key];
        if (val === undefined || val === null || val === '') missingLabels.push(step.label);
      }

      if (nextStep) {
        let hint = '';
        if (nextStep.id === 'org_type' && userContext.nomination_subject) {
          hint = ` We already know they're nominating a ${userContext.nomination_subject}. Phrase it as: "Got it — you're nominating a ${userContext.nomination_subject}. Is the organization behind it a company, a non-profit, or something else?"`;
        }
        return `WHAT WE KNOW:
${contextSummary}

RECENT CONVERSATION:
${historySummary}

THEY SAID: "${message}"

THEY WANT RECOMMENDATIONS!

STILL NEED (in this order): ${missingLabels.join(', ')}

NEXT: Ask for "${nextStep.label}" using this umbrella-style question (adapt slightly if needed to sound natural):
"${nextStep.umbrellaQuestion}"${hint}

CRITICAL: The user is answering our question. Do NOT say "I don't have specific information" or suggest stevieawards.com. Treat "team", "product", "company", "India", etc. as valid answers. Just acknowledge and ask the next question.
Ask ONE question only. Acknowledge what they said first, then ask. Keep it SHORT (1-2 sentences).${nextStep.optional ? ' This question is optional — if they skip or say no, move on.' : ''}`;
      }

      return `WHAT WE KNOW:
${contextSummary}

RECENT CONVERSATION:
${historySummary}

THEY SAID: "${message}"

We have all demographic info needed for program and category recommendations!

Respond warmly. You may say you have what you need and will find the best matching categories (and which Stevie programs fit them). If we don't have a brief achievement description yet, you can optionally ask for a sentence or two to improve category fit — then offer to generate recommendations. Keep it to 1-2 sentences. When they confirm, the system will generate recommendations.`;
    } else if (intentType === 'question') {
      const kbContext = this.buildKBContext(kbArticles);
      const hasRelevantKB = kbArticles && kbArticles.length > 0;

      if (hasRelevantKB) {
        return `WHAT WE KNOW:
${contextSummary}

RECENT CONVERSATION:
${historySummary}

THEIR QUESTION: "${message}"

KNOWLEDGE BASE INFO:
${kbContext}

Answer their question naturally and conversationally using ONLY the KB info above. Keep it SHORT (2-3 sentences). If the KB info doesn't fully cover the question, say so and suggest checking stevieawards.com.`;
      } else {
        return `WHAT WE KNOW:
${contextSummary}

RECENT CONVERSATION:
${historySummary}

THEIR QUESTION: "${message}"

NO RELEVANT KB ARTICLES FOUND.

You do NOT have information to answer this question. DO NOT guess or use general knowledge.

Respond naturally with something like: "I don't have specific information about that in my knowledge base. I'd recommend checking stevieawards.com or reaching out to help@stevieawards.com for the most accurate details."

DO NOT provide specific facts, dates, deadlines, fees, or eligibility details. You have NO knowledge base articles — so provide NO specifics. Just politely decline and redirect.`;
      }
    } else if (intentType === 'information') {
      const nextStep = getFirstMissingStep(userContext, true);
      const missingLabels: string[] = [];
      for (const step of DEMOGRAPHIC_STEPS) {
        const key = STEP_TO_CONTEXT_KEY[step.id];
        const val = userContext[key];
        if (val === undefined || val === null || val === '') missingLabels.push(step.label);
      }
      const missingText = missingLabels.length > 0 ? missingLabels.join(', ') : 'nothing — we have everything!';

      let nextInstruction: string;
      if (nextStep) {
        nextInstruction = `Ask for the NEXT item in order: "${nextStep.label}". Use this phrasing (adapt naturally): "${nextStep.umbrellaQuestion}". ONE question only.`;
        if (nextStep.id === 'org_type' && userContext.nomination_subject) {
          nextInstruction += ` We already know they're nominating a ${userContext.nomination_subject}; you can say "Got it — you're nominating a ${userContext.nomination_subject}. Is the organization behind it a company, a non-profit, or something else?"`;
        }
      } else {
        nextInstruction = 'We have all required demographics. Offer to find matching categories (and optionally a brief achievement description for better matches).';
      }

      return `WHAT WE KNOW:
${contextSummary}

RECENT CONVERSATION:
${historySummary}

THEY JUST SAID: "${message}"

STILL NEED: ${missingText}

CRITICAL: The user is answering OUR demographic question. Do NOT say "I don't have specific information about X" or suggest stevieawards.com or help@stevieawards.com. Just acknowledge their answer and ask for the next item. Treat "team", "product", "company", "individual" as valid answers (nomination subject or org type).

Respond naturally:
1. Acknowledge what they just shared (briefly!)
2. ${nextInstruction}
3. Keep it SHORT — 1-2 sentences max`;
    } else {
      // mixed
      const kbContext = this.buildKBContext(kbArticles);
      const hasRelevantKB = kbArticles && kbArticles.length > 0;

      if (hasRelevantKB) {
        return `WHAT WE KNOW:
${contextSummary}

RECENT CONVERSATION:
${historySummary}

THEY SAID: "${message}"

KB INFO:
${kbContext}

They asked a question AND shared info. Respond naturally:
1. Answer their question first (use ONLY the KB info above)
2. Acknowledge the info they shared
3. Continue the conversation naturally
Keep it SHORT and conversational.`;
      } else {
        return `WHAT WE KNOW:
${contextSummary}

RECENT CONVERSATION:
${historySummary}

THEY SAID: "${message}"

NO RELEVANT KB ARTICLES FOUND.

They asked a question AND shared info. Respond naturally:
1. For the question: You do NOT have knowledge base information to answer it. DO NOT guess. Say you don't have that info and suggest stevieawards.com or help@stevieawards.com.
2. Acknowledge the info they shared.
3. Continue the conversation naturally.
Keep it SHORT. DO NOT invent facts, dates, deadlines, or eligibility details.`;
      }
    }
  }

  /**
   * Build KB context from articles
   */
  private buildKBContext(articles?: Array<any> | null): string {
    if (!articles || articles.length === 0) {
      return 'No relevant articles found';
    }

    const contextParts: string[] = [];
    const topArticles = articles.slice(0, 3);

    for (let i = 0; i < topArticles.length; i++) {
      const article = topArticles[i];
      const title = article.title || 'Untitled';
      const content = article.content || '';
      const program = article.program || 'General';

      contextParts.push(`[Source ${i + 1} - ${program}]`);
      contextParts.push(`Title: ${title}`);
      contextParts.push(`Content: ${content.substring(0, 500)}`);
      contextParts.push('');
    }

    return contextParts.join('\n');
  }
}

// Export singleton instance
export const conversationManager = new ConversationManager();
