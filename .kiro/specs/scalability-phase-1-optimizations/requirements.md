# Requirements Document

## Introduction

The Stevie Awards Nomination Assistant chatbot currently handles 20 concurrent users with 100% success but breaks at 50+ users (38% success at 50, 9% at 100). This specification defines Phase 1 scalability optimizations to achieve 10x improvement in concurrent user capacity (20 → 200 users) while reducing costs by 60% and maintaining all existing functionality. The system must scale to support 1 million users eventually, with Phase 1 establishing the foundation for horizontal scaling in future phases.

## Glossary

- **OpenAI_Service**: Service wrapper for OpenAI API calls including chat completions and embeddings
- **Request_Queue**: Priority queue managing concurrent OpenAI API requests with rate limiting
- **Cache_Manager**: Redis-based caching service for embeddings, recommendations, and responses
- **Conversation_Manager**: Service managing conversation history and context
- **Intake_Assistant**: LLM-powered service collecting 7 required fields from users
- **Recommendation_Engine**: Service generating personalized category recommendations
- **Context_Window**: Token budget allocated for conversation history and user context
- **Token**: Unit of text processed by LLM (approximately 4 characters)
- **Concurrent_Users**: Number of users actively making requests simultaneously
- **Success_Rate**: Percentage of requests completing successfully without errors
- **Response_Time**: Duration from user message to complete assistant response

## Requirements

### Requirement 1: OpenAI Request Queue Management

**User Story:** As a system administrator, I want OpenAI API requests queued with concurrency control, so that the system prevents rate limit errors and handles high load gracefully.

#### Acceptance Criteria

1. WHEN multiple OpenAI requests are made simultaneously, THE Request_Queue SHALL enqueue them with a maximum of 10 concurrent requests
2. WHEN the request rate exceeds 50 requests per second, THE Request_Queue SHALL throttle requests to maintain the limit
3. WHEN an intake question request is enqueued, THE Request_Queue SHALL assign it higher priority than explanation generation requests
4. WHEN a request is enqueued, THE Request_Queue SHALL return a promise that resolves when the request completes
5. WHEN the queue is at capacity, THE Request_Queue SHALL queue additional requests without rejecting them
6. WHEN a queued request fails with a retryable error, THE Request_Queue SHALL retry with exponential backoff up to 3 attempts

### Requirement 2: Multi-Layer Response Caching

**User Story:** As a system administrator, I want aggressive caching of recommendations and explanations, so that repeated queries return instantly and reduce OpenAI costs by 80%.

#### Acceptance Criteria

1. WHEN a recommendation request is made, THE Cache_Manager SHALL check for cached results using a context hash of nomination_subject, org_type, and description
2. WHEN cached recommendations exist and are less than 24 hours old, THE Cache_Manager SHALL return them without calling OpenAI
3. WHEN explanation generation is requested for a category, THE Cache_Manager SHALL check for cached explanations by category ID
4. WHEN cached explanations exist and are less than 7 days old, THE Cache_Manager SHALL return them without calling OpenAI
5. WHEN an intake response is generated, THE Cache_Manager SHALL cache it by normalized question text for 1 hour
6. WHEN caching a response, THE Cache_Manager SHALL use Redis with appropriate TTL values (24h for recommendations, 7d for explanations, 1h for intake)
7. WHEN generating a cache key for recommendations, THE Cache_Manager SHALL create an MD5 hash of the normalized context fields

### Requirement 3: Conversation Memory Management

**User Story:** As a system administrator, I want conversation history managed with a sliding window approach, so that long conversations don't consume excessive tokens and API costs are reduced by 60-70%.

#### Acceptance Criteria

1. WHEN conversation history exceeds 6 messages, THE Conversation_Manager SHALL maintain only the last 6 messages in the active window
2. WHEN older messages exist beyond the 6-message window, THE Conversation_Manager SHALL generate a summary of those messages
3. WHEN generating a summary, THE Conversation_Manager SHALL use gpt-4o-mini with a maximum of 150 tokens
4. WHEN a summary is generated, THE Conversation_Manager SHALL cache it in Redis for 1 hour using a hash of the message content
5. WHEN building context for an OpenAI request, THE Conversation_Manager SHALL include the summary followed by the recent 6-message window
6. WHEN conversation history is 6 messages or fewer, THE Conversation_Manager SHALL send all messages without summarization

### Requirement 4: Token Optimization

**User Story:** As a system administrator, I want prompts optimized to use minimal tokens, so that API costs are reduced by 40-60% and responses are faster.

#### Acceptance Criteria

1. WHEN building system prompts, THE Intake_Assistant SHALL use concise instructions without redundant text
2. WHEN formatting field names in prompts, THE Intake_Assistant SHALL use abbreviated names where clarity is maintained
3. WHEN requesting structured output from OpenAI, THE OpenAI_Service SHALL use JSON schema response format instead of text instructions
4. WHEN including examples in prompts, THE Intake_Assistant SHALL include only essential examples necessary for correct behavior
5. WHEN formatting context data, THE OpenAI_Service SHALL use compact JSON or YAML format instead of verbose text
6. WHEN the optimized prompts are deployed, THE system SHALL maintain identical functional behavior to the current implementation

### Requirement 5: Context Window Optimization

**User Story:** As a system administrator, I want smart context pruning to limit token usage, so that each request uses maximum 2000 context tokens and processing is faster.

#### Acceptance Criteria

1. WHEN building context for an OpenAI request, THE Conversation_Manager SHALL extract only non-empty essential fields from user context
2. WHEN user context contains empty or null fields, THE Conversation_Manager SHALL exclude them from the context payload
3. WHEN the context payload is built, THE Conversation_Manager SHALL estimate token count and ensure it stays under 2000 tokens
4. WHEN token count approaches 2000, THE Conversation_Manager SHALL prioritize recent messages over older summary content
5. WHEN formatting context, THE Conversation_Manager SHALL use compact JSON format without unnecessary whitespace

### Requirement 6: System Performance and Reliability

**User Story:** As a system administrator, I want the system to handle 100 concurrent users with 95%+ success rate, so that the chatbot scales reliably under production load.

#### Acceptance Criteria

1. WHEN 100 concurrent users make requests simultaneously, THE system SHALL achieve a success rate of 95% or higher
2. WHEN requests are processed under load, THE system SHALL maintain an average response time of 20 seconds or less
3. WHEN the system is under load, THE system SHALL maintain all existing functionality including 7-field intake flow, recommendations, and Q&A
4. WHEN OpenAI API costs are measured, THE system SHALL reduce cost per user from $0.15 to $0.06 or less (60% reduction)
5. WHEN the stress test with 100 concurrent users is executed, THE system SHALL pass with 95%+ success rate

### Requirement 7: Backward Compatibility

**User Story:** As a developer, I want all optimizations to maintain existing API contracts, so that no breaking changes are introduced to the frontend or existing integrations.

#### Acceptance Criteria

1. WHEN the optimizations are deployed, THE unified chatbot API SHALL maintain the same request and response formats
2. WHEN streaming responses are sent, THE system SHALL use the same chunk format and event types
3. WHEN recommendations are returned, THE system SHALL include the same data fields (id, title, description, explanation, score)
4. WHEN errors occur, THE system SHALL return the same error codes and messages
5. WHEN the 7-field intake flow executes, THE system SHALL collect the same fields in the same order (user_name, user_email, nomination_subject, org_type, gender_programs_opt_in, recognition_scope, description)
