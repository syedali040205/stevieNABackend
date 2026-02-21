# Design Document

## Overview

This design implements Phase 1 scalability optimizations for the Stevie Awards Nomination Assistant chatbot. The system currently breaks at 20-30 concurrent users due to OpenAI rate limiting, lack of caching, and inefficient token usage. This phase implements five critical optimizations to achieve 10x improvement in concurrent user capacity (20 → 200 users) while reducing costs by 60%.

The design maintains all existing functionality and API contracts while introducing:
1. Request queue with priority-based concurrency control
2. Multi-layer caching for recommendations, explanations, and intake responses
3. Sliding window conversation memory management
4. Token-optimized prompts and context pruning
5. Backward-compatible implementation

Target metrics after Phase 1:
- Concurrent users: 200 (10x improvement)
- Success rate @ 100 users: 95%+ (from 9%)
- Average response time: 20 seconds (from 60s)
- OpenAI cost per user: $0.06 (from $0.15, 60% reduction)

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Unified Chatbot API                      │
│                  (Express Route Handler)                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Unified Chatbot Service                     │
│  • Context classification (QA vs Recommendation)             │
│  • Session management                                        │
│  • Conversation orchestration                                │
└──────┬──────────────────────────┬───────────────────────────┘
       │                          │
       │ QA Mode                  │ Recommendation Mode
       ▼                          ▼
┌──────────────────┐    ┌────────────────────────────┐
│ Conversation     │    │   Intake Assistant         │
│ Manager          │    │   • Field extraction       │
│ • KB search      │    │   • Next question logic    │
│ • Response gen   │    │   • Readiness check        │
└────┬─────────────┘    └──────────┬─────────────────┘
     │                             │
     │                             ▼
     │                  ┌────────────────────────────┐
     │                  │  Recommendation Engine     │
     │                  │  • Embedding generation    │
     │                  │  • Similarity search       │
     │                  │  • Explanation generation  │
     │                  └──────────┬─────────────────┘
     │                             │
     ▼                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    OpenAI Request Queue (NEW)                │
│  • Priority queue (p-queue)                                  │
│  • Concurrency limit: 10                                     │
│  • Rate limit: 50 req/sec                                    │
│  • Priority: intake > explanations                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      OpenAI Service                          │
│  • Chat completions (with queue)                             │
│  • Embeddings (with queue)                                   │
│  • Circuit breaker                                           │
│  • Retry logic                                               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Cache Manager (Enhanced)                  │
│  • Embedding cache (7 days) ✓ existing                      │
│  • KB search cache (1 hour) ✓ existing                      │
│  • Recommendation cache (24 hours) ✓ NEW                    │
│  • Explanation cache (7 days) ✓ NEW                         │
│  • Intake response cache (1 hour) ✓ NEW                     │
│  • Conversation summary cache (1 hour) ✓ NEW                │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

**Recommendation Flow (Optimized)**:
```
User Message
    ↓
Intake Assistant (check cache for similar intake responses)
    ↓
Extract fields + determine next question
    ↓
If ready for recommendations:
    ↓
Generate context hash (nomination_subject + org_type + description)
    ↓
Check recommendation cache (24h TTL)
    ↓
Cache HIT → Return cached recommendations
    ↓
Cache MISS → Generate embedding (check embedding cache first)
    ↓
Similarity search
    ↓
For each category: Check explanation cache (7d TTL)
    ↓
Cache HIT → Use cached explanation
    ↓
Cache MISS → Queue explanation generation (priority: low)
    ↓
Cache results + return to user
```

**Conversation Memory Flow (NEW)**:
```
Conversation History (N messages)
    ↓
Is N <= 6?
    ↓
YES → Use all messages as-is
    ↓
NO → Split into: older messages (N-6) + recent messages (6)
    ↓
Generate hash of older messages
    ↓
Check summary cache (1h TTL)
    ↓
Cache HIT → Use cached summary
    ↓
Cache MISS → Generate summary (gpt-4o-mini, max 150 tokens)
    ↓
Cache summary
    ↓
Build context: [Summary] + [Recent 6 messages]
```

## Components and Interfaces

