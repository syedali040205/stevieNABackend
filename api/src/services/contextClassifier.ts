import { openaiService } from './openaiService';
import logger from '../utils/logger';

/**
 * Context Classifier Service
 *
 * Determines the conversation context/mode:
 * - recommendation: User wants to find award categories (collect demographics → generate recommendations)
 * - qa: User wants to ask questions about Stevie Awards (answer from knowledge base)
 *
 * The system can dynamically switch between modes based on user intent.
 */

export type ConversationContext = 'recommendation' | 'qa';

interface ContextResult {
  context: ConversationContext;
  confidence: number;
  reasoning: string;
}

const FEW_SHOT_EXAMPLES = `
## Classification Examples

Example 1:
Message: "I want to nominate my team for an innovation award"
Context: recommendation
Confidence: 0.95
Reasoning: Clear nomination intent

Example 2:
Message: "What's the deadline for the Technology Excellence program?"
Context: qa
Confidence: 0.90
Reasoning: Factual question about deadline

Example 3:
Message: "We developed an AI product that won first place at a hackathon"
Context: recommendation
Confidence: 0.85
Reasoning: Describing achievement for nomination (implicit intent)

Example 4:
Message: "How much does it cost to enter?"
Context: qa
Confidence: 0.90
Reasoning: Factual question about fees

Example 5:
Message: "I'm not sure which category fits my product"
Context: recommendation
Confidence: 0.80
Reasoning: Seeking category recommendations
`;

const SYSTEM_PROMPT = `You are a context classifier for a Stevie Awards chatbot.

${FEW_SHOT_EXAMPLES}

Your job is to determine the conversation MODE based on what the user wants:

## Contexts (modes)

**recommendation** - Use when the user wants to:
- Find award categories they should enter
- Get category recommendations
- Figure out which awards to apply for
- Find the right program for their nomination
- Get help choosing categories
- Nominate themselves, their team, product, or organization
- Examples: "help me find categories", "which award should I enter", "recommend categories for my product", "I want to nominate myself", "I'd like to find a nomination", "help me nominate my team"

**qa** - Use when the user wants to:
- Ask factual questions about Stevie Awards
- Learn about deadlines, fees, rules, eligibility
- Understand how the awards work
- Get information about specific programs
- Examples: "what is the deadline?", "how much does it cost?", "what are the eligibility requirements?", "how does the judging work?"

## Decision rules

1. If the user mentions "nominate", "nomination", "find categories", "recommend", "which award", "want to nominate", "would like to nominate", "apply for", "enter for" → **recommendation**
2. If the user asks a factual question with question words (what, when, how much, where) about Stevie Awards processes (deadlines, fees, rules, eligibility) → **qa**
3. If the conversation is already in recommendation mode (collecting demographics) and the user is answering questions → **recommendation** (stay in mode)
4. If the conversation is in qa mode and the user asks another question → **qa** (stay in mode)
5. If unclear or ambiguous, ALWAYS default to **recommendation** (it's better to help them find categories than refuse)
6. CRITICAL: "I want to nominate" or "I would like to nominate" is ALWAYS **recommendation**, never qa

## Context switching

The user can switch contexts mid-conversation:
- If in qa mode and they say "help me find categories" or "I want to nominate" → switch to **recommendation**
- If in recommendation mode and they ask "what's the deadline?" → switch to **qa**

## Output format

Respond with ONLY valid JSON:
{"context":"<recommendation|qa>","confidence":<0.0-1.0>,"reasoning":"<one sentence>"}`;

export class ContextClassifier {
  /**
   * Quick pattern-based classification (Stage 1: Fast path)
   * Returns null if no high-confidence match found
   */
  private quickClassify(message: string): {
    context: ConversationContext | null;
    confidence: number;
  } {
    const messageLower = message.toLowerCase().trim();

    // Nomination patterns (HIGH confidence)
    const nominationPatterns = [
      /\b(nominate|nomination)\b/i,
      /\b(find categor|recommend categor)\b/i,
      /\b(which award|what award)\b.*\b(should|enter|apply|nominate)\b/i,
      /\b(help me find)\b.*\b(award|categor)\b/i,
      /\b(want to nominate|would like to nominate|looking to nominate|interested in nominating)\b/i,
      /\b(apply for|enter for|submit for)\b.*\b(award|categor)\b/i,
    ];

    // Q&A patterns (HIGH confidence)
    const qaPatterns = [
      /\b(what is|when is|how much|where is)\b.*\b(deadline|fee|cost|eligibility|price)\b/i,
      /\b(tell me about|explain|how does|how do)\b.*\b(judging|process|program|work)\b/i,
      /\b(deadline|due date)\b.*\b(for|when)\b/i,
      /\b(cost|price|fee)\b.*\b(to enter|to submit|to apply)\b/i,
      /\b(eligibility|eligible|requirements|criteria)\b/i,
    ];

    // Check nomination patterns first (higher priority)
    for (const pattern of nominationPatterns) {
      if (pattern.test(messageLower)) {
        return { context: 'recommendation', confidence: 0.90 };
      }
    }

    // Check Q&A patterns
    for (const pattern of qaPatterns) {
      if (pattern.test(messageLower)) {
        return { context: 'qa', confidence: 0.85 };
      }
    }

    // No high-confidence match
    return { context: null, confidence: 0.0 };
  }

