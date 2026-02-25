# Implementation Plan: Award Search Assistant

## Overview

This implementation plan breaks down the Award Search Assistant into discrete, incremental coding tasks. Each task builds on previous work, with property-based tests integrated throughout to catch errors early. The system integrates with existing Express API, OpenAI service, and Supabase infrastructure.

## Tasks

- [x] 1. Set up database schema and cache infrastructure
  - Create Supabase migration for `award_search_cache` table with indexes
  - Add environment variables for cache configuration (TTL, queue depth, crawler settings)
  - _Requirements: 7.1, 7.3_

- [ ] 2. Implement Cache Manager
  - [x] 2.1 Create CacheManager class with Supabase integration
    - Implement get(), set(), invalidate(), isStale(), getMultiple() methods
    - Use existing getSupabaseClient() for database operations
    - Implement in-memory lock for deduplication of concurrent requests
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 10.2_
  
  - [x] 2.2 Write property test for cache storage with URL key
    - **Property 20: Cache Storage with URL Key**
    - **Validates: Requirements 7.1**
  
  - [x] 2.3 Write property test for cache timestamp storage
    - **Property 22: Cache Timestamp Storage**
    - **Validates: Requirements 7.3**
  
  - [ ] 2.4 Write property test for stale data detection
    - **Property 23: Stale Data Detection**
    - **Validates: Requirements 7.4**
  
  - [ ] 2.5 Write property test for cache invalidation
    - **Property 24: Cache Invalidation**
    - **Validates: Requirements 7.5**
  
  - [ ] 2.6 Write property test for crawl request deduplication
    - **Property 32: Crawl Request Deduplication**
    - **Validates: Requirements 10.2**

- [ ] 3. Implement Crawler Rate Limiter
  - [x] 3.1 Create CrawlerRateLimiter class
    - Implement acquireSlot(), releaseSlot(), handleRateLimitResponse() methods
    - Track per-domain request timing and concurrent request counts
    - Implement exponential backoff for 429 responses
    - _Requirements: 8.1, 8.2, 8.5_
  
  - [ ] 3.2 Write property test for crawl request delays
    - **Property 6: Crawl Request Delays**
    - **Validates: Requirements 3.3, 8.1**
  
  - [ ] 3.3 Write property test for concurrent request limit
    - **Property 7: Concurrent Request Limit**
    - **Validates: Requirements 3.6, 8.2**
  
  - [ ] 3.4 Write property test for 429 response backoff
    - **Property 28: 429 Response Backoff**
    - **Validates: Requirements 8.5**

- [ ] 4. Implement Crawlee-based Crawler
  - [x] 4.1 Create StevieAwardsCrawler class using Crawlee
    - Configure CheerioCrawler with rate limiting, retries, and depth limits
    - Implement content extraction (title, headings, paragraphs, lists, tables)
    - Implement text normalization to remove excessive whitespace
    - Extract entities (award names, category names, dates, prices)
    - Set custom User-Agent header
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 4.1, 4.2, 4.3, 4.5, 8.4_
  
  - [ ] 4.2 Write property test for retry with exponential backoff
    - **Property 8: Retry with Exponential Backoff**
    - **Validates: Requirements 3.5**
  
  - [ ] 4.3 Write property test for link following depth limit
    - **Property 9: Link Following Depth Limit**
    - **Validates: Requirements 3.7**
  
  - [ ] 4.4 Write property test for source URL preservation
    - **Property 10: Source URL Preservation**
    - **Validates: Requirements 3.8**
  
  - [ ] 4.5 Write property test for content extraction completeness
    - **Property 11: Content Extraction Completeness**
    - **Validates: Requirements 4.1, 4.4**
  
  - [ ] 4.6 Write property test for text normalization
    - **Property 12: Text Normalization**
    - **Validates: Requirements 4.3**
  
  - [ ] 4.7 Write property test for entity extraction
    - **Property 13: Entity Extraction**
    - **Validates: Requirements 4.5**
  
  - [ ] 4.8 Write property test for User-Agent header
    - **Property 27: User-Agent Header**
    - **Validates: Requirements 8.4**
  
  - [ ] 4.9 Write unit tests for crawler edge cases
    - Test empty page content, malformed HTML, network timeouts
    - Test robots.txt compliance
    - _Requirements: 3.2, 4.1_

