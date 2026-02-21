# Implementation Plan: Phase 1 Scalability Optimizations

## Overview

This plan implements five critical optimizations to achieve 10x improvement in concurrent user capacity (20 → 200 users) while reducing costs by 60%. The implementation is organized into discrete, incremental steps that build on each other, with testing integrated throughout to catch errors early.

## Tasks

- [ ] 1. Set up OpenAI Request Queue infrastructure
  - Install p-queue dependency (npm install p-queue@8.0.1)
  - Create api/src/services/openaiRequestQueue.ts with queue class
  - Implement priority levels (INTAKE=1, QA/RECOMMENDATION=2, EXPLANATION=3)
  - Configure concurrency limit (10) and rate limit (50 req/sec)
  - Export singleton instance
  - _Requirements: 1.1, 1.2, 1.3_

- [ ]* 1.1 Write property test for queue concurrency limit
  - **Property 1: Queue Concurrency Limit**
  - **Validates: Requirements 1.1**

- [ ]* 1.2 Write property test for queue rate limiting
  - **Property 2: Queue Rate Limiting**
  - **Validates: Requirements 1.2**

- [ ]* 1.3 Write property test for priority ordering
  - **Property 3: Priority Ordering**
  - **Validates: Requirements 1.3**

- [ ] 2. Integrate queue into OpenAI Service
  - Modify api/src/services/openaiService.ts to import openaiRequestQueue
  - Wrap chatCompletion() calls with queue.enqueue()
  - Wrap generateEmbedding() calls with queue.enqueue()
  - Wrap chatCompletionStream() calls with queue.enqueue()
  - Pass appropriate priority levels based on caller context
  - Maintain existing retry logic and circuit breaker
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [ ]* 2.1 Write property test for promise resolution
  - **Property 4: Promise Resolution**
  - **Validates: Requirements 1.4**

- [ ]* 2.2 Write property test for queue without rejection
  - **Property 5: Queue Without Rejection**
  - **Validates: Requirements 1.5**

- [ ]* 2.3 Write property test for retry with exponential backoff
  - **Property 6: Retry with Exponential Backoff**
  - **Validates: Requirements 1.6**

- [ ] 3. Checkpoint - Verify queue integration
  - Run existing tests to ensure no regressions
  - Test queue stats endpoint (size, pending)
  - Ensure all tests pass, ask the user if questions arise

- [ ] 4. Enhance Cache Manager with new cache layers
  - Add getRecommendations() and setRecommendations() methods to api/src/services/cacheManager.ts
  - Add getExplanation() and setExplanation() methods
  - Add getIntakeResponse() and setIntakeResponse() methods
  - Add getSummary() and setSummary() methods
  - Implement cache key generation functions (MD5 hashing with normalization)
  - Use appropriate TTL values (24h for recommendations, 7d for explanations, 1h for intake/summary)
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [ ]* 4.1 Write property test for recommendation cache round trip
  - **Property 7: Recommendation Cache Round Trip**
  - **Validates: Requirements 2.2**

- [ ]* 4.2 Write property test for explanation cache round trip
  - **Property 8: Explanation Cache Round Trip**
  - **Validates: Requirements 2.4**

- [ ]* 4.3 Write property test for cache key determinism
  - **Property 9: Cache Key Determinism**
  - **Validates: Requirements 2.7**

- [ ]* 4.4 Write unit tests for cache key generation
  - Test MD5 hash generation for various contexts
  - Test normalization (lowercase, trim, substring)
  - _Requirements: 2.7_

- [ ] 5. Integrate recommendation caching into Recommendation Engine
  - Modify api/src/services/recommendationEngine.ts to check cache before generating recommendations
  - Generate context hash from nomination_subject, org_type, and description
  - Return cached recommendations if found and within 24h TTL
  - Cache new recommendations after generation
  - _Requirements: 2.1, 2.2, 2.7_