  /**
   * Classify conversation context using hybrid approach
   * Stage 1: Fast pattern matching (80% of requests)
   * Stage 2: LLM classification for ambiguous cases (20% of requests)
   */
  async classifyContext(params: {
    message: string;
    conversationHistory: Array<{ role: string; content: string }>;
    currentContext?: ConversationContext;
    userContext: any;
    signal?: AbortSignal;
  }): Promise<ContextResult> {
    const { message, conversationHistory, currentContext, userContext, signal } = params;

    logger.info('classifying_context', {
      message_length: message.length,
      current_context: currentContext,
    });

    // Stage 1: Try fast pattern-based classification
    const quick = this.quickClassify(message);
    if (quick.context && quick.confidence > 0.80) {
      logger.info('context_classified_by_pattern', {
        context: quick.context,
        confidence: quick.confidence,
        method: 'fast_path',
        message: message.substring(0, 50),
      });
      return {
        context: quick.context,
        confidence: quick.confidence,
        reasoning: 'Matched high-confidence pattern',
      };
    }

    // Stage 2: Fall back to LLM for ambiguous cases
    try {
      const userPrompt = this.buildUserPrompt(message, conversationHistory, currentContext, userContext);

      const response = await openaiService.chatCompletion({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.0,
        maxTokens: 100,
        signal,
      });

      const result = this.parseResponse(response);

      logger.info('context_classified', {
        context: result.context,
        confidence: result.confidence,
        method: 'llm_fallback',
        switched: currentContext && currentContext !== result.context,
      });

      return result;
    } catch (error: any) {
      // Abort should propagate so the route can stop work.
      if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') throw error;

      logger.error('context_classification_error', { error: error.message });

      // Fallback to recommendation mode (more helpful than qa when uncertain)
      return {
        context: 'recommendation',
        confidence: 0.3,
        reasoning: `Classification failed (${error.message}), defaulting to recommendation`,
      };
    }
  }

  /**
   * Build user prompt for LLM classification
   */
  private buildUserPrompt(
    message: string,
    conversationHistory: Array<{ role: string; content: string }>,
    currentContext: ConversationContext | undefined,
    userContext: any
  ): string {
    const parts: string[] = [];

    // Current context
    if (currentContext) {
      parts.push(`Current context: ${currentContext}`);

      if (currentContext === 'recommendation') {
        const collected = this.getCollectedFields(userContext);
        if (collected.length > 0) {
          parts.push(`Demographics collected: ${collected.join(', ')}`);
          parts.push('We are in the middle of collecting demographics for recommendations.');
        }
      }
    } else {
      parts.push('Current context: none (conversation just started)');
    }

    // Recent history
    if (conversationHistory.length > 0) {
      const recent = conversationHistory.slice(-4);
      const lines = ['Recent conversation:'];
      for (const msg of recent) {
        const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
        let content = msg.content;
        if (content.length > 150) {
          content = content.substring(0, 147) + '...';
        }
        lines.push(`  ${role}: ${content}`);
      }
      parts.push(lines.join('\n'));
    }

    // Message to classify
    parts.push(`\nUser's latest message: "${message}"`);
    parts.push('\nWhat context/mode should we be in?');

    return parts.join('\n');
  }

  /**
   * Get collected demographic fields
   */
  private getCollectedFields(context: any): string[] {
    const fields: string[] = [];

    if (context.user_name) fields.push('name');
    if (context.user_email) fields.push('email');
    if (context.geography) fields.push('location');
    if (context.org_type) fields.push('org type');
    if (context.nomination_subject) fields.push('nomination subject');

    return fields;
  }

  /**
   * Parse OpenAI response
   */
  private parseResponse(raw: string): ContextResult {
    let text = raw.trim();

    // Strip markdown fences
    if (text.startsWith('```')) {
      const parts = text.split('```');
      text = parts[1] || text;
      if (text.toLowerCase().startsWith('json')) {
        text = text.substring(4);
      }
      text = text.trim();
    }

    try {
      const result = JSON.parse(text);

      // Validate context
      let context: ConversationContext = result.context?.toLowerCase()?.trim() || 'qa';
      if (context !== 'recommendation' && context !== 'qa') {
        logger.warn('unknown_context_value', {
          raw_context: result.context,
          falling_back_to: 'qa',
        });
        context = 'qa';
      }

      // Clamp confidence
      let confidence = 0.8;
      try {
        confidence = parseFloat(result.confidence);
        confidence = Math.max(0.0, Math.min(1.0, confidence));
      } catch {
        // Use default
      }

      return {
        context,
        confidence,
        reasoning: result.reasoning || '',
      };
    } catch (error: any) {
      logger.error('context_json_parse_error', {
        error: error.message,
        response: text.substring(0, 300),
      });

      return {
        context: 'qa',
        confidence: 0.3,
        reasoning: 'Failed to parse LLM JSON, defaulting to qa',
      };
    }
  }
}

// Export singleton instance
export const contextClassifier = new ContextClassifier();