- [x] 5. Checkpoint - Ensure crawler and cache tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement Query Planner
  - [x] 6.1 Create QueryPlanner class with OpenAI integration
    - Implement planSearch() to analyze query intent and generate search strategy
    - Use existing openaiService.chatCompletion() for intent analysis
    - Implement analyzeIntent() to detect query type (category, eligibility, pricing, etc.)
    - Implement extractKeywords() to identify search terms
    - Implement generateTargetUrls() to create URL patterns based on intent
    - Implement cache-first strategy: check cache before planning crawls
    - Handle multi-part questions by decomposing into subQuestions
    - Detect comparative queries and identify entities to compare
    - _Requirements: 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [ ] 6.2 Write property test for query planner output structure
    - **Property 2: Query Planner Output Structure**
    - **Validates: Requirements 1.2, 2.4, 2.5**
  
  - [ ] 6.3 Write property test for multi-question decomposition
    - **Property 3: Multi-Question Decomposition**
    - **Validates: Requirements 1.3**
  
  - [ ] 6.4 Write property test for cache-first strategy
    - **Property 4: Cache-First Strategy**
    - **Validates: Requirements 2.3**
  
  - [ ] 6.5 Write property test for comparative query handling
    - **Property 5: Comparative Query Handling**
    - **Validates: Requirements 2.2**
  
  - [ ] 6.6 Write unit tests for specific query types
    - Test category queries, eligibility queries, pricing queries, deadline queries
    - _Requirements: 1.5_

- [ ] 7. Implement Citation System
  - [x] 7.1 Create CitationSystem class
    - Implement addCitations() to add inline citations and footnotes
    - Implement extractClaims() to identify factual statements
    - Implement mapClaimsToSources() to link claims to source URLs
    - Implement formatCitations() to create markdown-formatted citations
    - Ensure every claim has at least one citation
    - Support multiple sources for the same fact
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [ ] 7.2 Write property test for citation tracking
    - **Property 17: Citation Tracking**
    - **Validates: Requirements 6.1, 6.5**
  
  - [ ] 7.3 Write property test for citation format
    - **Property 18: Citation Format**
    - **Validates: Requirements 6.2, 6.3**
  
  - [ ] 7.4 Write property test for multi-source citation
    - **Property 19: Multi-Source Citation**
    - **Validates: Requirements 6.4**

- [ ] 8. Implement Synthesizer
  - [x] 8.1 Create Synthesizer class with OpenAI integration
    - Implement synthesize() to generate answers from crawled data
    - Use existing openaiService.chatCompletion() for answer generation
    - Implement buildPrompt() to construct LLM prompt with crawled content
    - Implement structureAnswer() to format complex answers with sections
    - Detect and indicate missing information
    - Combine information from multiple sources
    - Implement fallback to raw data when LLM service unavailable
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 11.3_
  
  - [ ] 8.2 Write property test for multi-source synthesis
    - **Property 14: Multi-Source Synthesis**
    - **Validates: Requirements 5.2**
  
  - [ ] 8.3 Write property test for structured answer format
    - **Property 15: Structured Answer Format**
    - **Validates: Requirements 5.4**
  
  - [ ] 8.4 Write property test for missing information indication
    - **Property 16: Missing Information Indication**
    - **Validates: Requirements 5.5**
  
  - [ ] 8.5 Write property test for LLM fallback
    - **Property 37: LLM Fallback**
    - **Validates: Requirements 11.3**

- [x] 9. Checkpoint - Ensure query planning and synthesis tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Implement Award Search Service (orchestration layer)
  - [x] 10.1 Create AwardSearchService class
    - Implement search() method that orchestrates: plan → cache check → crawl → synthesize → cite
    - Integrate QueryPlanner, CacheManager, Crawler, Synthesizer, CitationSystem
    - Implement request queuing with max depth of 50
    - Return 503 when queue exceeds capacity
    - Implement graceful degradation: use cached data when crawl fails
    - Handle unanswerable queries with explanations and suggestions
    - Track metrics: success rate, response time, cache hit rate, query patterns
    - Log all errors with context
    - _Requirements: 7.2, 10.1, 10.3, 10.4, 11.1, 11.4, 11.5, 12.1, 12.2, 12.3, 12.4_
  
  - [ ] 10.2 Write property test for cache check before crawl
    - **Property 21: Cache Check Before Crawl**
    - **Validates: Requirements 7.2**
  
  - [ ] 10.3 Write property test for concurrent query processing
    - **Property 31: Concurrent Query Processing**
    - **Validates: Requirements 10.1**
  
  - [ ] 10.4 Write property test for request queuing
    - **Property 33: Request Queuing**
    - **Validates: Requirements 10.3**
  
  - [ ] 10.5 Write property test for queue depth limit
    - **Property 34: Queue Depth Limit**
    - **Validates: Requirements 10.4**
  
  - [ ] 10.6 Write property test for graceful crawl failure
    - **Property 36: Graceful Crawl Failure**
    - **Validates: Requirements 11.1**
  
  - [ ] 10.7 Write property test for unanswerable query handling
    - **Property 38: Unanswerable Query Handling**
    - **Validates: Requirements 11.4**
  
  - [ ] 10.8 Write property test for error logging
    - **Property 39: Error Logging**
    - **Validates: Requirements 11.5**
  
  - [ ] 10.9 Write property test for success rate tracking
    - **Property 40: Success Rate Tracking**
    - **Validates: Requirements 12.1**
  
  - [ ] 10.10 Write property test for response time measurement
    - **Property 41: Response Time Measurement**
    - **Validates: Requirements 12.2**
  
  - [ ] 10.11 Write property test for query pattern logging
    - **Property 42: Query Pattern Logging**
    - **Validates: Requirements 12.3**
  
  - [ ] 10.12 Write property test for cache hit rate tracking
    - **Property 43: Cache Hit Rate Tracking**
    - **Validates: Requirements 12.4**