- [ ] 6. Integrate explanation caching into Explanation Generator
  - Modify api/src/services/explanationGenerator.ts to check cache before generating explanations
  - Use category_id as cache key
  - Return cached explanation if found and within 7d TTL
  - Cache new explanations after generation
  - _Requirements: 2.3, 2.4_

- [ ] 7. Integrate intake response caching into Intake Assistant
  - Modify api/src/services/intakeAssistant.ts to check cache before calling OpenAI
  - Generate cache key from normalized question text
  - Return cached response if found and within 1h TTL
  - Cache new responses after generation
  - _Requirements: 2.5_

- [ ] 8. Checkpoint - Verify caching integration
  - Test cache hit rates with repeated requests
  - Verify TTL values are set correctly in Redis
  - Monitor cache keys in Redis to ensure proper formatting
  - Ensure all tests pass, ask the user if questions arise

- [ ] 9. Implement Conversation Memory Manager
  - Create api/src/services/conversationMemoryManager.ts
  - Implement buildContext() method with sliding window logic (6 messages)
  - Implement getSummary() method with caching (1h TTL)
  - Use gpt-4o-mini for summary generation (max 150 tokens)
  - Format context as: [Summary] + [Recent 6 messages]
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ]* 9.1 Write property test for sliding window maintenance
  - **Property 10: Sliding Window Maintenance**
  - **Validates: Requirements 3.1**

- [ ]* 9.2 Write property test for summary generation
  - **Property 11: Summary Generation for Long Conversations**
  - **Validates: Requirements 3.2**

- [ ]* 9.3 Write property test for summary cache round trip
  - **Property 12: Summary Cache Round Trip**
  - **Validates: Requirements 3.4**

- [ ]* 9.4 Write property test for context structure with summary
  - **Property 13: Context Structure with Summary**
  - **Validates: Requirements 3.5**

- [ ] 10. Integrate Conversation Memory Manager into services
  - Modify api/src/services/conversationManager.ts to use conversationMemoryManager.buildContext()
  - Modify api/src/services/unifiedChatbotService.ts to use memory manager for conversation history
  - Replace direct conversation history formatting with memory manager calls
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 11. Checkpoint - Verify memory management
  - Test with conversations of various lengths (< 6, = 6, > 6 messages)
  - Verify summaries are generated and cached correctly
  - Check token usage reduction in logs
  - Ensure all tests pass, ask the user if questions arise

- [ ] 12. Optimize Intake Assistant prompts
  - Refactor api/src/services/intakeAssistant.ts buildPrompt() to use concise instructions
  - Remove redundant text and verbose examples
  - Use abbreviated field names where appropriate
  - Reduce prompt from ~800 tokens to ~200 tokens
  - Maintain identical functional behavior
  - _Requirements: 4.1, 4.2, 4.6_

- [ ] 13. Implement JSON Schema structured output
  - Modify api/src/services/openaiService.ts to support response_format parameter
  - Update intakeAssistant.planNext() to use JSON schema for structured output
  - Define schema for intake response format
  - Remove JSON formatting instructions from prompt text
  - _Requirements: 4.3_

- [ ]* 13.1 Write property test for JSON schema usage
  - **Property 14: JSON Schema Usage**
  - **Validates: Requirements 4.3**

- [ ] 14. Implement compact context formatting
  - Create utility function for compact JSON formatting (no whitespace)
  - Update all services to use compact format for context data
  - Replace verbose text formatting with compact JSON
  - _Requirements: 4.5_

- [ ]* 14.1 Write property test for compact context format
  - **Property 15: Compact Context Format**
  - **Validates: Requirements 4.5**

- [ ]* 14.2 Write property test for functional equivalence
  - **Property 16: Functional Equivalence After Optimization**
  - **Validates: Requirements 4.6**

- [ ] 15. Checkpoint - Verify token optimization
  - Compare token usage before and after optimization
  - Verify 40-60% token reduction achieved
  - Test that all intake flows still work correctly
  - Ensure all tests pass, ask the user if questions arise