### 1. OpenAI Request Queue (NEW)

**Purpose**: Manage concurrent OpenAI API requests with rate limiting and priority-based scheduling.

**Implementation**: Use `p-queue` npm package

```typescript
import PQueue from 'p-queue';

interface QueuePriority {
  INTAKE: 1;
  RECOMMENDATION: 2;
  EXPLANATION: 3;
  QA: 2;
}

class OpenAIRequestQueue {
  private queue: PQueue;
  private readonly MAX_CONCURRENT = 10;
  private readonly RATE_LIMIT_PER_SECOND = 50;
  
  constructor() {
    this.queue = new PQueue({
      concurrency: this.MAX_CONCURRENT,
      interval: 1000,
      intervalCap: this.RATE_LIMIT_PER_SECOND,
    });
  }
  
  async enqueue<T>(
    fn: () => Promise<T>,
    priority: number = QueuePriority.QA
  ): Promise<T> {
    return this.queue.add(fn, { priority });
  }
  
  getStats() {
    return {
      size: this.queue.size,
      pending: this.queue.pending,
    };
  }
}
```

**Integration Points**:
- Wrap all `openaiService.chatCompletion()` calls
- Wrap all `openaiService.generateEmbedding()` calls
- Wrap all `openaiService.chatCompletionStream()` calls

**Priority Levels**:
- Priority 1 (highest): Intake questions (user is waiting for next question)
- Priority 2 (medium): Recommendations, QA responses
- Priority 3 (lowest): Explanation generation (can be slower)

### 2. Enhanced Cache Manager

**Purpose**: Add new cache layers for recommendations, explanations, and intake responses.

**New Cache Keys**:

```typescript
// Recommendation cache key
function getRecommendationCacheKey(context: {
  nomination_subject: string;
  org_type: string;
  description: string;
}): string {
  const normalized = {
    nomination_subject: context.nomination_subject.toLowerCase().trim(),
    org_type: context.org_type.toLowerCase().trim(),
    description: context.description.toLowerCase().trim().substring(0, 500),
  };
  const hash = crypto.createHash('md5')
    .update(JSON.stringify(normalized))
    .digest('hex');
  return `rec:${hash}`;
}

// Explanation cache key
function getExplanationCacheKey(categoryId: string): string {
  return `exp:${categoryId}`;
}

// Intake response cache key
function getIntakeCacheKey(question: string): string {
  const normalized = question
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '');
  const hash = crypto.createHash('md5')
    .update(normalized)
    .digest('hex');
  return `intake:${hash}`;
}

// Conversation summary cache key
function getSummaryCacheKey(messages: Message[]): string {
  const content = messages.map(m => m.content).join('|');
  const hash = crypto.createHash('md5')
    .update(content)
    .digest('hex');
  return `summary:${hash}`;
}
```

**New Methods**:

```typescript
class CacheManager {
  // Recommendation caching (24h TTL)
  async getRecommendations(contextHash: string): Promise<Recommendation[] | null>;
  async setRecommendations(contextHash: string, recommendations: Recommendation[]): Promise<boolean>;
  
  // Explanation caching (7d TTL)
  async getExplanation(categoryId: string): Promise<string | null>;
  async setExplanation(categoryId: string, explanation: string): Promise<boolean>;
  
  // Intake response caching (1h TTL)
  async getIntakeResponse(questionHash: string): Promise<IntakeResponse | null>;
  async setIntakeResponse(questionHash: string, response: IntakeResponse): Promise<boolean>;
  
  // Conversation summary caching (1h TTL)
  async getSummary(messagesHash: string): Promise<string | null>;
  async setSummary(messagesHash: string, summary: string): Promise<boolean>;
}
```

### 3. Conversation Memory Manager (NEW)

**Purpose**: Implement sliding window approach for conversation history to reduce token usage.

