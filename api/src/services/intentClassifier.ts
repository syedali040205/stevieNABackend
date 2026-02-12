import { openaiService } from './openaiService';
import logger from '../utils/logger';

/**
 * Intent Classifier Service
 * 
 * Classifies user intent using OpenAI.
 * Determines if user is asking a question, providing information, or both.
 */

const VALID_INTENTS = [
  'greeting',
  'affirmative',
  'negative',
  'question',
  'information',
  'mixed',
  'recommendation',
  'clarification',
  'off_topic',
] as const;

type Intent = typeof VALID_INTENTS[number];

interface IntentResult {
  intent: Intent;
  confidence: number;
  reasoning: string;
}

const SYSTEM_PROMPT = `You are an intent classifier for a Stevie Awards nomination assistant chatbot.

Your ONLY job is to read the user's latest message, consider the conversation so far, and return a single JSON object classifying the intent.

## Intent definitions

| Intent          | Use when…                                                                                              |
|-----------------|--------------------------------------------------------------------------------------------------------|
| greeting        | The message is a pleasantry, hello, goodbye, or expression of thanks with no substantive content.      |
| affirmative     | The user is confirming, agreeing, or giving a short "yes"-style reply to something the assistant asked. |
| negative        | The user is declining, refusing, or saying "no" to something the assistant offered or asked.            |
| question        | The user is asking a question about the Stevie Awards — programs, deadlines, fees, eligibility, rules.  |
| information     | The user is providing details about themselves or their nomination — org info, achievements, names.     |
| mixed           | The message contains BOTH a question about Stevie Awards AND nomination information in the same turn.   |
| recommendation  | The user is asking the assistant to find, suggest, or show matching award categories for them.          |
| clarification   | The user is asking the assistant to repeat, rephrase, or explain something IT previously said.          |
| off_topic       | The message is unrelated to the Stevie Awards or the nomination process.                               |

## Decision rules (apply in order)

1. If the message is purely social ("hi", "thanks", "bye") → **greeting**.
2. If the assistant just asked a yes/no question or offered to do something, and the user replies with a short confirmation → **affirmative**.
3. Same as above but the user declines → **negative**.
4. If the user asks the assistant to clarify or repeat its own previous response → **clarification**.
5. If the user explicitly asks for category recommendations, matches, or "where should I enter" → **recommendation**.
6. If the message contains a factual question about Stevie Awards AND also provides nomination details → **mixed**.
7. If the message is purely a question about Stevie Awards → **question**.
8. If the message provides nomination-relevant info without asking a factual question → **information**.
9. If none of the above apply → **off_topic**.

## Output format

Respond with ONLY a valid JSON object — no markdown, no explanation:
{"intent":"<intent>","confidence":<0.0-1.0>,"reasoning":"<one sentence>"}`;

export class IntentClassifier {
  /**
   * Classify user intent
   */
  async classifyIntent(params: {
    message: string;
    conversationHistory: Array<{ role: string; content: string }>;
    userContext: any;
  }): Promise<IntentResult> {
    const { message, conversationHistory, userContext } = params;

    logger.info('classifying_intent', {
      message_length: message.length,
      history_length: conversationHistory.length,
    });

    try {
      const userPrompt = this.buildUserPrompt(message, conversationHistory, userContext);

      const response = await openaiService.chatCompletion({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.0,
        maxTokens: 120,
      });

      const result = this.parseResponse(response);

      logger.info('intent_classified', {
        intent: result.intent,
        confidence: result.confidence,
      });

      return result;
    } catch (error: any) {
      logger.error('intent_classification_error', { error: error.message });
      
      // Fallback to information intent
      return {
        intent: 'information',
        confidence: 0.3,
        reasoning: `Classification failed (${error.message}), defaulting to information`,
      };
    }
  }

  /**
   * Build user prompt with context
   */
  private buildUserPrompt(
    message: string,
    conversationHistory: Array<{ role: string; content: string }>,
    userContext: any
  ): string {
    const parts: string[] = [];

    // Conversation stage
    parts.push(this.describeConversationStage(userContext));

    // Recent history
    parts.push(this.describeRecentHistory(conversationHistory));

    // Message to classify
    parts.push(`Message to classify: "${message}"`);

    return parts.join('\n\n');
  }

  /**
   * Describe conversation stage
   */
  private describeConversationStage(context: any): string {
    const collected: string[] = [];
    const missing: string[] = [];

    const fieldLabels: Record<string, string> = {
      user_name: 'Name',
      user_email: 'Email',
      organization_name: 'Organization',
      geography: 'Geography',
      org_type: 'Org type',
      org_size: 'Org size',
      nomination_subject: 'Nomination subject',
      description: 'Achievement description',
      achievement_focus: 'Focus areas',
    };

    for (const [field, label] of Object.entries(fieldLabels)) {
      const val = context[field];
      if (val && (!Array.isArray(val) || val.length > 0)) {
        let display = String(val);
        if (display.length > 80) {
          display = display.substring(0, 77) + '...';
        }
        collected.push(`  ${label}: ${display}`);
      } else {
        missing.push(`  ${label}`);
      }
    }

    const lines = ['Conversation stage:'];
    if (collected.length > 0) {
      lines.push('Collected so far:');
      lines.push(...collected);
    } else {
      lines.push('Nothing collected yet (conversation just started).');
    }

    if (missing.length > 0) {
      lines.push('Still missing:');
      lines.push(...missing);
    } else {
      lines.push('All key fields have been collected.');
    }

    return lines.join('\n');
  }

  /**
   * Describe recent conversation history
   */
  private describeRecentHistory(history: Array<{ role: string; content: string }>): string {
    if (history.length === 0) {
      return 'Recent conversation:\n  (none — this is the first message)';
    }

    const recent = history.slice(-6);
    const lines = ['Recent conversation:'];

    for (const msg of recent) {
      const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
      let content = msg.content;
      if (content.length > 200) {
        content = content.substring(0, 197) + '...';
      }
      lines.push(`  ${role}: ${content}`);
    }

    return lines.join('\n');
  }

  /**
   * Parse OpenAI response
   */
  private parseResponse(raw: string): IntentResult {
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

      // Validate intent
      let intent = result.intent?.toLowerCase()?.trim() || 'information';
      if (!VALID_INTENTS.includes(intent as Intent)) {
        logger.warn('unknown_intent_value', {
          raw_intent: result.intent,
          falling_back_to: 'information',
        });
        intent = 'information';
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
        intent: intent as Intent,
        confidence,
        reasoning: result.reasoning || '',
      };
    } catch (error: any) {
      logger.error('intent_json_parse_error', {
        error: error.message,
        response: text.substring(0, 300),
      });

      return {
        intent: 'information',
        confidence: 0.3,
        reasoning: 'Failed to parse LLM JSON, defaulting to information',
      };
    }
  }
}

// Export singleton instance
export const intentClassifier = new IntentClassifier();
