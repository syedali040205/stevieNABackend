# Chatbot Codebase Best Practices

## Document Overview

This document provides practical, actionable best practices for the Stevie Awards Nomination Assistant chatbot. It synthesizes patterns already in use in the codebase with industry standards to create a simple, maintainable production system.

**Last Updated:** February 2026  
**Status:** Reference Document  
**Audience:** Developers working on the chatbot system

---

## Table of Contents

1. [Architecture Patterns](#architecture-patterns)
2. [Error Handling](#error-handling)
3. [Caching Strategy](#caching-strategy)
4. [Logging & Monitoring](#logging--monitoring)
5. [Security & Rate Limiting](#security--rate-limiting)
6. [Code Organization](#code-organization)
7. [Testing Strategy](#testing-strategy)
8. [Deployment Practices](#deployment-practices)
9. [Performance Optimization](#performance-optimization)
10. [AI Chatbot-Specific Patterns](#ai-chatbot-specific-patterns)
11. [RAG (Retrieval-Augmented Generation) Optimization](#rag-retrieval-augmented-generation-optimization)
12. [Production-Grade RAG Latency Optimization](#production-grade-rag-latency-optimization)
13. [Advanced RAG Latency Optimization Techniques (2024-2025 Research)](#advanced-rag-latency-optimization-techniques-2024-2025-research)
14. [Quick Reference Checklist](#quick-reference-checklist)

---

## Architecture Patterns

### Service Layer Pattern ✅ Already Implemented

The codebase uses a clean service layer architecture that separates concerns:

```
Routes (HTTP) → Services (Business Logic) → External APIs (OpenAI, Supabase, Redis)
```

**What we do well:**
- Clear separation between HTTP handling and business logic
- Services are focused and single-purpose
- Dependency injection through singleton exports

**Example from codebase:**
```typescript
// api/src/routes/unified-chatbot.ts - Route layer
router.post('/chat', asyncHandler(async (req, res) => {
  const result = await unifiedChatbotService.processMessage(req.body);
  res.json(result);
}));

// api/src/services/unifiedChatbotService.ts - Business logic
export class UnifiedChatbotService {
  async processMessage(params) {
    // Business logic here
  }
}
```

**Best Practice:** Keep routes thin - they should only handle HTTP concerns (validation, auth, response formatting). All business logic goes in services.

### Queue-Based Request Management ✅ Implemented

All OpenAI requests go through a priority queue to prevent rate limiting:

```typescript
// Priority levels
enum QueuePriority {
  INTAKE = 1,           // Highest - user is waiting
  QA = 2,               // Medium - standard requests
  RECOMMENDATION = 2,   // Medium - recommendations
  EXPLANATION = 3       // Lowest - background tasks
}

// Usage
await openaiRequestQueue.enqueue(
  () => openaiService.chatCompletion(params),
  QueuePriority.INTAKE
);
```

**Best Practice:** Always use the queue for OpenAI calls. Never call OpenAI directly - it bypasses rate limiting and priority management.

### Circuit Breaker Pattern ✅ Implemented

Prevents cascade failures when external services are down:

```typescript
// api/src/utils/circuitBreaker.ts
const breaker = createCircuitBreaker(
  (fn) => fn(),
  async () => {
    throw new Error('AI service temporarily unavailable');
  }
);

// Automatically opens after 50% failure rate
// Tries again after 30 seconds
```

**Best Practice:** Wrap all external service calls in circuit breakers. This prevents your app from hammering a failing service and gives it time to recover.

### Graceful Degradation ✅ Implemented

System continues working even when Redis is unavailable:

```typescript
// api/src/services/cacheManager.ts
async getEmbedding(text: string): Promise<number[] | null> {
  if (!this.redisAvailable) {
    return null; // Graceful degradation - continue without cache
  }
  // ... cache logic
}
```

**Best Practice:** Never let cache failures break your app. Always have a fallback path that works without caching.

---

## Error Handling

### Structured Error Types ✅ Implemented

Use typed errors for consistent handling:

```typescript
// api/src/middleware/errorHandler.ts
export const ErrorTypes = {
  VALIDATION_ERROR: 'ValidationError',
  AUTHENTICATION_ERROR: 'AuthenticationError',
  RATE_LIMIT_ERROR: 'RateLimitError',
  EXTERNAL_SERVICE_ERROR: 'ExternalServiceError',
  // ... more types
};

// Helper functions
export const createError = {
  validation: (message, details) => new AppError(400, message, 'ValidationError', details),
  rateLimit: (message) => new AppError(429, message, 'RateLimitError'),
  // ... more helpers
};
```

**Best Practice:** Use typed errors instead of throwing generic Error objects. This makes error handling predictable and testable.

### Retry Logic with Exponential Backoff ✅ Implemented

Automatically retry transient failures:

```typescript
// api/src/services/openaiService.ts
async function retryWithBackoff<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryableError(error) || attempt === 3) throw error;
      
      const delay = 1000 * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      await sleep(delay);
    }
  }
}

// Only retry these errors
function isRetryableError(error: any): boolean {
  const status = error?.status;
  if (status === 429) return true;  // Rate limit
  if (status >= 500) return true;   // Server error
  return false;
}
```

**Best Practice:** 
- Only retry transient errors (429, 5xx)
- Don't retry client errors (400, 401, 403, 404)
- Use exponential backoff to avoid hammering the service
- Limit retries to 3 attempts

### Global Error Handler ✅ Implemented

Catch all errors in one place:

```typescript
// api/src/middleware/errorHandler.ts
export const errorHandlerMiddleware = (err, req, res, next) => {
  // Log with context
  logger.error('Request error', {
    correlationId: req.correlationId,
    errorCode: err.errorCode,
    message: err.message,
    stack: err.stack,
  });
  
  // Track metrics
  errorCounter.inc({ error_type: err.errorCode });
  
  // Return user-friendly response
  res.status(err.statusCode).json({
    success: false,
    error: err.errorCode,
    message: err.message,
    correlationId: req.correlationId,
  });
};
```

**Best Practice:** 
- Always use the global error handler
- Log errors with correlation IDs for tracing
- Never expose internal error details to users in production
- Track error metrics for monitoring

---

## Caching Strategy

### Multi-Layer Caching ✅ Implemented

Different cache TTLs for different data types:

```typescript
// api/src/services/cacheManager.ts
const CACHE_TTLS = {
  EMBEDDING: 7 * 24 * 3600,    // 7 days - embeddings rarely change
  SESSION: 3600,                // 1 hour - user sessions
  RATE_LIMIT: 60,               // 60 seconds - rate limit windows
  KB_SEARCH: 3600,              // 1 hour - knowledge base results
};
```

**Best Practice:** Match TTL to data volatility:
- Static data (embeddings, explanations): 7 days
- Semi-static data (recommendations): 24 hours
- Dynamic data (sessions, intake responses): 1 hour
- Transient data (rate limits): 60 seconds

### Cache Key Design ✅ Implemented

Use deterministic, normalized keys:

```typescript
// api/src/services/cacheManager.ts
private getEmbeddingKey(text: string, model: string): string {
  const normalized = text.trim().toLowerCase();
  const hash = crypto.createHash('sha256')
    .update(normalized)
    .digest('hex');
  return `emb:${model}:${hash}`;
}
```

**Best Practice:**
- Normalize inputs (lowercase, trim) before hashing
- Use prefixes to namespace keys (`emb:`, `sess:`, `rate:`)
- Use SHA256 for long text, MD5 for short text
- Include version in key if schema changes

### Cache-Aside Pattern ✅ Implemented

Check cache first, populate on miss:

```typescript
// api/src/services/openaiService.ts
async generateEmbedding(text: string): Promise<number[]> {
  // Check cache first
  const cached = await cacheManager.getEmbedding(text, model);
  if (cached) return cached;
  
  // Cache miss - generate and cache
  const embedding = await openai.embeddings.create({ model, input: text });
  await cacheManager.setEmbedding(text, model, embedding);
  
  return embedding;
}
```

**Best Practice:**
- Always check cache before expensive operations
- Cache asynchronously (don't wait for cache write to complete)
- Handle cache failures gracefully (continue without caching)

---

## Logging & Monitoring

### Structured Logging ✅ Implemented

Use structured logs with context:

```typescript
// api/src/utils/logger.ts
logger.info('openai_request', {
  correlationId: req.correlationId,
  model: 'gpt-4o-mini',
  tokens: 150,
  latencyMs: 1200,
  userId: req.user?.id,
});

logger.error('openai_error', {
  correlationId: req.correlationId,
  error: error.message,
  stack: error.stack,
  retryAttempt: 2,
});
```

**Best Practice:**
- Use structured fields, not string concatenation
- Include correlation IDs for request tracing
- Log at appropriate levels:
  - `error`: Failures that need attention
  - `warn`: Degraded performance, retries
  - `info`: Important business events
  - `debug`: Detailed diagnostic info
- Never log sensitive data (API keys, passwords, PII)

### Correlation IDs ✅ Implemented

Track requests across services:

```typescript
// api/src/middleware/correlationId.ts
export const correlationIdMiddleware = (req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] || uuidv4();
  res.setHeader('X-Correlation-ID', req.correlationId);
  next();
};
```

**Best Practice:**
- Generate correlation ID at entry point
- Pass it through all service calls
- Include in all logs
- Return in response headers for client-side tracing

### Metrics Collection ✅ Implemented

Track key metrics with Prometheus:

```typescript
// api/src/utils/metrics.ts
import { Counter, Histogram, Gauge } from 'prom-client';

// Request metrics
export const requestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

// Error metrics
export const errorCounter = new Counter({
  name: 'errors_total',
  help: 'Total errors',
  labelNames: ['error_type', 'severity'],
});

// Token usage
export const openaiTokensTotal = new Counter({
  name: 'openai_tokens_total',
  help: 'Total OpenAI tokens used',
  labelNames: ['type', 'model'],
});
```

**Best Practice:**
- Use Histograms for latency (not averages)
- Use Counters for events (requests, errors, tokens)
- Use Gauges for current state (queue size, connections)
- Add labels for filtering (route, status, error_type)

---

## Security & Rate Limiting

### Input Validation ✅ Implemented

Validate all inputs with Zod:

```typescript
// api/src/middleware/validation.ts
import { z } from 'zod';

const chatRequestSchema = z.object({
  message: z.string().min(1).max(5000),
  sessionId: z.string().uuid(),
  userId: z.string().optional(),
});

export const validateChatRequest = (req, res, next) => {
  try {
    req.body = chatRequestSchema.parse(req.body);
    next();
  } catch (error) {
    throw createError.validation('Invalid request', error.errors);
  }
};
```

**Best Practice:**
- Validate all user inputs
- Use schema validation (Zod, Joi)
- Reject invalid requests early
- Return clear validation errors

### Rate Limiting ✅ Implemented

Protect endpoints from abuse:

```typescript
// api/src/services/cacheManager.ts
async checkRateLimit(
  ip: string,
  route: string,
  limit: number = 30
): Promise<{ allowed: boolean; remaining: number }> {
  const key = `rate:${ip}:${route}`;
  const count = await redis.incr(key);
  
  if (count === 1) {
    await redis.expire(key, 60); // 60 second window
  }
  
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
  };
}
```

**Best Practice:**
- Rate limit by IP and route
- Use Redis for distributed rate limiting
- Return rate limit headers (`X-RateLimit-Remaining`, `X-RateLimit-Reset`)
- Graceful degradation if Redis unavailable (allow request)

### Authentication & Authorization ✅ Implemented

Verify JWT tokens:

```typescript
// api/src/middleware/auth.ts
export const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    throw createError.authentication('No token provided');
  }
  
  try {
    const { data: user, error } = await supabase.auth.getUser(token);
    if (error) throw error;
    
    req.user = user;
    next();
  } catch (error) {
    throw createError.authentication('Invalid token');
  }
};
```

**Best Practice:**
- Use JWT tokens for stateless auth
- Verify tokens on every request
- Store minimal data in tokens
- Use short expiry times (1 hour)
- Refresh tokens before expiry

---

## Code Organization

### File Structure

```
api/
├── src/
│   ├── config/          # Configuration (supabase, redis)
│   ├── middleware/      # Express middleware (auth, validation, errors)
│   ├── routes/          # HTTP route handlers
│   ├── services/        # Business logic
│   ├── utils/           # Utilities (logger, metrics, circuit breaker)
│   └── index.ts         # App entry point
├── scripts/             # Maintenance scripts
├── tests/               # Test files
└── package.json
```

**Best Practice:**
- Group by feature/concern, not by type
- Keep files small and focused (< 300 lines)
- Co-locate tests with source files (`*.test.ts`)
- Use barrel exports (`index.ts`) for clean imports

### Naming Conventions

```typescript
// Classes: PascalCase
class OpenAIService {}
class CacheManager {}

// Functions: camelCase
function generateEmbedding() {}
async function retryWithBackoff() {}

// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;
const CACHE_TTL = 3600;

// Interfaces: PascalCase with I prefix (optional)
interface RequestParams {}
interface IUserContext {}

// Enums: PascalCase
enum QueuePriority {
  INTAKE = 1,
  QA = 2,
}
```

**Best Practice:**
- Be consistent with naming
- Use descriptive names (avoid abbreviations)
- Prefix booleans with `is`, `has`, `should`
- Prefix async functions with `async` or use `Promise<T>` return type

### Dependency Management

```typescript
// ✅ Good: Singleton exports
export const openaiService = new OpenAIService();
export const cacheManager = new CacheManager();

// ✅ Good: Lazy initialization
class OpenAIService {
  private client: OpenAI | null = null;
  
  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this.client;
  }
}

// ❌ Bad: Direct instantiation in imports
import OpenAI from 'openai';
const client = new OpenAI(); // Crashes if API key not set
```

**Best Practice:**
- Use singleton pattern for services
- Lazy initialize expensive resources
- Inject dependencies through constructors
- Avoid circular dependencies

---

## Testing Strategy

### Unit Tests

Test individual functions in isolation:

```typescript
// api/src/services/intakeAssistant.test.ts
describe('IntakeAssistant', () => {
  it('should extract user_name from message', () => {
    const result = extractField('My name is John', 'user_name');
    expect(result).toBe('John');
  });
  
  it('should return null if field not found', () => {
    const result = extractField('Hello', 'user_name');
    expect(result).toBeNull();
  });
});
```

**Best Practice:**
- Test one thing per test
- Use descriptive test names
- Mock external dependencies
- Test edge cases (empty, null, invalid)

### Integration Tests

Test services working together:

```typescript
describe('Unified Chatbot Integration', () => {
  it('should complete intake flow and generate recommendations', async () => {
    const service = new UnifiedChatbotService();
    
    // Simulate intake conversation
    await service.processMessage({ message: 'My name is John' });
    await service.processMessage({ message: 'john@example.com' });
    // ... more messages
    
    const result = await service.processMessage({ 
      message: 'We improved sales by 50%' 
    });
    
    expect(result.recommendations).toHaveLength(5);
  });
});
```

**Best Practice:**
- Test realistic user flows
- Use test database/Redis
- Clean up after tests
- Run integration tests separately from unit tests

### Property-Based Tests

Test universal properties across random inputs:

```typescript
import fc from 'fast-check';

describe('Cache Key Generation', () => {
  it('should generate same key for equivalent inputs', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (text) => {
          const key1 = getCacheKey(text);
          const key2 = getCacheKey(text.trim().toLowerCase());
          return key1 === key2;
        }
      )
    );
  });
});
```

**Best Practice:**
- Use for testing invariants (properties that always hold)
- Test with 100+ random inputs
- Good for: parsers, validators, cache keys, data transformations

---

## Deployment Practices

### Environment Variables

```bash
# api/.env.example
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_QUEUE_CONCURRENCY=10
OPENAI_QUEUE_RATE_LIMIT=50

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_CONNECT_TIMEOUT_MS=10000
REDIS_COMMAND_TIMEOUT_MS=5000

# Supabase
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# App
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
```

**Best Practice:**
- Never commit `.env` files
- Provide `.env.example` with all variables
- Use different values per environment
- Validate required variables on startup
- Use secrets management in production (AWS Secrets Manager, Render secrets)

### Health Checks

```typescript
// api/src/routes/health.ts
router.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    redis: await cacheManager.healthCheck(),
    supabase: await checkSupabaseHealth(),
  };
  
  const isHealthy = health.redis && health.supabase;
  res.status(isHealthy ? 200 : 503).json(health);
});
```

**Best Practice:**
- Implement `/health` endpoint
- Check all critical dependencies
- Return 503 if unhealthy (load balancer will remove instance)
- Include version info for debugging

### Graceful Shutdown

```typescript
// api/src/index.ts
const server = app.listen(PORT);

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  // Stop accepting new requests
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  // Close connections
  await cacheManager.close();
  await supabase.close();
  
  process.exit(0);
});
```

**Best Practice:**
- Handle SIGTERM signal
- Stop accepting new requests
- Wait for in-flight requests to complete
- Close database/cache connections
- Exit with code 0

---

## Performance Optimization

### Database Query Optimization

```typescript
// ✅ Good: Use indexes
CREATE INDEX idx_categories_embedding ON categories USING ivfflat (embedding vector_cosine_ops);

// ✅ Good: Limit results
const results = await supabase
  .from('categories')
  .select('*')
  .limit(10);

// ❌ Bad: Select all without limit
const results = await supabase
  .from('categories')
  .select('*'); // Could return millions of rows
```

**Best Practice:**
- Always use LIMIT on queries
- Create indexes on frequently queried columns
- Use vector indexes for similarity search
- Monitor slow queries

### Async/Await Best Practices

```typescript
// ✅ Good: Parallel execution
const [user, session, recommendations] = await Promise.all([
  getUserProfile(userId),
  getSession(sessionId),
  getRecommendations(context),
]);

// ❌ Bad: Sequential execution
const user = await getUserProfile(userId);
const session = await getSession(sessionId);
const recommendations = await getRecommendations(context);
```

**Best Practice:**
- Use `Promise.all()` for independent operations
- Use `Promise.allSettled()` if some can fail
- Avoid sequential awaits when possible
- Be careful with loops (use `Promise.all(array.map(...))`)

### Memory Management

```typescript
// ✅ Good: Stream large responses
async function* streamResponse(data) {
  for (const chunk of data) {
    yield chunk;
    await sleep(10); // Allow event loop to process
  }
}

// ❌ Bad: Load everything into memory
async function loadAllData() {
  const allData = await fetchMillionsOfRecords();
  return allData; // OOM error
}
```

**Best Practice:**
- Stream large responses
- Use pagination for large datasets
- Clean up event listeners
- Monitor memory usage in production

---

## AI Chatbot-Specific Patterns

### Streaming Responses (SSE vs WebSockets)

For chatbots, Server-Sent Events (SSE) is usually the better choice:

| Feature | WebSockets | SSE |
|---------|-----------|-----|
| Direction | Bidirectional | Server → Client only |
| Complexity | More complex | Simple HTTP |
| Firewall | Sometimes blocked | Works everywhere |
| Reconnection | Manual | Automatic |
| Best For | Gaming, collaboration | Chat, notifications, streaming |

**Best Practice:** Use SSE for streaming LLM responses. ChatGPT uses SSE - if it's good enough for them, it's good enough for most use cases.

```typescript
// ✅ Good: SSE streaming with EventSourceResponse
import { EventSourceResponse } from 'sse-starlette/sse';

@app.post("/chat")
async def chat_stream(request: ChatRequest):
    async def event_generator():
        async for chunk in stream_llm_response(request.message):
            yield {
                "event": "message",
                "data": json.dumps({"text": chunk})
            }
        yield {"event": "done", "data": json.dumps({"status": "complete"})}
    
    return EventSourceResponse(event_generator())
```

### Time To First Token (TTFT)

The goal: User sees the first word in less than 300ms.

**How to achieve it:**
1. Don't wait for database - save messages in background
2. Start LLM call immediately - don't wait for anything
3. Send tokens as soon as you get them - don't buffer too much
4. Keep connections alive - reuse HTTP connections

```typescript
// ✅ Good: Parallel operations
async function stream_llm_response(message: string, thread_id: string) {
    // Retrieve context in parallel with LLM initialization
    const context_task = asyncio.create_task(get_context(thread_id));
    
    // Start LLM stream immediately
    const stream = openai.ChatCompletion.acreate({
        model: "gpt-4",
        messages: await context_task,  // Wait only when needed
        stream: true
    });
    
    // Stream immediately, don't buffer
    for await (const chunk of stream) {
        const token = chunk.choices[0].delta.get("content", "");
        if (token) yield token;
    }
}
```

### Conversation Context Management

For chatbots with long conversations, use a sliding window approach:

```typescript
// ✅ Good: Sliding window with summary
async function get_conversation_context(thread_id: string, max_tokens: number = 4000) {
    const recent_messages = await db.fetch(
        "SELECT role, content FROM chat_messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT 20",
        thread_id
    );
    
    const total_tokens = sum(count_tokens(msg.content) for msg in recent_messages);
    
    if (total_tokens <= max_tokens) {
        // Fits! Return all messages
        return recent_messages.reverse();
    } else {
        // Too long! Summarize old messages, keep recent ones
        return await get_summarized_context(thread_id, recent_messages);
    }
}
```

### Tool Calling / Function Calling

Let the LLM decide when to use tools instead of always searching:

```typescript
// Define available tools
const tools = [
    {
        name: "search_knowledge_base",
        description: "Search company documentation",
        parameters: {"query": "string"}
    },
    {
        name: "get_user_data",
        description: "Get user account info",
        parameters: {"user_id": "string"}
    }
];

// LLM decides if it needs tools
const response = await llm.chat({
    messages: [{"role": "user", "content": "Where is my order?"}],
    tools: tools
});

// Check if LLM wants to use a tool
if (response.tool_calls) {
    // Execute the tool and send result back to LLM
    const tool_result = await execute_tool(response.tool_calls[0]);
    const final_response = await llm.chat({
        messages: [
            {"role": "user", "content": "Where is my order?"},
            {"role": "assistant", "content": null, "tool_calls": response.tool_calls},
            {"role": "tool", "content": tool_result}
        ]
    });
}
```

**Best Practice:** Don't search your knowledge base for simple greetings like "Hi" or "Thanks" - let the LLM respond directly. This saves time and money.

---

## RAG (Retrieval-Augmented Generation) Optimization

### Overview

RAG systems combine retrieval (finding relevant documents) with generation (LLM responses). The quality of your RAG system depends on both retrieval accuracy and generation quality. This section covers practical optimization techniques for production RAG systems.

**Key Metrics to Track**:
- Retrieval Recall: % of relevant documents retrieved
- Retrieval Precision: % of retrieved documents that are relevant
- End-to-End Accuracy: % of correct final answers
- Latency: Time from query to response
- Cost: Embedding + LLM token costs

### Hybrid Search (Vector + Keyword)

Combine vector similarity with keyword matching for better retrieval:

```typescript
// ✅ Good: Hybrid search with weighted combination
async function hybridSearch(query: string, limit: number = 10) {
  // Vector search (70% weight)
  const embedding = await generateEmbedding(query);
  const vectorResults = await vectorSearch(embedding, limit * 2);
  
  // Keyword search with BM25 (30% weight)
  const keywordResults = await keywordSearch(query, limit * 2);
  
  // Combine and rerank
  const combined = mergeResults(vectorResults, keywordResults, {
    vectorWeight: 0.7,
    keywordWeight: 0.3,
  });
  
  return combined.slice(0, limit);
}

// Merge function with weighted scoring
function mergeResults(vectorResults, keywordResults, weights) {
  const scoreMap = new Map();
  
  // Add vector scores
  vectorResults.forEach((result, index) => {
    const score = (1 - index / vectorResults.length) * weights.vectorWeight;
    scoreMap.set(result.id, { ...result, score });
  });
  
  // Add keyword scores
  keywordResults.forEach((result, index) => {
    const keywordScore = (1 - index / keywordResults.length) * weights.keywordWeight;
    const existing = scoreMap.get(result.id);
    if (existing) {
      existing.score += keywordScore;
    } else {
      scoreMap.set(result.id, { ...result, score: keywordScore });
    }
  });
  
  // Sort by combined score
  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score);
}
```

**Best Practice**: Use 70% vector + 30% keyword weighting as a starting point. Adjust based on your data - technical content benefits from higher keyword weight, conversational content from higher vector weight.

### Chunking Strategies

How you split documents affects retrieval quality:

```typescript
// ✅ Good: Fixed-size chunks with overlap
function chunkDocument(text: string, chunkSize: number = 512, overlap: number = 50): string[] {
  const tokens = tokenize(text);
  const chunks: string[] = [];
  
  for (let i = 0; i < tokens.length; i += chunkSize - overlap) {
    const chunk = tokens.slice(i, i + chunkSize);
    chunks.push(chunk.join(' '));
  }
  
  return chunks;
}

// ✅ Better: Semantic chunking by paragraph/section
function semanticChunk(text: string, maxTokens: number = 512): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = '';
  let currentTokens = 0;
  
  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);
    
    if (currentTokens + paraTokens > maxTokens && currentChunk) {
      // Current chunk is full, start new one
      chunks.push(currentChunk.trim());
      currentChunk = para;
      currentTokens = paraTokens;
    } else {
      // Add to current chunk
      currentChunk += '\n\n' + para;
      currentTokens += paraTokens;
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}
```

**Best Practice**:
- Start with 512 tokens per chunk (works for 80% of cases)
- Use 50-100 token overlap to avoid splitting related content
- Prefer semantic boundaries (paragraphs, sections) over arbitrary splits
- For structured content (code, tables), use custom chunking logic

### Embedding Optimization

Reduce costs and improve quality:

```typescript
// ✅ Good: Cache embeddings aggressively
async function getEmbedding(text: string): Promise<number[]> {
  const cacheKey = `emb:${hashText(text)}`;
  
  // Check cache (7 day TTL)
  const cached = await cache.get(cacheKey);
  if (cached) return cached;
  
  // Generate embedding
  const embedding = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  
  // Cache for 7 days
  await cache.set(cacheKey, embedding, 7 * 24 * 3600);
  
  return embedding;
}

// ✅ Good: Batch embedding generation
async function batchGenerateEmbeddings(texts: string[]): Promise<number[][]> {
  // OpenAI supports up to 2048 inputs per batch
  const batchSize = 2048;
  const results: number[][] = [];
  
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
    });
    results.push(...response.data.map(d => d.embedding));
  }
  
  return results;
}
```

**Best Practice**:
- Cache all embeddings (7 day TTL minimum)
- Use batch API for bulk operations (up to 2048 inputs)
- Normalize text before embedding (lowercase, trim, remove extra spaces)
- Monitor cache hit rate (target: 60-80%)

### Query Expansion and Rewriting

Improve retrieval by expanding user queries:

```typescript
// ✅ Good: Add synonyms and related terms
function expandQuery(query: string): string {
  const expansions: string[] = [query];
  
  // Add common synonyms
  if (query.includes('AI')) {
    expansions.push(query.replace('AI', 'artificial intelligence'));
    expansions.push(query.replace('AI', 'machine learning'));
  }
  
  if (query.includes('product')) {
    expansions.push(query + ' innovation');
    expansions.push(query + ' development');
  }
  
  return expansions.join('. ');
}

// ✅ Better: Use LLM to generate hypothetical document (HyDE)
async function generateHypotheticalDocument(query: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'system',
      content: 'Generate a detailed paragraph that would answer this question. Focus on concrete facts and terminology.'
    }, {
      role: 'user',
      content: query
    }],
    max_tokens: 200,
    temperature: 0.3,
  });
  
  return response.choices[0].message.content;
}
```

**Best Practice**:
- Start with simple synonym expansion
- Use HyDE (Hypothetical Document Embeddings) for complex queries
- Cache expanded queries (1 hour TTL)
- A/B test query expansion impact on accuracy

### Reranking

Improve top results with a reranking model:

```typescript
// ✅ Good: Two-stage retrieval with reranking
async function retrieveWithReranking(
  query: string,
  initialLimit: number = 50,
  finalLimit: number = 10
): Promise<Document[]> {
  // Stage 1: Fast retrieval (vector + keyword)
  const candidates = await hybridSearch(query, initialLimit);
  
  // Stage 2: Rerank with cross-encoder
  const reranked = await rerank(query, candidates);
  
  return reranked.slice(0, finalLimit);
}

// Reranking with cross-encoder model
async function rerank(query: string, documents: Document[]): Promise<Document[]> {
  // Use a reranking model (e.g., Cohere Rerank, or custom cross-encoder)
  const pairs = documents.map(doc => ({
    query,
    document: doc.content,
  }));
  
  const scores = await rerankingModel.score(pairs);
  
  return documents
    .map((doc, i) => ({ ...doc, rerankScore: scores[i] }))
    .sort((a, b) => b.rerankScore - a.rerankScore);
}
```

**Best Practice**:
- Retrieve 50-100 candidates, rerank to top 10
- Use cross-encoder models for reranking (more accurate than bi-encoders)
- Cache reranking results (1 hour TTL)
- Monitor reranking latency (target: < 100ms)

### Evaluation and Testing

Measure RAG quality systematically:

```typescript
// ✅ Good: Synthetic test data generation
async function generateTestQueries(documents: Document[]): Promise<TestCase[]> {
  const testCases: TestCase[] = [];
  
  for (const doc of documents.slice(0, 100)) {
    // Generate question from document
    const question = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: 'Generate a specific question that this document answers.'
      }, {
        role: 'user',
        content: doc.content
      }],
      max_tokens: 50,
    });
    
    testCases.push({
      query: question.choices[0].message.content,
      expectedDocId: doc.id,
      expectedAnswer: doc.content,
    });
  }
  
  return testCases;
}

// Evaluate retrieval recall
async function evaluateRecall(testCases: TestCase[]): Promise<number> {
  let hits = 0;
  
  for (const test of testCases) {
    const results = await hybridSearch(test.query, 10);
    const retrieved = results.map(r => r.id);
    
    if (retrieved.includes(test.expectedDocId)) {
      hits++;
    }
  }
  
  return hits / testCases.length;
}
```

**Best Practice**:
- Generate 100+ synthetic test cases from your documents
- Measure retrieval recall (target: 90%+)
- Measure end-to-end accuracy with human evaluation
- Run evaluation after every major change

### User Feedback Loop

Improve over time with user feedback:

```typescript
// ✅ Good: Collect implicit feedback
async function logRetrievalFeedback(
  query: string,
  results: Document[],
  userAction: 'clicked' | 'ignored' | 'thumbs_up' | 'thumbs_down'
) {
  await db.insert('retrieval_feedback', {
    query,
    result_ids: results.map(r => r.id),
    action: userAction,
    timestamp: Date.now(),
  });
}

// Use feedback to fine-tune embeddings
async function fineTuneEmbeddings() {
  // Get positive examples (clicked, thumbs up)
  const positives = await db.query(`
    SELECT query, result_id
    FROM retrieval_feedback
    WHERE action IN ('clicked', 'thumbs_up')
  `);
  
  // Get negative examples (ignored, thumbs down)
  const negatives = await db.query(`
    SELECT query, result_id
    FROM retrieval_feedback
    WHERE action IN ('ignored', 'thumbs_down')
  `);
  
  // Fine-tune embedding model with contrastive learning
  // (Use OpenAI fine-tuning API or custom training)
}
```

**Best Practice**:
- Track user clicks, thumbs up/down, time spent
- Use feedback to fine-tune embeddings (10-30% recall improvement)
- A/B test changes before rolling out
- Review low-confidence predictions manually

### Cost Optimization

Reduce RAG costs by 60-80%:

```typescript
// ✅ Good: Cache popular queries
async function cachedRAG(query: string): Promise<string> {
  const cacheKey = `rag:${hashText(query)}`;
  
  // Check cache (1 hour TTL)
  const cached = await cache.get(cacheKey);
  if (cached) {
    logger.info('rag_cache_hit', { query });
    return cached;
  }
  
  // Generate response
  const response = await generateRAGResponse(query);
  
  // Cache for 1 hour
  await cache.set(cacheKey, response, 3600);
  
  return response;
}

// ✅ Good: Use smaller models for retrieval
const EMBEDDING_MODEL = 'text-embedding-3-small'; // $0.02 per 1M tokens
const GENERATION_MODEL = 'gpt-4o-mini';           // $0.15 per 1M input tokens

// ❌ Bad: Using expensive models unnecessarily
const EMBEDDING_MODEL = 'text-embedding-3-large'; // $0.13 per 1M tokens (6.5x more expensive)
const GENERATION_MODEL = 'gpt-4o';                // $2.50 per 1M input tokens (16x more expensive)
```

**Best Practice**:
- Cache embeddings (7 days) and responses (1 hour)
- Use `text-embedding-3-small` for embeddings (good enough for most cases)
- Use `gpt-4o-mini` for generation (10x cheaper than gpt-4o)
- Monitor cache hit rate (target: 60-80%)

### RAG Architecture Pattern

Complete RAG implementation:

```typescript
class RAGSystem {
  async query(userQuery: string): Promise<string> {
    // 1. Check response cache
    const cached = await this.checkCache(userQuery);
    if (cached) return cached;
    
    // 2. Expand query (optional)
    const expandedQuery = await this.expandQuery(userQuery);
    
    // 3. Hybrid search
    const candidates = await this.hybridSearch(expandedQuery, 50);
    
    // 4. Rerank (optional)
    const topDocs = await this.rerank(userQuery, candidates, 10);
    
    // 5. Generate response
    const context = topDocs.map(d => d.content).join('\n\n');
    const response = await this.generate(userQuery, context);
    
    // 6. Cache response
    await this.cacheResponse(userQuery, response);
    
    // 7. Log for feedback
    await this.logQuery(userQuery, topDocs, response);
    
    return response;
  }
  
  private async generate(query: string, context: string): Promise<string> {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: 'Answer the question using only the provided context. If the context does not contain the answer, say "I don\'t have enough information to answer that."'
      }, {
        role: 'user',
        content: `Context:\n${context}\n\nQuestion: ${query}`
      }],
      temperature: 0.3,
    });
    
    return response.choices[0].message.content;
  }
}
```

### Advanced RAG Patterns (2025)

Modern RAG systems are moving beyond simple retrieve-then-generate pipelines to more sophisticated architectures:

#### Agentic Chunking

Agentic chunking uses LLMs to intelligently determine chunk boundaries based on semantic understanding rather than mathematical similarity:

```typescript
// ✅ Advanced: LLM-based agentic chunking
async function agenticChunk(document: string): Promise<Chunk[]> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'system',
      content: `Analyze this document and identify logical breakpoints. For each chunk:
1. Identify the main topic/proposition
2. Generate a summary (2-3 sentences)
3. Extract key entities and concepts
4. Generate 2-3 questions this chunk answers

Return JSON array of chunks with: text, summary, keywords, questions`
    }, {
      role: 'user',
      content: document
    }],
    response_format: { type: 'json_object' }
  });
  
  return JSON.parse(response.choices[0].message.content).chunks;
}
```

**Best Practice**: Use agentic chunking for high-value documents (contracts, technical specs) where retrieval failure is costly. For general content, semantic chunking is more cost-effective.

#### Corrective RAG (CRAG)

CRAG adds self-correction to prevent hallucinations from irrelevant retrieved context:

```typescript
// ✅ Advanced: Corrective RAG with relevance grading
async function correctiveRAG(query: string): Promise<string> {
  // 1. Initial retrieval
  const docs = await hybridSearch(query, 10);
  
  // 2. Grade relevance of each document
  const graded = await Promise.all(docs.map(async (doc) => {
    const score = await gradeRelevance(query, doc);
    return { doc, score };
  }));
  
  // 3. Determine action based on relevance
  const relevant = graded.filter(g => g.score > 0.7);
  const ambiguous = graded.filter(g => g.score >= 0.4 && g.score <= 0.7);
  
  let context = '';
  
  if (relevant.length >= 3) {
    // High confidence - use retrieved docs
    context = relevant.map(g => g.doc.content).join('\n\n');
  } else if (ambiguous.length > 0) {
    // Ambiguous - refine and extract key sentences
    context = await refineContext(query, ambiguous.map(g => g.doc));
  } else {
    // Low confidence - fallback to web search
    logger.warn('crag_fallback_triggered', { query });
    const webResults = await webSearch(query);
    context = webResults.map(r => r.content).join('\n\n');
  }
  
  // 4. Generate with curated context
  return await generate(query, context);
}

async function gradeRelevance(query: string, doc: Document): Promise<number> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'system',
      content: 'Rate document relevance to query on scale 0-1. Return only the number.'
    }, {
      role: 'user',
      content: `Query: ${query}\n\nDocument: ${doc.content}`
    }],
    temperature: 0,
  });
  
  return parseFloat(response.choices[0].message.content);
}
```

**Best Practice**: Implement CRAG for high-stakes applications where hallucinations are unacceptable (medical, legal, financial). The relevance grading adds latency but dramatically reduces false answers.

#### Query Transformation Techniques

Advanced query transformation improves retrieval by bridging the vocabulary gap:

```typescript
// ✅ Advanced: Step-Back Prompting
async function stepBackPrompting(specificQuery: string): Promise<string> {
  // Generate abstract version of query
  const stepBackQuery = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'system',
      content: 'Generate a more abstract, high-level version of this question that captures the underlying principles.'
    }, {
      role: 'user',
      content: specificQuery
    }],
    temperature: 0.3,
  });
  
  const abstractQuery = stepBackQuery.choices[0].message.content;
  
  // Retrieve for both queries
  const [specificDocs, abstractDocs] = await Promise.all([
    hybridSearch(specificQuery, 5),
    hybridSearch(abstractQuery, 5),
  ]);
  
  // Combine: abstract docs provide principles, specific docs provide details
  const context = [
    'General Principles:',
    ...abstractDocs.map(d => d.content),
    '\nSpecific Information:',
    ...specificDocs.map(d => d.content),
  ].join('\n\n');
  
  return await generate(specificQuery, context);
}

// ✅ Advanced: Query Decomposition (ReDI)
async function decomposedRetrieval(complexQuery: string): Promise<string> {
  // 1. Decompose into sub-queries
  const decomposition = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'system',
      content: 'Break this complex query into 2-4 focused sub-queries. Return JSON array.'
    }, {
      role: 'user',
      content: complexQuery
    }],
    response_format: { type: 'json_object' }
  });
  
  const subQueries = JSON.parse(decomposition.choices[0].message.content).queries;
  
  // 2. Retrieve for each sub-query in parallel
  const results = await Promise.all(
    subQueries.map(q => hybridSearch(q, 5))
  );
  
  // 3. Deduplicate and rerank combined results
  const allDocs = results.flat();
  const unique = deduplicateById(allDocs);
  const reranked = await rerank(complexQuery, unique);
  
  return await generate(complexQuery, reranked.slice(0, 10));
}
```

**Best Practice**: Use Step-Back for reasoning-heavy queries (STEM, analysis). Use decomposition for multi-part questions (comparisons, aggregations).

#### Parent Document Retrieval

Solve the chunk size dilemma by searching small chunks but retrieving large context:

```typescript
// ✅ Advanced: Parent Document Retrieval
interface ChildChunk {
  id: string;
  content: string;
  embedding: number[];
  parentId: string;
}

interface ParentDocument {
  id: string;
  content: string;
  childIds: string[];
}

async function parentDocumentRetrieval(query: string): Promise<string> {
  // 1. Search small, precise child chunks
  const embedding = await generateEmbedding(query);
  const childHits = await vectorSearch(embedding, 'child_chunks', 20);
  
  // 2. Retrieve full parent documents
  const parentIds = [...new Set(childHits.map(c => c.parentId))];
  const parents = await db.query(
    'SELECT * FROM parent_documents WHERE id = ANY($1)',
    [parentIds]
  );
  
  // 3. Rerank parents (not children)
  const reranked = await rerank(query, parents);
  
  // 4. Generate with full context
  const context = reranked.slice(0, 5).map(p => p.content).join('\n\n');
  return await generate(query, context);
}
```

**Best Practice**: Use 100-200 token child chunks for search, 1000-2000 token parents for generation. This gives you "microscope search with telescope context".

### RAG Evaluation with RAGAS

Systematic evaluation is critical for production RAG systems. RAGAS (Retrieval Augmented Generation Assessment) provides quantitative metrics:

```typescript
// ✅ Good: RAGAS evaluation framework
interface RAGASMetrics {
  faithfulness: number;      // 0-1: Answer grounded in context?
  contextPrecision: number;  // 0-1: Relevant docs ranked high?
  contextRecall: number;     // 0-1: All needed info retrieved?
  answerRelevancy: number;   // 0-1: Answer addresses query?
}

async function evaluateRAGAS(
  query: string,
  retrievedDocs: Document[],
  generatedAnswer: string,
  groundTruth?: string
): Promise<RAGASMetrics> {
  // Faithfulness: Extract claims and verify against context
  const claims = await extractClaims(generatedAnswer);
  const supportedClaims = await Promise.all(
    claims.map(claim => isClaimSupported(claim, retrievedDocs))
  );
  const faithfulness = supportedClaims.filter(Boolean).length / claims.length;
  
  // Context Precision: Relevant docs should rank higher
  const relevanceScores = await Promise.all(
    retrievedDocs.map((doc, i) => ({
      position: i,
      relevant: await isRelevant(query, doc)
    }))
  );
  const contextPrecision = calculatePrecisionAtK(relevanceScores);
  
  // Answer Relevancy: Generate questions from answer, compare to query
  const generatedQuestions = await generateQuestions(generatedAnswer);
  const similarities = await Promise.all(
    generatedQuestions.map(q => cosineSimilarity(
      await generateEmbedding(q),
      await generateEmbedding(query)
    ))
  );
  const answerRelevancy = similarities.reduce((a, b) => a + b) / similarities.length;
  
  return {
    faithfulness,
    contextPrecision,
    contextRecall: groundTruth ? await calculateRecall(retrievedDocs, groundTruth) : 0,
    answerRelevancy,
  };
}

// Production monitoring
async function monitorRAGQuality() {
  const testCases = await loadGoldenDataset();
  const results = await Promise.all(
    testCases.map(async (test) => {
      const docs = await hybridSearch(test.query, 10);
      const answer = await generate(test.query, docs);
      return evaluateRAGAS(test.query, docs, answer, test.groundTruth);
    })
  );
  
  const avgMetrics = {
    faithfulness: avg(results.map(r => r.faithfulness)),
    contextPrecision: avg(results.map(r => r.contextPrecision)),
    answerRelevancy: avg(results.map(r => r.answerRelevancy)),
  };
  
  // Alert if metrics drop below thresholds
  if (avgMetrics.faithfulness < 0.9) {
    logger.error('rag_faithfulness_degraded', avgMetrics);
  }
  if (avgMetrics.contextPrecision < 0.8) {
    logger.error('rag_precision_degraded', avgMetrics);
  }
  
  return avgMetrics;
}
```

**Best Practice**: 
- Run RAGAS evaluation on every major change (chunking, embedding model, prompt)
- Maintain a golden dataset of 100+ test cases
- Set CI/CD thresholds: Faithfulness > 0.9, Context Precision > 0.8
- Monitor production metrics weekly

### Quick RAG Optimization Checklist

When optimizing RAG systems:

**Foundational (Must Have)**:
- [ ] Implement hybrid search (vector + keyword)
- [ ] Use semantic chunking with 512 token chunks
- [ ] Cache embeddings (7 day TTL)
- [ ] Cache popular queries (1 hour TTL)
- [ ] Implement reranking for top 10 results
- [ ] Use smaller models (3-small, gpt-4o-mini)

**Advanced (High-Value Applications)**:
- [ ] Add query expansion for short queries
- [ ] Implement Step-Back prompting for reasoning queries
- [ ] Use query decomposition for complex questions
- [ ] Implement Parent Document Retrieval
- [ ] Add Corrective RAG (CRAG) with relevance grading
- [ ] Consider agentic chunking for critical documents

**Evaluation & Monitoring**:
- [ ] Generate synthetic test data (100+ cases)
- [ ] Implement RAGAS metrics (faithfulness, precision, relevancy)
- [ ] Set CI/CD quality gates (faithfulness > 0.9)
- [ ] Monitor production metrics weekly
- [ ] Collect user feedback (clicks, ratings)
- [ ] A/B test optimizations before rollout

**Cost Optimization**:
- [ ] Monitor costs (embedding + generation)
- [ ] Measure cache hit rate (target: 60-80%)
- [ ] Use two-stage retrieval (fast + precise)
- [ ] Batch embedding generation where possible

---

## Production-Grade RAG Latency Optimization

### Overview

Production RAG systems face a critical challenge: balancing quality with latency. Research shows that RAG configurations should be adapted per-query based on query complexity, not using a one-size-fits-all approach. This section covers advanced latency optimization techniques based on recent research (METIS, 2025).

**Key Insight**: Different queries need different configurations. Simple queries can use fewer chunks and faster synthesis methods, while complex queries need more chunks and sophisticated reasoning. Adapting configuration per-query can reduce latency by 1.64-2.54× without sacrificing quality.

### Configuration Knobs for RAG Systems

Modern RAG systems have three primary configuration parameters that dramatically affect latency:

```typescript
interface RAGConfiguration {
  numChunks: number;           // 1-20: More chunks = better quality, higher latency
  synthesisMethod: string;     // 'stuff' | 'map_reduce' | 'map_rerank'
  intermediateLength: number;  // 50-500: Tokens for intermediate summaries
}

// Example configurations
const FAST_CONFIG: RAGConfiguration = {
  numChunks: 3,
  synthesisMethod: 'stuff',
  intermediateLength: 0,  // Not used for 'stuff'
};

const BALANCED_CONFIG: RAGConfiguration = {
  numChunks: 7,
  synthesisMethod: 'map_rerank',
  intermediateLength: 150,
};

const QUALITY_CONFIG: RAGConfiguration = {
  numChunks: 15,
  synthesisMethod: 'map_reduce',
  intermediateLength: 300,
};
```

**Configuration Impact on Latency**:
- `numChunks`: Linear impact (3 chunks = 1.2s, 15 chunks = 3.8s)
- `synthesisMethod`: 
  - `stuff` (fastest): Concatenate all chunks, single LLM call
  - `map_rerank` (balanced): Score each chunk, use top-k
  - `map_reduce` (highest quality): Summarize each chunk, then synthesize
- `intermediateLength`: Affects map_reduce latency (longer = more tokens)

### Query Complexity Profiling

The key to adaptive configuration is estimating query complexity before retrieval:

```typescript
// ✅ Advanced: LLM-based query profiling
async function profileQuery(query: string): Promise<QueryProfile> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'system',
      content: `Analyze this query and return JSON with:
{
  "complexity": "simple" | "moderate" | "complex",
  "reasoning": "brief explanation",
  "requiresMultipleSources": boolean,
  "requiresReasoning": boolean,
  "estimatedChunksNeeded": number (1-20)
}

Simple: Factual lookup, single concept (e.g., "What is X?")
Moderate: Comparison, multi-step (e.g., "How does X compare to Y?")
Complex: Analysis, synthesis, multi-hop reasoning (e.g., "Analyze the impact of X on Y considering Z")`
    }, {
      role: 'user',
      content: query
    }],
    response_format: { type: 'json_object' },
    temperature: 0,
  });
  
  return JSON.parse(response.choices[0].message.content);
}

// ✅ Good: Heuristic-based profiling (faster, cheaper)
function profileQueryHeuristic(query: string): QueryProfile {
  const tokens = query.split(/\s+/).length;
  const hasComparison = /compare|versus|vs|difference|better|worse/i.test(query);
  const hasAnalysis = /analyze|evaluate|assess|impact|effect|why|how/i.test(query);
  const hasMultiPart = /and|also|additionally|furthermore/i.test(query);
  
  let complexity: 'simple' | 'moderate' | 'complex';
  let estimatedChunks: number;
  
  if (tokens <= 5 && !hasComparison && !hasAnalysis) {
    complexity = 'simple';
    estimatedChunks = 3;
  } else if (tokens <= 15 && (hasComparison || hasMultiPart)) {
    complexity = 'moderate';
    estimatedChunks = 7;
  } else {
    complexity = 'complex';
    estimatedChunks = 15;
  }
  
  return {
    complexity,
    requiresMultipleSources: hasComparison || hasMultiPart,
    requiresReasoning: hasAnalysis,
    estimatedChunksNeeded: estimatedChunks,
  };
}
```

**Best Practice**: Start with heuristic profiling (0ms overhead). Add LLM profiling only if heuristics show poor accuracy (< 80% correct classification).

### Adaptive Configuration Selection

Select RAG configuration based on query profile:

```typescript
// ✅ Advanced: Adaptive RAG with configuration selection
class AdaptiveRAGSystem {
  private configs = {
    simple: {
      numChunks: 3,
      synthesisMethod: 'stuff',
      intermediateLength: 0,
    },
    moderate: {
      numChunks: 7,
      synthesisMethod: 'map_rerank',
      intermediateLength: 150,
    },
    complex: {
      numChunks: 15,
      synthesisMethod: 'map_reduce',
      intermediateLength: 300,
    },
  };
  
  async query(userQuery: string): Promise<string> {
    // 1. Profile query complexity
    const profile = profileQueryHeuristic(userQuery);
    const config = this.configs[profile.complexity];
    
    logger.info('adaptive_rag_config_selected', {
      query: userQuery,
      complexity: profile.complexity,
      config,
    });
    
    // 2. Retrieve with adaptive chunk count
    const docs = await this.hybridSearch(userQuery, config.numChunks);
    
    // 3. Synthesize with adaptive method
    const response = await this.synthesize(
      userQuery,
      docs,
      config.synthesisMethod,
      config.intermediateLength
    );
    
    return response;
  }
  
  private async synthesize(
    query: string,
    docs: Document[],
    method: string,
    intermediateLength: number
  ): Promise<string> {
    switch (method) {
      case 'stuff':
        return this.stuffSynthesis(query, docs);
      case 'map_rerank':
        return this.mapRerankSynthesis(query, docs);
      case 'map_reduce':
        return this.mapReduceSynthesis(query, docs, intermediateLength);
      default:
        throw new Error(`Unknown synthesis method: ${method}`);
    }
  }
  
  // Fastest: Concatenate all chunks, single LLM call
  private async stuffSynthesis(query: string, docs: Document[]): Promise<string> {
    const context = docs.map(d => d.content).join('\n\n');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: 'Answer using the provided context.'
      }, {
        role: 'user',
        content: `Context:\n${context}\n\nQuestion: ${query}`
      }],
      temperature: 0.3,
    });
    
    return response.choices[0].message.content;
  }
  
  // Balanced: Score each chunk, use top-k
  private async mapRerankSynthesis(query: string, docs: Document[]): Promise<string> {
    // Score each document
    const scored = await Promise.all(docs.map(async (doc) => {
      const score = await this.scoreRelevance(query, doc);
      return { doc, score };
    }));
    
    // Use top 5 documents
    const topDocs = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(s => s.doc);
    
    return this.stuffSynthesis(query, topDocs);
  }
  
  // Highest quality: Summarize each chunk, then synthesize
  private async mapReduceSynthesis(
    query: string,
    docs: Document[],
    intermediateLength: number
  ): Promise<string> {
    // Map: Summarize each document
    const summaries = await Promise.all(docs.map(async (doc) => {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'system',
          content: `Summarize this document focusing on information relevant to: "${query}"`
        }, {
          role: 'user',
          content: doc.content
        }],
        max_tokens: intermediateLength,
        temperature: 0.3,
      });
      
      return response.choices[0].message.content;
    }));
    
    // Reduce: Synthesize summaries into final answer
    const combinedSummaries = summaries.join('\n\n');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: 'Synthesize these summaries into a comprehensive answer.'
      }, {
        role: 'user',
        content: `Summaries:\n${combinedSummaries}\n\nQuestion: ${query}`
      }],
      temperature: 0.3,
    });
    
    return response.choices[0].message.content;
  }
  
  private async scoreRelevance(query: string, doc: Document): Promise<number> {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: 'Rate relevance 0-1. Return only the number.'
      }, {
        role: 'user',
        content: `Query: ${query}\n\nDocument: ${doc.content}`
      }],
      temperature: 0,
    });
    
    return parseFloat(response.choices[0].message.content);
  }
}
```

**Best Practice**: 
- Use `stuff` for simple queries (70% of queries) - 1.2s average latency
- Use `map_rerank` for moderate queries (20% of queries) - 2.1s average latency
- Use `map_reduce` for complex queries (10% of queries) - 3.8s average latency
- Overall system latency improves by 1.64× compared to always using `map_reduce`

### Resource-Aware Configuration

Adapt configuration based on system load:

```typescript
// ✅ Advanced: Resource-aware adaptive RAG
class ResourceAwareRAG extends AdaptiveRAGSystem {
  async query(userQuery: string): Promise<string> {
    // 1. Profile query
    const profile = profileQueryHeuristic(userQuery);
    let config = this.configs[profile.complexity];
    
    // 2. Check system load
    const load = await this.getSystemLoad();
    
    // 3. Downgrade config if system is overloaded
    if (load.queueDepth > 50 || load.cpuUsage > 0.8) {
      logger.warn('rag_config_downgraded_due_to_load', {
        originalComplexity: profile.complexity,
        load,
      });
      
      // Downgrade to faster config
      if (profile.complexity === 'complex') {
        config = this.configs.moderate;
      } else if (profile.complexity === 'moderate') {
        config = this.configs.simple;
      }
    }
    
    // 4. Execute with selected config
    return super.queryWithConfig(userQuery, config);
  }
  
  private async getSystemLoad(): Promise<SystemLoad> {
    return {
      queueDepth: await openaiRequestQueue.getQueueSize(),
      cpuUsage: process.cpuUsage().user / 1000000, // Convert to seconds
      memoryUsage: process.memoryUsage().heapUsed / process.memoryUsage().heapTotal,
    };
  }
}
```

**Best Practice**: Gracefully degrade quality under load to maintain responsiveness. Users prefer a fast "good enough" answer over a slow perfect answer when the system is busy.

### Latency Monitoring and Optimization

Track configuration performance to optimize thresholds:

```typescript
// ✅ Good: Monitor configuration performance
interface ConfigMetrics {
  complexity: string;
  synthesisMethod: string;
  numChunks: number;
  latencyMs: number;
  qualityScore: number;
  timestamp: number;
}

class RAGMetricsCollector {
  async logConfigPerformance(
    query: string,
    config: RAGConfiguration,
    latencyMs: number,
    response: string
  ) {
    // Estimate quality (in production, use user feedback)
    const qualityScore = await this.estimateQuality(query, response);
    
    await db.insert('rag_config_metrics', {
      query_hash: hashText(query),
      complexity: this.classifyComplexity(query),
      synthesis_method: config.synthesisMethod,
      num_chunks: config.numChunks,
      latency_ms: latencyMs,
      quality_score: qualityScore,
      timestamp: Date.now(),
    });
    
    // Track Prometheus metrics
    ragLatencyHistogram.observe(
      { 
        complexity: this.classifyComplexity(query),
        method: config.synthesisMethod 
      },
      latencyMs / 1000
    );
  }
  
  // Analyze metrics to optimize thresholds
  async analyzeConfigPerformance(): Promise<ConfigAnalysis> {
    const metrics = await db.query(`
      SELECT 
        complexity,
        synthesis_method,
        AVG(latency_ms) as avg_latency,
        AVG(quality_score) as avg_quality,
        COUNT(*) as sample_count
      FROM rag_config_metrics
      WHERE timestamp > NOW() - INTERVAL '7 days'
      GROUP BY complexity, synthesis_method
    `);
    
    return metrics;
  }
}
```

**Best Practice**: 
- Log every RAG query with configuration and latency
- Analyze weekly to identify optimization opportunities
- A/B test configuration changes before rolling out
- Target: 90th percentile latency < 2s for simple queries, < 5s for complex

### Practical Implementation Guide

Step-by-step guide to implement adaptive RAG:

**Phase 1: Baseline (Week 1)**
1. Implement heuristic query profiling
2. Add configuration selection logic
3. Implement `stuff` and `map_rerank` synthesis methods
4. Deploy with logging only (no adaptive behavior yet)

**Phase 2: Validation (Week 2-3)**
1. Analyze logged data to validate heuristic accuracy
2. Measure latency distribution by complexity
3. A/B test adaptive vs. fixed configuration (20% traffic)
4. Validate quality metrics (RAGAS) are maintained

**Phase 3: Rollout (Week 4)**
1. Roll out adaptive configuration to 100% traffic
2. Monitor latency improvements (target: 1.5-2× faster)
3. Set up alerts for quality degradation
4. Document configuration thresholds

**Phase 4: Optimization (Ongoing)**
1. Collect user feedback on response quality
2. Fine-tune complexity classification thresholds
3. Experiment with new synthesis methods
4. Optimize chunk counts per complexity level

### Quick Latency Optimization Checklist

**Foundational (Implement First)**:
- [ ] Implement query complexity profiling (heuristic)
- [ ] Define 3 configuration presets (simple, moderate, complex)
- [ ] Implement `stuff` synthesis method (fastest)
- [ ] Add configuration selection logic
- [ ] Log all queries with config and latency

**Advanced (High-Impact)**:
- [ ] Implement `map_rerank` synthesis (balanced)
- [ ] Implement `map_reduce` synthesis (highest quality)
- [ ] Add resource-aware configuration downgrading
- [ ] A/B test adaptive vs. fixed configuration
- [ ] Optimize chunk counts per complexity level

**Monitoring & Optimization**:
- [ ] Track latency by complexity and synthesis method
- [ ] Monitor quality metrics (RAGAS) per configuration
- [ ] Set up alerts for latency regressions
- [ ] Analyze weekly to optimize thresholds
- [ ] Collect user feedback on response quality

**Expected Results**:
- 1.64-2.54× latency reduction for overall system
- 70% of queries use fast path (< 1.5s)
- 20% of queries use balanced path (< 3s)
- 10% of queries use quality path (< 5s)
- Quality metrics maintained (faithfulness > 0.9)

---

## Advanced RAG Latency Optimization Techniques (2024-2025 Research)

This section covers cutting-edge RAG optimization techniques from recent research papers that achieve dramatic latency improvements while maintaining or improving quality.

### KV Cache Optimization for RAG

#### RAGCache: Multilevel Knowledge Caching

RAGCache (2024) introduces a revolutionary approach to caching retrieved document KV tensors across requests, achieving up to 4× TTFT reduction and 2.1× throughput improvement.

**Key Insight**: Retrieved documents are frequently reused across different queries. Instead of recomputing KV tensors for the same documents, cache them in a GPU/host memory hierarchy.

```typescript
// ✅ Advanced: Knowledge tree for document KV cache
interface KnowledgeTreeNode {
  documentId: string;
  kvCache: KeyValueTensor[];  // Cached KV tensors
  frequency: number;           // Access frequency
  lastAccess: number;          // Last access timestamp
  avgCost: number;             // Average computation cost
  priority: number;            // Eviction priority
  children: Map<string, KnowledgeTreeNode>;
}

class RAGCache {
  private gpuCache: Map<string, KnowledgeTreeNode>;
  private hostCache: Map<string, KnowledgeTreeNode>;
  private knowledgeTree: KnowledgeTreeNode;
  
  async processQuery(query: string, documents: Document[]): Promise<string> {
    // 1. Check cache for document KV tensors
    const cachedKV: KeyValueTensor[] = [];
    const uncachedDocs: Document[] = [];
    
    for (const doc of documents) {
      const cached = await this.getCachedKV(doc.id);
      if (cached) {
        cachedKV.push(cached);
      } else {
        uncachedDocs.push(doc);
      }
    }
    
    // 2. Compute KV tensors only for uncached documents
    const newKV = uncachedDocs.length > 0 
      ? await this.computeKV(uncachedDocs)
      : [];
    
    // 3. Cache new KV tensors with PGDSF policy
    for (let i = 0; i < uncachedDocs.length; i++) {
      await this.cacheKV(uncachedDocs[i].id, newKV[i]);
    }
    
    // 4. Generate response using all KV tensors
    const allKV = [...cachedKV, ...newKV];
    return await this.generate(query, allKV);
  }
  
  // Prefix-aware Greedy-Dual-Size-Frequency (PGDSF) eviction policy
  private calculatePriority(node: KnowledgeTreeNode): number {
    // Priority = Clock + (Frequency × Cost) / Size
    // Higher priority = keep longer
    return this.clock + (node.frequency * node.avgCost) / node.size;
  }
  
  private async evictFromGPU(requiredSize: number): Promise<void> {
    // Evict leaf nodes with lowest priority first
    const leafNodes = this.getLeafNodes(this.gpuCache);
    leafNodes.sort((a, b) => a.priority - b.priority);
    
    let freedSize = 0;
    for (const node of leafNodes) {
      if (freedSize >= requiredSize) break;
      
      // Swap to host memory (only once)
      await this.swapToHost(node);
      freedSize += node.size;
      
      // Update clock
      this.clock = Math.max(this.clock, node.priority);
    }
  }
}
```

**Best Practice**:
- Cache document KV tensors in GPU memory (fast) and host memory (large capacity)
- Use PGDSF eviction policy that considers frequency, size, cost, and recency
- Swap documents to host memory only once (avoid repeated PCIe transfers)
- Organize cache as a prefix tree to handle document order sensitivity
- Expected: 4× TTFT reduction, 2.1× throughput improvement

#### Sparse RAG: Selective Context Loading

Sparse RAG (2024) eliminates latency from long-range attention by encoding documents in parallel and selectively loading only relevant KV caches during decoding.

**Key Insight**: Not all retrieved documents are equally relevant. Assess relevance during prefill, then load only high-quality document KV caches for decoding.

```typescript
// ✅ Advanced: Sparse RAG with parallel encoding and selective decoding
class SparseRAG {
  async processQuery(query: string, documents: Document[]): Promise<string> {
    // 1. Parallel encoding: Compute KV cache for each document independently
    // No cross-document attention during prefill
    const documentKVs = await Promise.all(
      documents.map(doc => this.encodeDocument(doc))
    );
    
    // 2. Per-document assessment: Score each document's relevance
    const scores = await Promise.all(
      documentKVs.map((kv, i) => 
        this.assessRelevance(query, documents[i], kv)
      )
    );
    
    // 3. Selective loading: Keep only high-scoring documents
    const threshold = 0.7;  // Configurable relevance threshold
    const selectedKVs = documentKVs.filter((kv, i) => scores[i] >= threshold);
    
    logger.info('sparse_rag_filtering', {
      totalDocs: documents.length,
      selectedDocs: selectedKVs.length,
      filterRatio: selectedKVs.length / documents.length,
    });
    
    // 4. Generation: Decode using only selected KV caches
    return await this.generate(query, selectedKVs);
  }
  
  // Encode document without cross-document attention
  private async encodeDocument(doc: Document): Promise<KeyValueTensor> {
    // Use block-wise attention mask - each document is independent
    const attentionMask = this.createBlockwiseAttentionMask(doc);
    return await this.llm.encode(doc.content, { attentionMask });
  }
  
  // Assess document relevance using control tokens
  private async assessRelevance(
    query: string,
    doc: Document,
    kv: KeyValueTensor
  ): Promise<number> {
    // Prompt LLM to assess relevance with special control token
    const assessmentPrompt = `${query}\n${doc.content}\n[ASSESS_RELEVANCE]`;
    
    // Score = probability of "Good" token
    const logits = await this.llm.forward(assessmentPrompt, { kvCache: kv });
    const goodTokenProb = this.softmax(logits)['Good'];
    
    return goodTokenProb;
  }
}
```

**Best Practice**:
- Encode documents in parallel (no cross-document attention)
- Use LLM itself to assess per-document relevance (no external classifier)
- Filter out low-relevance documents before decoding
- Expected: 2-3× decoding speedup, improved quality by filtering noise
- Average filtering: Keep 7.8/20 docs for short-form, 4.5/20 for long-form

### Speculative Decoding for RAG

#### Dynamic Speculative Pipelining

Overlap retrieval and generation by starting LLM inference with partial retrieval results, then verify when final results arrive.

```typescript
// ✅ Advanced: Speculative pipelining for RAG
class SpeculativeRAG {
  async processQuery(query: string, topK: number = 10): Promise<string> {
    // 1. Start retrieval in background
    const retrievalPromise = this.startRetrieval(query, topK);
    
    // 2. Speculatively generate with partial results
    let currentDocs: Document[] = [];
    let speculativeGeneration: Promise<string> | null = null;
    
    // Poll retrieval progress at intervals
    const checkInterval = 100; // ms
    const intervalId = setInterval(async () => {
      const partialDocs = await this.getPartialResults(retrievalPromise);
      
      // If documents changed, restart generation
      if (!this.documentsEqual(partialDocs, currentDocs)) {
        // Terminate previous speculative generation
        if (speculativeGeneration) {
          await this.terminateGeneration(speculativeGeneration);
        }
        
        // Start new speculative generation
        currentDocs = partialDocs;
        speculativeGeneration = this.generate(query, currentDocs);
      }
    }, checkInterval);
    
    // 3. Wait for final retrieval results
    const finalDocs = await retrievalPromise;
    clearInterval(intervalId);
    
    // 4. If speculative generation matches final docs, return it
    if (this.documentsEqual(finalDocs, currentDocs) && speculativeGeneration) {
      return await speculativeGeneration;
    }
    
    // 5. Otherwise, regenerate with final documents
    return await this.generate(query, finalDocs);
  }
  
  // Only start speculation if system load is low
  private shouldSpeculate(): boolean {
    const queueSize = this.getQueueSize();
    const maxPrefillBatchSize = 8;
    return queueSize < maxPrefillBatchSize;
  }
}
```

**Best Practice**:
- Split retrieval into stages, send partial results to LLM early
- Start speculative generation only if queue is not full (avoid wasted work)
- Terminate incorrect speculation after current iteration (don't block other requests)
- Expected: 1.6× latency reduction when retrieval is slow

#### Speculative RAG with Drafting

Use a smaller draft model to generate candidate tokens, then verify with the main model in parallel.

```typescript
// ✅ Advanced: Speculative RAG with draft model
class SpeculativeRAGDrafting {
  private draftModel: LLM;  // Small, fast model
  private targetModel: LLM; // Large, accurate model
  
  async processQuery(query: string, documents: Document[]): Promise<string> {
    // 1. Draft model generates candidate tokens quickly
    const draftTokens = await this.draftModel.generate(query, documents, {
      maxTokens: 5,  // Generate 5 candidate tokens
      temperature: 0.8,
    });
    
    // 2. Target model verifies all candidates in parallel
    const verificationResults = await this.targetModel.verify(
      query,
      documents,
      draftTokens
    );
    
    // 3. Accept verified tokens, reject rest
    const acceptedTokens = [];
    for (let i = 0; i < draftTokens.length; i++) {
      if (verificationResults[i].accepted) {
        acceptedTokens.push(draftTokens[i]);
      } else {
        break; // Stop at first rejection
      }
    }
    
    // 4. Continue generation from accepted prefix
    if (acceptedTokens.length < draftTokens.length) {
      // Some tokens rejected, continue from last accepted
      return await this.continueGeneration(query, documents, acceptedTokens);
    }
    
    return acceptedTokens.join('');
  }
}
```

**Best Practice**:
- Use draft model with shortened retrieval contexts (faster)
- Verify multiple tokens in parallel (amortize cost)
- Expected: 12.97% accuracy improvement, 50.83% latency reduction

### Batching and Scheduling Optimizations

#### Cache-Aware Request Reordering

Reorder requests to maximize cache hit rate and prevent thrashing.

```typescript
// ✅ Advanced: Cache-aware request scheduling
class CacheAwareScheduler {
  private requestQueue: PriorityQueue<RAGRequest>;
  
  scheduleRequest(request: RAGRequest): void {
    // Calculate priority based on cache benefit
    const priority = this.calculateCachePriority(request);
    this.requestQueue.enqueue(request, priority);
  }
  
  private calculateCachePriority(request: RAGRequest): number {
    // Priority = CachedLength / ComputationLength
    // Higher priority = more cache benefit
    
    const cachedLength = this.getCachedTokenCount(request.documents);
    const computationLength = this.getUncachedTokenCount(request.documents);
    
    if (computationLength === 0) return Infinity;
    return cachedLength / computationLength;
  }
  
  async processNextRequest(): Promise<void> {
    // Process request with highest cache benefit
    const request = this.requestQueue.dequeue();
    await this.processRequest(request);
  }
}
```

**Best Practice**:
- Prioritize requests with high cached/computation ratio
- Set reordering window to prevent starvation (e.g., 32 requests)
- Expected: 1.2-2.1× latency reduction under high load

#### Content-Aware Batching

Batch requests with similar retrieved documents to maximize KV cache reuse.

```typescript
// ✅ Advanced: Content-aware batching
class ContentAwareBatcher {
  async batchRequests(requests: RAGRequest[]): Promise<RAGRequest[][]> {
    // 1. Group requests by document overlap
    const batches: RAGRequest[][] = [];
    const processed = new Set<string>();
    
    for (const request of requests) {
      if (processed.has(request.id)) continue;
      
      // Find requests with overlapping documents
      const batch = [request];
      processed.add(request.id);
      
      for (const other of requests) {
        if (processed.has(other.id)) continue;
        
        const overlap = this.calculateDocumentOverlap(
          request.documents,
          other.documents
        );
        
        // Add to batch if significant overlap
        if (overlap > 0.5 && batch.length < this.maxBatchSize) {
          batch.push(other);
          processed.add(other.id);
        }
      }
      
      batches.push(batch);
    }
    
    return batches;
  }
  
  private calculateDocumentOverlap(docs1: Document[], docs2: Document[]): number {
    const set1 = new Set(docs1.map(d => d.id));
    const set2 = new Set(docs2.map(d => d.id));
    
    const intersection = new Set([...set1].filter(id => set2.has(id)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;  // Jaccard similarity
  }
}
```

**Best Practice**:
- Batch requests with >50% document overlap
- Compute shared document KV caches once per batch
- Expected: 1.5-2× throughput improvement

### Embedding and Vector Search Optimization

#### Embedding Quantization

Reduce embedding storage and search time with minimal quality loss.

```typescript
// ✅ Advanced: Float8 quantization for embeddings
class QuantizedEmbeddingManager {
  async generateEmbedding(text: string): Promise<Float8Array> {
    // 1. Generate full-precision embedding
    const embedding = await this.embeddingModel.encode(text);
    
    // 2. Quantize to float8
    const quantized = this.quantizeFloat8(embedding);
    
    // 3. Cache quantized version
    await this.cache.set(`emb:${hashText(text)}`, quantized);
    
    return quantized;
  }
  
  private quantizeFloat8(embedding: Float32Array): Float8Array {
    // Find min/max for scaling
    const min = Math.min(...embedding);
    const max = Math.max(...embedding);
    const scale = (max - min) / 255;
    
    // Quantize to 8-bit
    const quantized = new Uint8Array(embedding.length);
    for (let i = 0; i < embedding.length; i++) {
      quantized[i] = Math.round((embedding[i] - min) / scale);
    }
    
    return { data: quantized, scale, min };
  }
  
  private dequantizeFloat8(quantized: Float8Array): Float32Array {
    const { data, scale, min } = quantized;
    const embedding = new Float32Array(data.length);
    
    for (let i = 0; i < data.length; i++) {
      embedding[i] = data[i] * scale + min;
    }
    
    return embedding;
  }
}
```

**Best Practice**:
- Use float8 quantization (4× storage reduction, <0.3% quality loss)
- Combine with PCA for 8× reduction (512 → 64 dimensions)
- Float8 outperforms int8 at same compression level
- Expected: 4× storage reduction, 2-3× faster vector search

#### Parallel Vector Search with Early Termination

Speed up retrieval by searching in parallel and terminating early when confident.

```typescript
// ✅ Advanced: Parallel search with early termination
class ParallelVectorSearch {
  async search(query: number[], topK: number = 10): Promise<Document[]> {
    // 1. Divide index into shards
    const shards = this.getIndexShards();
    
    // 2. Search all shards in parallel
    const shardResults = await Promise.all(
      shards.map(shard => this.searchShard(shard, query, topK * 2))
    );
    
    // 3. Merge results with early termination
    const candidates = this.mergeWithEarlyTermination(shardResults, topK);
    
    return candidates;
  }
  
  private mergeWithEarlyTermination(
    shardResults: SearchResult[][],
    topK: number
  ): Document[] {
    // Use min-heap to track top-K candidates
    const heap = new MinHeap<SearchResult>();
    
    // Merge results from all shards
    for (const results of shardResults) {
      for (const result of results) {
        if (heap.size() < topK) {
          heap.insert(result);
        } else if (result.score > heap.peek().score) {
          heap.extractMin();
          heap.insert(result);
        }
      }
    }
    
    return heap.toArray().map(r => r.document);
  }
}
```

**Best Practice**:
- Shard index across multiple cores/machines
- Search shards in parallel
- Use early termination when top-K is stable
- Expected: 2-4× search speedup for large indexes

### Production RAG System Architecture

Putting it all together - a production-grade RAG system with all optimizations:

```typescript
// ✅ Production: Complete optimized RAG system
class ProductionRAGSystem {
  private ragCache: RAGCache;
  private sparseRAG: SparseRAG;
  private scheduler: CacheAwareScheduler;
  private batcher: ContentAwareBatcher;
  private embeddingManager: QuantizedEmbeddingManager;
  
  async processQuery(query: string): Promise<string> {
    // 1. Generate quantized query embedding
    const queryEmbedding = await this.embeddingManager.generateEmbedding(query);
    
    // 2. Parallel vector search with early termination
    const documents = await this.parallelSearch(queryEmbedding, 20);
    
    // 3. Check RAGCache for document KV tensors
    const { cachedKV, uncachedDocs } = await this.ragCache.checkCache(documents);
    
    // 4. Sparse RAG: Parallel encoding + selective loading
    const selectedKV = await this.sparseRAG.encodeAndFilter(
      query,
      uncachedDocs,
      cachedKV
    );
    
    // 5. Cache new KV tensors with PGDSF policy
    await this.ragCache.cacheKV(uncachedDocs, selectedKV);
    
    // 6. Generate response with all optimizations
    return await this.generate(query, selectedKV);
  }
  
  // Batch processing with content-aware batching
  async processBatch(queries: string[]): Promise<string[]> {
    // 1. Retrieve documents for all queries
    const requests = await Promise.all(
      queries.map(async q => ({
        query: q,
        documents: await this.retrieve(q),
      }))
    );
    
    // 2. Content-aware batching
    const batches = await this.batcher.batchRequests(requests);
    
    // 3. Process each batch with shared KV cache
    const results: string[] = [];
    for (const batch of batches) {
      const batchResults = await this.processBatchWithSharedCache(batch);
      results.push(...batchResults);
    }
    
    return results;
  }
}
```

### Quick Advanced Optimization Checklist

**KV Cache Optimization (Highest Impact)**:
- [ ] Implement RAGCache with GPU/host memory hierarchy
- [ ] Use PGDSF eviction policy (frequency + cost + size + recency)
- [ ] Cache document KV tensors across requests
- [ ] Implement Sparse RAG with parallel encoding
- [ ] Filter low-relevance documents before decoding
- [ ] Expected: 4× TTFT reduction, 2-3× decoding speedup

**Speculative Techniques**:
- [ ] Implement dynamic speculative pipelining
- [ ] Use draft model for candidate generation
- [ ] Verify candidates in parallel with target model
- [ ] Expected: 1.6-2× latency reduction

**Batching & Scheduling**:
- [ ] Implement cache-aware request reordering
- [ ] Use content-aware batching for similar requests
- [ ] Set reordering window to prevent starvation
- [ ] Expected: 1.5-2× throughput improvement

**Embedding Optimization**:
- [ ] Use float8 quantization (4× storage reduction)
- [ ] Combine with PCA for 8× reduction
- [ ] Implement parallel vector search
- [ ] Use early termination for confident results
- [ ] Expected: 2-4× search speedup

**System-Level**:
- [ ] Monitor KV cache hit rate (target: 60-80%)
- [ ] Track document reuse patterns
- [ ] Measure per-stage latency (retrieval, prefill, decode)
- [ ] Set up alerts for cache thrashing
- [ ] A/B test optimizations before rollout

**Expected Combined Results**:
- 4-10× overall latency reduction
- 2-3× throughput improvement
- 60-80% KV cache hit rate
- 4× storage reduction for embeddings
- Quality maintained or improved (filtering noise)

---

## Quick Reference Checklist

### Before Committing Code

- [ ] Code follows naming conventions
- [ ] No console.log() statements (use logger)
- [ ] No hardcoded values (use environment variables)
- [ ] Error handling in place
- [ ] Input validation added
- [ ] Tests written and passing
- [ ] No sensitive data in code
- [ ] TypeScript types defined (no `any`)

### Before Deploying

- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] Health check endpoint working
- [ ] Logs structured and searchable
- [ ] Metrics exported
- [ ] Rate limiting configured
- [ ] Error tracking enabled
- [ ] Rollback plan documented

### When Adding New Feature

- [ ] Update API documentation
- [ ] Add integration tests
- [ ] Update environment variable examples
- [ ] Add monitoring/alerts
- [ ] Consider caching strategy
- [ ] Check rate limit impact
- [ ] Estimate cost impact

### When Debugging Production Issue

- [ ] Check correlation ID in logs
- [ ] Check error metrics dashboard
- [ ] Check queue size/depth
- [ ] Check Redis availability
- [ ] Check OpenAI rate limits
- [ ] Check circuit breaker state
- [ ] Review recent deployments

---

## Common Patterns Reference

### Making OpenAI Requests

```typescript
// Always use queue with appropriate priority
const response = await openaiRequestQueue.enqueue(
  () => openaiService.chatCompletion({
    messages: [...],
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 1000,
  }),
  QueuePriority.INTAKE
);
```

### Caching Expensive Operations

```typescript
// Check cache first, populate on miss
async function getExpensiveData(key: string) {
  const cached = await cacheManager.get(key);
  if (cached) return cached;
  
  const data = await expensiveOperation();
  await cacheManager.set(key, data, 3600); // 1 hour TTL
  
  return data;
}
```

### Error Handling in Routes

```typescript
// Use asyncHandler to catch errors
router.post('/endpoint', asyncHandler(async (req, res) => {
  // Validate input
  const params = requestSchema.parse(req.body);
  
  // Business logic
  const result = await service.doSomething(params);
  
  // Return response
  res.json({ success: true, data: result });
}));
```

### Logging with Context

```typescript
// Include correlation ID and relevant context
logger.info('operation_completed', {
  correlationId: req.correlationId,
  userId: req.user?.id,
  operation: 'generate_recommendations',
  durationMs: Date.now() - startTime,
  resultCount: results.length,
});
```

---

## Conclusion

This document captures the practical patterns already working well in the codebase:

**What we do well:**
- Clean service layer architecture
- Comprehensive error handling
- Graceful degradation
- Structured logging
- Queue-based request management
- Multi-layer caching

**Keep doing:**
- Use the queue for all OpenAI requests
- Handle errors with typed error classes
- Log with correlation IDs
- Cache aggressively with appropriate TTLs
- Validate all inputs
- Monitor key metrics

**Remember:**
- Simple is better than complex
- Fail gracefully, never crash
- Log everything important
- Cache everything expensive
- Test the happy path and edge cases
- Monitor what matters

**When in doubt:**
- Check existing code for patterns
- Prefer proven patterns over clever solutions
- Ask: "Will this work at 10x scale?"
- Document why, not what

---

## Additional Resources

### Internal Documentation
- `.kiro/specs/scalability-phase-1-optimizations/design.md` - Architecture overview
- `.kiro/specs/scalability-phase-1-optimizations/openai-queue-best-practices.md` - Queue patterns
- `api/src/services/` - Service implementations
- `api/src/middleware/` - Middleware patterns

### External Resources (Research Sources)

**Node.js & TypeScript Best Practices:**
- [Node.js Best Practices (goldbergyoni)](https://github.com/goldbergyoni/nodebestpractices) - Comprehensive guide with 80+ best practices
- [TypeScript Production Best Practices (6dotsdc)](https://www.6dotsdc.com/blog/typescript-best-practices-production) - Production-tested patterns
- [Node.js Production Deployment Checklist (TheLinuxCode)](https://thelinuxcode.com/the-ultimate-node-js-production-deployment-checklist/)

**Logging & Error Handling:**
- [Node.js Logging with Winston (Grizzly Peak)](https://grizzlypeaksoftware.com/library/nodejs-logging-best-practices-with-winston-msdk3ekf) - Structured logging patterns
- [Express Error Handling Guide (Leapcell)](https://leapcell.io/blog/robust-error-handling-in-express-applications-a-practical-guide)
- [Express.js Performance Best Practices (Sematext)](https://sematext.com/blog/expressjs-best-practices)

**AI Chatbot Architecture:**
- [Building Production-Ready AI Chatbots (learnwithparam)](https://learnwithparam.com/blog/system-design-building-production-ready-ai-chatbot-end-to-end) - End-to-end architecture guide
- [AI Chatbot Scalability Guide (aichatlist)](https://www.aichatlist.com/blog/guide-to-ai-chatbot-scalability)
- [Scaling AI Best Practices (GetStream)](https://getstream.io/blog/scaling-ai-best-practices/)

**RAG Optimization & Best Practices:**
- [Systematically Improving RAG Applications (jxnl.co)](https://jxnl.co/writing/2024/05/22/systematically-improving-your-rag/) - Comprehensive guide to RAG optimization with metrics, synthetic data, and fine-tuning
- [Optimizing RAG: Architecture, Retrieval Strategies, and Reliability Patterns (Uplatz)](https://uplatz.com/blog/optimizing-retrieval-augmented-generation-a-comprehensive-analysis-of-architecture-retrieval-strategies-and-reliability-patterns/) - Advanced RAG patterns including CRAG, agentic chunking, ReDI, Step-Back prompting, and BM42 (2025)
- [Contextual RAG with Hybrid Search (Analytics Vidhya)](https://www.analyticsvidhya.com/blog/2024/06/contextual-retrieval-augmented-generation-rag/) - Hybrid search and reranking patterns
- [Complete RAG Systems Guide (NerdLevel Tech)](https://www.nerdleveltech.com/complete-guide-to-rag-systems-retrieval-augmented-generation/) - Production RAG architecture
- [Production-Ready RAG Systems (Athenic AI)](https://www.getathenic.com/blog/production-ready-rag-systems) - Deployment best practices
- [RAG Chunking Methods Evaluation (Superlinked)](https://superlinked.com/vectorhub/articles/chunking-methods-for-rag) - Chunking strategies comparison
- [RAGAS Evaluation Framework (GeeksforGeeks)](https://www.geeksforgeeks.org/artificial-intelligence/ragas/) - Metrics for faithfulness, context precision, and answer relevancy
- [How to Measure RAG Performance (StackViv)](https://stackviv.ai/blog/rag-evaluation-metrics) - Comprehensive RAG evaluation guide (2026)

**RAG Latency Optimization Research:**
- [METIS: Fast Quality-Aware RAG Systems with Configuration Adaptation (arXiv 2025)](https://arxiv.org/html/2412.10543v3) - Research paper on adaptive RAG configuration selection based on query complexity, achieving 1.64-2.54× latency reduction through per-query configuration adaptation (num_chunks, synthesis_method, intermediate_length)
- [RAGCache: Efficient Knowledge Caching for Retrieval-Augmented Generation (arXiv 2024)](https://arxiv.org/html/2404.12457v1) - Multilevel dynamic caching system for RAG that caches document KV tensors across requests, achieving 4× TTFT reduction and 2.1× throughput improvement with PGDSF replacement policy
- [Sparse RAG: Accelerating Inference via Sparse Context Selection (arXiv 2024)](https://arxiv.org/html/2405.16178v1) - Parallel document encoding with selective KV cache loading during decoding, achieving 2-3× decoding speedup by filtering irrelevant contexts
- [Speculative RAG: Enhancing RAG through Drafting (arXiv 2024)](https://arxiv.org/html/2407.08223v2) - Uses draft model for candidate generation with target model verification, achieving 12.97% accuracy improvement and 50.83% latency reduction
- [Optimization of Embeddings Storage for RAG using Quantization (arXiv 2025)](https://arxiv.org/html/2505.00105v1) - Float8 quantization achieves 4× storage reduction with <0.3% performance degradation, outperforming int8; combined with PCA achieves 8× reduction

**Content synthesized from multiple sources for compliance with licensing restrictions. See references above for original sources.**

---

**Last Updated:** February 2026  
**Maintained By:** Development Team  
**Review Frequency:** Quarterly or after major changes  
**Research Date:** February 2026