```typescript
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

class ConversationMemoryManager {
  private readonly SHORT_TERM_WINDOW = 6;
  private readonly MAX_SUMMARY_TOKENS = 150;
  private readonly SUMMARY_CACHE_TTL = 3600; // 1 hour
  
  async buildContext(conversationHistory: Message[]): Promise<string> {
    // Short conversations: use all messages
    if (conversationHistory.length <= this.SHORT_TERM_WINDOW) {
      return this.formatMessages(conversationHistory);
    }
    
    // Long conversations: summary + recent window
    const recentMessages = conversationHistory.slice(-this.SHORT_TERM_WINDOW);
    const olderMessages = conversationHistory.slice(0, -this.SHORT_TERM_WINDOW);
    
    // Get or generate summary
    const summary = await this.getSummary(olderMessages);
    
    return `Previous conversation summary: ${summary}\n\nRecent messages:\n${this.formatMessages(recentMessages)}`;
  }
  
  private async getSummary(messages: Message[]): Promise<string> {
    const cacheKey = this.getSummaryCacheKey(messages);
    
    // Check cache
    const cached = await cacheManager.getSummary(cacheKey);
    if (cached) return cached;
    
    // Generate summary
    const summary = await openaiRequestQueue.enqueue(
      () => openaiService.chatCompletion({
        messages: [{
          role: 'system',
          content: 'Summarize this conversation in 2-3 sentences, focusing on key facts collected.'
        }, {
          role: 'user',
          content: this.formatMessages(messages)
        }],
        model: 'gpt-4o-mini',
        maxTokens: this.MAX_SUMMARY_TOKENS,
        temperature: 0.3,
      }),
      QueuePriority.QA
    );
    
    // Cache summary
    await cacheManager.setSummary(cacheKey, summary);
    
    return summary;
  }
  
  private formatMessages(messages: Message[]): string {
    return messages.map(m => `${m.role}: ${m.content}`).join('\n');
  }
  
  private getSummaryCacheKey(messages: Message[]): string {
    const content = messages.map(m => m.content).join('|');
    return crypto.createHash('md5').update(content).digest('hex');
  }
}
```

### 4. Token-Optimized Prompts

**Purpose**: Reduce token usage in prompts by 40-60% while maintaining functionality.

**Optimization Strategies**:

1. **Concise System Prompts**:
```typescript
// BEFORE (verbose - ~800 tokens)
const systemPrompt = `
You are a friendly Stevie Awards assistant helping someone with their nomination. 
Be conversational and warm. You will look at the current userContext (a draft 
nomination profile) AND the user's latest message. Extract any fields you can 
from the latest message into updates. Decide what field is missing next and 
ask ONE natural, conversational question.

[... many more lines of instructions ...]
`;

// AFTER (concise - ~200 tokens)
const systemPrompt = `
Stevie Awards assistant. Extract fields from user message, ask next missing field naturally.

Required fields: user_name, user_email, nomination_subject, org_type, gender_programs_opt_in, recognition_scope, description
Optional: achievement_impact, achievement_innovation, achievement_challenges

Return JSON: {updates: {}, next_field: string|null, next_question: string, ready_for_recommendations: bool}
`;
```

2. **JSON Schema for Structured Output**:
```typescript
// Use OpenAI's structured output instead of text instructions
const response = await openaiService.chatCompletion({
  messages: [{ role: 'system', content: systemPrompt }],
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'intake_response',
      schema: {
        type: 'object',
        properties: {
          updates: { type: 'object' },
          next_field: { type: 'string', nullable: true },
          next_question: { type: 'string' },
          ready_for_recommendations: { type: 'boolean' }
        },
        required: ['updates', 'next_question', 'ready_for_recommendations']
      }
    }
  }
});
```

3. **Compact Context Formatting**:
```typescript
// BEFORE (verbose)
const context = `
User Name: ${userContext.user_name}
User Email: ${userContext.user_email}
Nomination Subject: ${userContext.nomination_subject}
...
`;

// AFTER (compact JSON)
const context = JSON.stringify({
  name: userContext.user_name,
  email: userContext.user_email,
  subject: userContext.nomination_subject,
  // Only include non-empty fields
}, null, 0); // No indentation
```

### 5. Context Window Optimizer

**Purpose**: Prune context to stay under 2000 tokens while preserving essential information.