- [ ] 11. Implement API endpoint
  - [x] 11.1 Create /api/award-search route
    - Create new route file: api/src/routes/award-search.ts
    - Implement POST handler that validates request and calls AwardSearchService
    - Use existing middleware: correlationId, requestLogger, errorHandler
    - Create award-search-specific rate limiter (60 requests per 15 minutes)
    - Validate query parameter: required, non-empty, max 1000 characters
    - Return JSON response with answer, citations, and metadata
    - Handle errors: 400 for invalid input, 429 for rate limit, 503 for queue full
    - Emit Prometheus metrics for requests, response times, cache hits
    - _Requirements: 1.1, 9.1, 9.2, 9.5, 9.6, 9.7_
  
  - [ ] 11.2 Write property test for query length validation
    - **Property 1: Query Length Validation**
    - **Validates: Requirements 1.1**
  
  - [ ] 11.3 Write property test for input validation
    - **Property 29: Input Validation**
    - **Validates: Requirements 9.2**
  
  - [ ] 11.4 Write property test for response format
    - **Property 30: Response Format**
    - **Validates: Requirements 9.5**
  
  - [ ] 11.5 Write unit tests for API endpoint
    - Test validation errors, rate limiting, error responses
    - Test integration with existing middleware
    - _Requirements: 9.1, 9.2, 9.6_

- [x] 12. Register route in Express app
  - [x] 12.1 Add award-search route to api/src/index.ts
    - Import awardSearchRouter
    - Register route: app.use('/api', awardSearchRouter)
    - Ensure route is registered after middleware but before error handler
    - _Requirements: 9.1_

- [x] 13. Checkpoint - Ensure API integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Add performance and response time properties
  - [ ] 14.1 Write property test for cached response time
    - **Property 25: Cached Response Time**
    - **Validates: Requirements 7.6**
  
  - [ ] 14.2 Write property test for uncached response time
    - **Property 26: Uncached Response Time**
    - **Validates: Requirements 7.7**
  
  - [ ] 14.3 Write property test for concurrent load performance
    - **Property 35: Concurrent Load Performance**
    - **Validates: Requirements 10.5**

- [ ] 15. Add integration tests
  - [ ] 15.1 Write integration tests for end-to-end flows
    - Test complete query flow: query → plan → crawl → synthesize → respond
    - Test cache hit path: query → cache → synthesize → respond
    - Test multi-source synthesis: query → multiple crawls → combined answer
    - Test error recovery: crawl fails → use cache → partial answer
    - Test rate limit enforcement: rapid requests → 429 responses
    - _Requirements: 1.1, 7.2, 5.2, 11.1, 8.1_

- [x] 16. Add monitoring and metrics
  - [x] 16.1 Create Prometheus metrics for award search
    - Add metrics to api/src/utils/metrics.ts:
      - award_search_requests_total (counter with labels: status, cache_hit)
      - award_search_response_time_seconds (histogram with label: cache_hit)
      - award_search_crawl_requests_total (counter with label: status)
      - award_search_cache_hit_rate (gauge)
      - award_search_queue_depth (gauge)
    - Emit metrics from AwardSearchService
    - _Requirements: 9.7, 12.1, 12.2, 12.4_

- [x] 17. Create database migration
  - [x] 17.1 Create Supabase migration file
    - Create database/migrations/XXX_award_search_cache.sql
    - Include CREATE TABLE statement with indexes
    - Include cleanup function for expired entries
    - Test migration on development database
    - _Requirements: 7.1_

- [x] 18. Add documentation
  - [x] 18.1 Update API documentation
    - Document /api/award-search endpoint in README.md
    - Include request/response examples
    - Document rate limits and error codes
    - Document environment variables
    - _Requirements: 9.1, 9.5_
  
  - [x] 18.2 Add inline code documentation
    - Add JSDoc comments to all public methods
    - Document complex algorithms (query planning, citation mapping)
    - Add usage examples in comments

- [x] 19. Final checkpoint - Run full test suite
  - Run all unit tests, property tests, and integration tests
  - Verify all metrics are being emitted correctly
  - Test with sample queries covering all intent types
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties with 100+ iterations
- Unit tests validate specific examples and edge cases
- Integration tests verify end-to-end flows
- Checkpoints ensure incremental validation throughout implementation
- All components integrate with existing infrastructure (Express, OpenAI, Supabase)
