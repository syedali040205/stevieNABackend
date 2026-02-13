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

const SYSTEM_PROMPT = `You are a context classifier for a Stevie Awards chatbot.

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

1. If the user mentions "nominate", "nomination", "find categories", "recommend", "which award" → **recommendation**
2. If the user asks a factual question with question words (what, when, how much, where) about Stevie Awards processes → **qa**
3. If the conversation is already in recommendation mode (collecting demographics) and the user is answering questions → **recommendation** (stay in mode)
4. If the conversation is in qa mode and the user asks another question → **qa** (stay in mode)
5. If unclear, default to **recommendation** (it's better to help them find categories than refuse)

## Context switching

The user can switch contexts mid-conversation:
- If in qa mode and they say "help me find categories" or "I want to nominate" → switch to **recommendation**
- If in recommendation mode and they ask "what's the deadline?" → switch to **qa**

## Output format

Respond with ONLY valid JSON:
{"context":"<recommendation|qa>","confidence":<0.0-1.0>,"reasoning":"<one sentence>"}`;

export class ContextClassifier {
  /**
   * Classify conversation context
   */
  async classifyContext(params: {
    message: string;
    conversationHistory: Array<{ role: string; content: string }>;
    currentContext?: ConversationContext;
    userContext: any;
  }): Promise<ContextResult> {
    const { message, conversationHistory, currentContext, userContext } = params;

    logger.info('classifying_context', {
      message_length: message.length,
      current_context: currentContext,
    });

    // Quick keyword check for obvious recommendation requests
    const messageLower = message.toLowerCase();
    const nominationKeywords = ['nominate', 'nomination', 'find categor', 'recommend categor', 'which award', 'what award', 'help me find'];
    const hasNominationKeyword = nominationKeywords.some(kw => messageLower.includes(kw));
    
    if (hasNominationKeyword) {
      logger.info('context_classified_by_keyword', {
        context: 'recommendation',
        keyword_matched: true,
      });
      return {
        context: 'recommendation',
        confidence: 0.95,
        reasoning: 'User mentioned nomination/category keywords',
      };
    }

    try {
      const userPrompt = this.buildUserPrompt(message, conversationHistory, currentContext, userContext);

      const response = await openaiService.chatCompletion({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.0,
        maxTokens: 100,
      });

      const result = this.parseResponse(response);

      logger.info('context_classified', {
        context: result.context,
        confidence: result.confidence,
        switched: currentContext && currentContext !== result.context,
      });

      return result;
    } catch (error: any) {
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
   * Build user prompt
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