```typescript
class ContextOptimizer {
  private readonly MAX_CONTEXT_TOKENS = 2000;
  
  buildOptimalContext(
    userContext: any,
    conversationHistory: Message[]
  ): string {
    const parts: string[] = [];
    let tokenCount = 0;
    
    // 1. Essential fields only (exclude empty/null)
    const essentialFields = this.extractEssentialFields(userContext);
    const fieldsText = JSON.stringify(essentialFields);
    tokenCount += this.estimateTokens(fieldsText);
    parts.push(fieldsText);
    
    // 2. Recent conversation (via memory manager)
    const conversationText = await conversationMemoryManager.buildContext(
      conversationHistory
    );
    tokenCount += this.estimateTokens(conversationText);
    
    // 3. If under limit, include conversation
    if (tokenCount < this.MAX_CONTEXT_TOKENS) {
      parts.push(conversationText);
    } else {
      // Prioritize recent messages over summary
      const recentOnly = conversationHistory.slice(-6);
      parts.push(this.formatMessages(recentOnly));
    }
    
    return parts.join('\n\n');
  }
  
  private extractEssentialFields(context: any): any {
    // Only include non-empty fields
    return Object.entries(context)
      .filter(([_, v]) => v !== null && v !== undefined && v !== '')
      .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});
  }
  
  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }
}
```

## Data Models

### Queue Statistics

```typescript
interface QueueStats {
  size: number;           // Number of queued requests
  pending: number;        // Number of executing requests
  concurrency: number;    // Max concurrent requests
  rateLimit: number;      // Max requests per second
}
```

### Cache Entry

```typescript
interface CacheEntry<T> {
  key: string;
  value: T;
  ttl: number;           // Time to live in seconds
  createdAt: number;     // Unix timestamp
}
```

### Conversation Summary

```typescript
interface ConversationSummary {
  summary: string;
  messageCount: number;
  createdAt: number;
}
```

### Intake Response Cache