- [ ] 16. Implement Context Window Optimizer
  - Create api/src/services/contextOptimizer.ts
  - Implement buildOptimalContext() method
  - Implement extractEssentialFields() to exclude empty/null values
  - Implement token estimation (1 token ≈ 4 characters)
  - Enforce 2000 token limit with prioritization logic
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ]* 16.1 Write property test for empty field exclusion
  - **Property 17: Empty Field Exclusion**
  - **Validates: Requirements 5.1, 5.2**

- [ ]* 16.2 Write property test for token budget compliance
  - **Property 18: Token Budget Compliance**
  - **Validates: Requirements 5.3**

- [ ]* 16.3 Write property test for message prioritization
  - **Property 19: Message Prioritization Near Limit**
  - **Validates: Requirements 5.4**

- [ ]* 16.4 Write property test for compact JSON formatting
  - **Property 20: Compact JSON Formatting**
  - **Validates: Requirements 5.5**

- [ ]* 16.5 Write unit tests for context pruning
  - Test empty field exclusion with various contexts
  - Test token estimation accuracy
  - Test prioritization logic when approaching limit
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [ ] 17. Integrate Context Optimizer into services
  - Modify api/src/services/intakeAssistant.ts to use contextOptimizer
  - Modify api/src/services/conversationManager.ts to use contextOptimizer
  - Replace manual context building with optimizer calls
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 18. Checkpoint - Verify context optimization
  - Test with various context sizes
  - Verify token limit is never exceeded
  - Check that essential information is preserved
  - Ensure all tests pass, ask the user if questions arise

- [ ] 19. Add backward compatibility tests
  - Create test suite to verify API contract stability
  - Test request/response formats match original implementation
  - Test streaming chunk formats and event types
  - Test recommendation response schema
  - Test error response formats
  - Test intake flow field collection
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ]* 19.1 Write property test for API contract stability
  - **Property 21: API Contract Stability**
  - **Validates: Requirements 7.1**

- [ ]* 19.2 Write property test for streaming format consistency
  - **Property 22: Streaming Format Consistency**
  - **Validates: Requirements 7.2**

- [ ]* 19.3 Write property test for recommendation response schema
  - **Property 23: Recommendation Response Schema**
  - **Validates: Requirements 7.3**

- [ ]* 19.4 Write property test for error response consistency
  - **Property 24: Error Response Consistency**
  - **Validates: Requirements 7.4**

- [ ]* 19.5 Write property test for intake flow field collection
  - **Property 25: Intake Flow Field Collection**
  - **Validates: Requirements 7.5**

- [ ] 20. Add configuration and environment variables
  - Add new environment variables to .env.example
  - Document configuration options in README
  - Set default values for queue, cache TTLs, and context limits
  - _Requirements: All_

- [ ] 21. Add monitoring and metrics
  - Add Prometheus metrics for queue size and pending requests
  - Add metrics for cache hit rates by type
  - Add metrics for token usage per request
  - Add metrics for response time percentiles
  - Create dashboard queries for monitoring
  - _Requirements: 6.1, 6.2, 6.4_

- [ ] 22. Run comprehensive stress test
  - Execute comprehensive-stress-test.js with 100 concurrent users
  - Verify 95%+ success rate achieved
  - Measure average response time (target: ≤ 20 seconds)
  - Measure cost per user (target: ≤ $0.06)
  - Document results and compare to baseline
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 23. Final checkpoint - Production readiness
  - Review all test results
  - Verify all target metrics achieved
  - Check monitoring dashboards
  - Prepare rollback plan
  - Document deployment steps
  - Ensure all tests pass, ask the user if questions arise

## Notes

- Tasks marked with `*` are optional property-based tests that can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation throughout implementation
- Property tests validate universal correctness properties across randomized inputs
- Unit tests validate specific examples and edge cases
- Integration tests (stress test) validate end-to-end system performance
- All optimizations maintain backward compatibility with existing API contracts