```typescript
interface IntakeResponseCache {
  updates: Record<string, any>;
  next_field: string | null;
  next_question: string;
  ready_for_recommendations: boolean;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Queue Concurrency Limit

*For any* sequence of OpenAI requests, at any point in time, the number of concurrently executing requests should never exceed 10.

**Validates: Requirements 1.1**

### Property 2: Queue Rate Limiting

*For any* 1-second time window, the number of OpenAI requests that begin execution should not exceed 50.

**Validates: Requirements 1.2**

### Property 3: Priority Ordering

*For any* queue state containing both intake requests and explanation requests, when a worker becomes available, an intake request should be dequeued before any explanation request.

**Validates: Requirements 1.3**

### Property 4: Promise Resolution

*For any* function enqueued in the request queue, the returned promise should resolve with the same value that the function returns.

**Validates: Requirements 1.4**

### Property 5: Queue Without Rejection

*For any* number of requests enqueued when the queue is at capacity, all requests should be queued successfully without throwing rejection errors.

**Validates: Requirements 1.5**

### Property 6: Retry with Exponential Backoff

*For any* request that fails with a retryable error (429 or 5xx), the request should be retried up to 3 times with exponentially increasing delays (1s, 2s, 4s).

**Validates: Requirements 1.6**

### Property 7: Recommendation Cache Round Trip

*For any* valid user context, if recommendations are generated and cached, then retrieving them within 24 hours should return the same recommendations without calling OpenAI.

**Validates: Requirements 2.2**

### Property 8: Explanation Cache Round Trip

*For any* category ID, if an explanation is generated and cached, then retrieving it within 7 days should return the same explanation without calling OpenAI.

**Validates: Requirements 2.4**

### Property 9: Cache Key Determinism

*For any* user context with the same nomination_subject, org_type, and description, the generated cache key should be identical across multiple invocations.

**Validates: Requirements 2.7**

### Property 10: Sliding Window Maintenance

*For any* conversation history with more than 6 messages, the active window should contain exactly the last 6 messages.

**Validates: Requirements 3.1**

### Property 11: Summary Generation for Long Conversations

*For any* conversation history with more than 6 messages, a summary should be generated for the older messages (all except the last 6).

**Validates: Requirements 3.2**

### Property 12: Summary Cache Round Trip

*For any* set of messages, if a summary is generated and cached, then requesting a summary for the same messages within 1 hour should return the cached summary without calling OpenAI.

**Validates: Requirements 3.4**

### Property 13: Context Structure with Summary

*For any* conversation with more than 6 messages, the built context should contain the summary text followed by the recent 6 messages.

**Validates: Requirements 3.5**

### Property 14: JSON Schema Usage

*For any* OpenAI request requiring structured output, the request should include a JSON schema in the response_format parameter.

**Validates: Requirements 4.3**

### Property 15: Compact Context Format

*For any* context data formatted for OpenAI, the format should be compact JSON without unnecessary whitespace.

**Validates: Requirements 4.5**

### Property 16: Functional Equivalence After Optimization

*For any* user input and context, the optimized system should produce functionally equivalent outputs (same fields extracted, same next question logic) as the original system.

**Validates: Requirements 4.6**

### Property 17: Empty Field Exclusion

*For any* user context, fields with null, undefined, or empty string values should be excluded from the context payload sent to OpenAI.

**Validates: Requirements 5.1, 5.2**

### Property 18: Token Budget Compliance

*For any* context payload built for OpenAI, the estimated token count should not exceed 2000 tokens.

**Validates: Requirements 5.3**

### Property 19: Message Prioritization Near Limit

*For any* context approaching 2000 tokens, recent messages should be included in preference to older summary content.

**Validates: Requirements 5.4**

### Property 20: Compact JSON Formatting

*For any* context formatted as JSON, the string should not contain unnecessary whitespace (no indentation, no extra spaces).

**Validates: Requirements 5.5**

### Property 21: API Contract Stability

*For any* API request format used before optimization, the same request format should be accepted after optimization and produce a response with the same schema.

**Validates: Requirements 7.1**

### Property 22: Streaming Format Consistency

*For any* streaming response, the chunk format and event types should match the original implementation (type: 'chunk', 'intent', 'recommendations', 'status').

**Validates: Requirements 7.2**

### Property 23: Recommendation Response Schema

*For any* recommendation response, it should include all required fields: category_id, category_name, description, program_name, program_code, similarity_score, and optionally match_reasons.

**Validates: Requirements 7.3**

### Property 24: Error Response Consistency

*For any* error condition, the error response should include the same error code and message format as the original implementation.

**Validates: Requirements 7.4**

### Property 25: Intake Flow Field Collection

*For any* intake conversation, the system should collect all 7 required fields (user_name, user_email, nomination_subject, org_type, gender_programs_opt_in, recognition_scope, description) before generating recommendations.

**Validates: Requirements 7.5**

## Error Handling

### Queue Errors

1. **Rate Limit Exceeded**: When OpenAI returns 429, the queue's retry logic handles it automatically with exponential backoff
2. **Queue Timeout**: If a request is queued for more than 60 seconds, log warning but don't fail (queue will process eventually)
3. **Queue Full**: p-queue has no hard limit, so requests queue indefinitely (monitor queue size metrics)

### Cache Errors

1. **Redis Unavailable**: Graceful degradation - continue without caching (already implemented in cacheManager)
2. **Cache Miss**: Normal operation - generate fresh result and cache it
3. **Cache Corruption**: If cached data fails to parse, log error, delete key, and regenerate

### Memory Management Errors

1. **Summary Generation Failure**: If summary generation fails, fall back to using all messages (may exceed token limit, but better than failing)
2. **Token Estimation Error**: If estimation fails, use conservative limit (1500 tokens) to ensure safety

### Backward Compatibility Errors

1. **Schema Mismatch**: If response schema doesn't match expected format, log error and return graceful fallback
2. **Missing Fields**: If required fields are missing from response, use default values and log warning

## Testing Strategy

### Unit Tests

Unit tests verify specific examples, edge cases, and error conditions. Focus on:

1. **Cache Key Generation**:
   - Test MD5 hash generation for various contexts
   - Test normalization (lowercase, trim, substring)
   - Test determinism (same input → same key)

2. **Context Pruning**:
   - Test empty field exclusion
   - Test token estimation accuracy
   - Test prioritization logic

3. **Error Handling**:
   - Test graceful degradation when Redis unavailable
   - Test fallback behavior when cache corrupted
   - Test retry logic with mock failures

### Property-Based Tests

Property tests verify universal properties across all inputs using randomized testing. Each test should run minimum 100 iterations.

**Configuration**: Use `fast-check` library for TypeScript

```typescript
import fc from 'fast-check';

// Example property test structure
describe('Property Tests', () => {
  it('Property 1: Queue Concurrency Limit', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.func(fc.constant(Promise.resolve('result'))), { minLength: 20, maxLength: 100 }),
        async (requests) => {
          // Test implementation
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

**Property Test Tags**: Each test must include a comment referencing the design property:

```typescript
// Feature: scalability-phase-1-optimizations, Property 1: Queue Concurrency Limit
it('should never exceed 10 concurrent requests', async () => {
  // Test implementation
});
```

**Key Properties to Test**:

1. **Queue Concurrency** (Property 1): Generate random request sequences, verify max 10 concurrent
2. **Cache Round Trip** (Properties 7, 8, 12): Generate random data, cache it, retrieve within TTL, verify equality
3. **Sliding Window** (Property 10): Generate random conversation histories, verify last 6 messages preserved
4. **Token Budget** (Property 18): Generate random contexts, verify token count ≤ 2000
5. **API Contract** (Property 21): Generate random requests, verify response schema matches original

### Integration Tests

Integration tests verify the system works end-to-end under realistic conditions:

1. **Stress Test**: Run comprehensive-stress-test.js with 100 concurrent users, verify 95%+ success rate
2. **Cost Measurement**: Track token usage across 100 conversations, verify average cost ≤ $0.06 per user
3. **Response Time**: Measure average response time under load, verify ≤ 20 seconds
4. **Cache Hit Rate**: Monitor cache hit rates, verify ≥ 80% for recommendations and explanations

### Performance Benchmarks

Before and after metrics to validate improvements:

| Metric | Before | Target | Measurement Method |
|--------|--------|--------|-------------------|
| Concurrent Users | 20 | 200 | Stress test with gradual ramp-up |
| Success Rate @ 100 users | 9% | 95% | comprehensive-stress-test.js |
| Avg Response Time | 60s | 20s | Time from request to complete response |
| Cost per User | $0.15 | $0.06 | Token usage × OpenAI pricing |
| Cache Hit Rate | 0% | 80% | Redis cache hits / total requests |

## Implementation Notes

### Dependencies

New dependencies to add:
```json
{
  "dependencies": {
    "p-queue": "^8.0.1"
  },
  "devDependencies": {
    "fast-check": "^3.15.0"
  }
}
```

### Configuration

New environment variables:
```bash
# Queue configuration
OPENAI_QUEUE_CONCURRENCY=10
OPENAI_QUEUE_RATE_LIMIT=50

# Cache TTLs (seconds)
RECOMMENDATION_CACHE_TTL=86400  # 24 hours
EXPLANATION_CACHE_TTL=604800    # 7 days
INTAKE_CACHE_TTL=3600           # 1 hour
SUMMARY_CACHE_TTL=3600          # 1 hour

# Context optimization
MAX_CONTEXT_TOKENS=2000
CONVERSATION_WINDOW_SIZE=6
MAX_SUMMARY_TOKENS=150
```

### Monitoring

Key metrics to track:
- Queue size and pending requests (Prometheus gauge)
- Cache hit rates by type (Prometheus counter)
- Token usage per request (Prometheus histogram)
- Response time percentiles (p50, p95, p99)
- OpenAI API errors by type

### Rollout Strategy

1. **Phase 1a**: Deploy queue and caching (low risk)
2. **Phase 1b**: Deploy memory management (medium risk)
3. **Phase 1c**: Deploy token optimization (high risk - test thoroughly)
4. **Validation**: Run stress tests after each phase
5. **Rollback Plan**: Feature flags for each optimization, can disable independently

### Future Optimizations (Phase 2+)

Items deferred to future phases:
- Horizontal scaling with AWS ECS Fargate
- Hybrid vector search with reranking
- Prompt compression with LLMLingua
- Streaming recommendations as they're generated
- A/B testing framework for optimization validation
