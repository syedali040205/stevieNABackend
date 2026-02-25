# Implementation Plan: Nomination Assistant

## Overview

This implementation plan breaks down the Nomination Assistant feature into discrete, incremental tasks. The system will be built in TypeScript for Node.js, integrating with the existing API infrastructure (Express, Supabase, PostgreSQL, Redis). The implementation follows a bottom-up approach: database schema → core services → API endpoints → integration → testing.

## Tasks

- [ ] 1. Database Schema and Migrations
  - Create migration file for nomination-related tables
  - Add nominations table with status enum and user_id foreign key
  - Add nomination_documents table with file metadata and processing status
  - Add nomination_clarifications table with questions and answers
  - Add nomination_summaries table with JSONB summary data
  - Add nomination_drafts table with markdown content
  - Add nomination_audit_log table for audit trail
  - Create indexes for performance (user_id, nomination_id, status)
  - Add updated_at trigger for nominations table
  - Add foreign key constraints with CASCADE delete
  - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8_

- [ ]* 1.1 Write property test for database schema integrity
  - **Property 27: Database Schema Integrity**
  - **Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.8**

- [ ] 2. Document Processor Service - Core Implementation
  - [ ] 2.1 Implement file upload handler with multer
    - Configure multer with size limits (10MB per file)
    - Validate file types (PDF, DOCX, PPTX, TXT)
    - Generate unique S3 keys using pattern: nominations/{userId}/{nominationId}/{documentId}/{filename}
    - Upload to S3 with server-side encryption
    - Store metadata in nomination_documents table
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6_
  
  - [ ]* 2.2 Write property test for document upload validation
    - **Property 1: Document Upload Validation**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.8**
  
  - [ ]* 2.3 Write property test for document storage and metadata
    - **Property 2: Document Storage and Metadata Completeness**
    - **Validates: Requirements 1.4, 1.5, 1.6**
  
  - [ ] 2.4 Implement text extraction for PDF files
    - Use pdf-parse library for text extraction
    - Detect font sizes for heading identification
    - Preserve page breaks and paragraph boundaries
    - Handle special characters and non-ASCII text
    - _Requirements: 2.1, 2.2, 2.7_
  
  - [ ] 2.5 Implement text extraction for DOCX files
    - Use mammoth library with style preservation
    - Extract built-in styles (Heading 1, 2, etc.)
    - Preserve formatting metadata (bold, italic)
    - Handle tables and lists
    - _Requirements: 2.1, 2.3, 2.7_
  
  - [ ] 2.6 Implement text extraction for PPTX files
    - Use pptxgenjs or officegen for slide extraction
    - Extract slide titles and body content
    - Treat each slide as a semantic unit
    - _Requirements: 2.1, 2.4, 2.7_
  
  - [ ] 2.7 Implement text extraction for TXT files
    - Direct UTF-8 reading
    - Detect structure using heuristics (ALL CAPS, colons, indentation)
    - Handle various encodings
    - _Requirements: 2.1, 2.7_
  
  - [ ]* 2.8 Write property test for text extraction correctness
    - **Property 3: Text Extraction Correctness**
    - **Validates: Requirements 2.1, 2.4, 2.7**
  
  - [ ] 2.9 Implement error handling for text extraction
    - Mark document as failed in database on extraction error
    - Store error message for user visibility
    - Log extraction failures
    - Allow retry without re-upload
    - _Requirements: 2.6, 17.2_

- [ ] 3. Document Chunking and Embedding Generation
  - [ ] 3.1 Implement structure detection for different formats
    - Create detectPDFStructure function (font size, formatting)
    - Create detectDOCXStructure function (built-in styles)
    - Create detectPPTXStructure function (slide boundaries)
    - Create detectTXTStructure function (heuristics)
    - Return DocumentStructure with headings, paragraphs, lists
    - _Requirements: 3.3_
  
  - [ ] 3.2 Implement adaptive chunking algorithm
    - Use tiktoken library for token counting (cl100k_base encoding)
    - Target chunk size: 400-800 tokens
    - Apply 20% overlap between consecutive chunks
    - Respect semantic boundaries from structure detection
    - Avoid mid-sentence splits using sentence boundary detection
    - Enrich chunks with metadata (structureType, sectionHeading, pageNumber)
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [ ]* 3.3 Write property test for chunking constraints
    - **Property 4: Chunking Constraints**
    - **Validates: Requirements 3.1, 3.2, 3.3**
  
  - [ ] 3.4 Implement embedding generation
    - Batch chunks in groups of 100 for API efficiency
    - Call OpenAI text-embedding-3-small model
    - Verify embedding dimensions (1536)
    - Handle rate limiting with exponential backoff
    - _Requirements: 3.4_
  
  - [ ] 3.5 Implement Pinecone storage
    - Store embeddings in user namespace: user_{userId}_nominations
    - Include metadata: documentId, chunkIndex, nominationId, filename, text, tokenCount, uploadDate
    - Handle Pinecone errors and retries
    - _Requirements: 3.5, 3.6_
  
  - [ ]* 3.6 Write property test for embedding generation and storage
    - **Property 5: Embedding Generation and Storage**
    - **Validates: Requirements 3.4, 3.5, 3.6, 3.7**

- [ ] 4. Checkpoint - Document Processing Complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. RAG Engine Service - Core Implementation
  - [ ] 5.1 Implement query embedding generation
    - Use OpenAI text-embedding-3-small for query embeddings
    - Verify embedding dimensions (1536)
    - Handle API errors with retry logic
    - _Requirements: 4.1_
  
  - [ ] 5.2 Implement semantic search with Pinecone
    - Query Pinecone with user namespace filter
    - Apply nominationId metadata filter
    - Retrieve top K candidates based on cosine similarity
    - Return chunks with scores and metadata
    - _Requirements: 4.2, 4.4, 12.3_
  
  - [ ]* 5.3 Write property test for RAG retrieval isolation
    - **Property 6: RAG Retrieval Isolation**
    - **Validates: Requirements 4.2, 12.3**
  
  - [ ] 5.4 Implement hybrid search (semantic + keyword)
    - Build in-memory BM25 index for keyword search
    - Combine semantic and keyword results using Reciprocal Rank Fusion
    - Apply reranking to top results
    - _Requirements: 4.3, 4.5_
  
  - [ ] 5.5 Implement retrieval result constraints
    - Enforce topK limit (default 10)
    - Set timeout of 2 seconds for retrieval
    - Return empty result set with confidence 0 when no matches
    - _Requirements: 4.4, 4.6, 4.7_
  
  - [ ]* 5.6 Write property test for retrieval result constraints
    - **Property 7: Retrieval Result Constraints**
    - **Validates: Requirements 4.4, 4.6, 4.7**
  
  - [ ] 5.7 Implement caching for retrieval results
    - Cache results in Redis with TTL of 1 hour
    - Use query hash as cache key
    - Invalidate cache on document updates
    - _Requirements: Performance optimization_

- [ ] 6. Gap Analyzer Service - Core Implementation
  - [ ] 6.1 Implement requirement type definitions
    - Define RequirementType enum (nominee_info, achievement_description, etc.)
    - Create requirement analysis data structures
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_
  
  - [ ] 6.2 Implement gap detection logic
    - For each requirement type, generate targeted queries
    - Retrieve relevant chunks using RAG engine
    - Use LLM to extract structured information from chunks
    - Calculate confidence scores (0-1) based on completeness, quality, specificity
    - _Requirements: 5.8, 5.9_
  
  - [ ]* 6.3 Write property test for gap detection completeness
    - **Property 8: Gap Detection Completeness**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8**
  
  - [ ] 6.4 Implement clarification threshold logic
    - Mark requirements with confidence < 0.7 as needing clarification
    - Prioritize requirements (critical, important, optional)
    - _Requirements: 5.11_
  
  - [ ]* 6.5 Write property test for clarification threshold logic
    - **Property 9: Clarification Threshold Logic**
    - **Validates: Requirements 5.11, 6.1, 6.2**
  
  - [ ] 6.6 Implement gap analysis caching
    - Cache results in Redis with TTL of 1 hour
    - Invalidate cache on document changes
    - _Requirements: Performance optimization_

- [ ] 7. Clarification Manager Service - Core Implementation
  - [ ] 7.1 Implement question generation
    - Use GPT-4 to generate targeted questions for gaps
    - Include context from retrieved chunks
    - Ensure questions are specific and actionable
    - Group related questions (max 3 per batch)
    - _Requirements: 6.1, 6.2, 6.8_
  
  - [ ] 7.2 Implement answer submission and storage
    - Store answers in nomination_clarifications table
    - Record timestamp for each answer
    - Update confidence scores after answers
    - _Requirements: 6.5, 6.6_
  
  - [ ]* 7.3 Write property test for clarification answer persistence
    - **Property 10: Clarification Answer Persistence and Confidence Update**
    - **Validates: Requirements 6.5, 6.6**
  
  - [ ] 7.4 Implement completeness detection
    - Check if all critical questions are answered
    - Mark clarifications as complete when done
    - Allow progression to summary generation
    - _Requirements: 6.7_
  
  - [ ]* 7.5 Write property test for clarification completeness detection
    - **Property 11: Clarification Completeness Detection**
    - **Validates: Requirements 6.7**
  
  - [ ] 7.6 Implement question batching and prioritization
    - Present critical questions first
    - Allow skipping optional questions
    - Track answered vs pending questions
    - _Requirements: 6.3, 6.4_

- [ ] 8. Summary Generator Service - Core Implementation
  - [ ] 8.1 Implement map-reduce summarization
    - Map phase: Summarize each document independently
    - Reduce phase: Combine summaries into unified profile
    - Handle long documents exceeding token limits
    - _Requirements: 7.1, 7.2_
  
  - [ ] 8.2 Implement structured summary generation
    - Generate executive summary
    - Extract key achievements with sources
    - Extract impact metrics with sources
    - Build timeline of events
    - Identify supporting evidence
    - List unique differentiators
    - _Requirements: 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_
  
  - [ ]* 8.3 Write property test for summary structure completeness
    - **Property 12: Summary Structure Completeness**
    - **Validates: Requirements 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.11**
  
  - [ ]* 8.4 Write property test for multi-document synthesis
    - **Property 13: Summary Multi-Document Synthesis**
    - **Validates: Requirements 7.1**
  
  - [ ] 8.5 Implement summary versioning
    - Store summaries in nomination_summaries table
    - Increment version number on updates
    - Preserve previous versions for rollback
    - _Requirements: 7.11_
  
  - [ ] 8.6 Implement summary update endpoint
    - Allow user edits to summary sections
    - Create new version on update
    - Validate JSON structure
    - _Requirements: 10.3_

- [ ] 9. Award Matcher Service - Core Implementation
  - [ ] 9.1 Implement award criteria embedding
    - Generate embeddings for award criteria text
    - Use same model as candidate summaries
    - _Requirements: 8.2_
  
  - [ ] 9.2 Implement semantic matching
    - Compute cosine similarity between candidate and criteria
    - Normalize to 0-100 match score
    - _Requirements: 8.3, 8.4_
  
  - [ ]* 9.3 Write property test for award match score range
    - **Property 14: Award Match Score Range**
    - **Validates: Requirements 8.4, 8.5, 8.6, 8.7**
  
  - [ ] 9.4 Implement match explanation generation
    - Use GPT-4 to analyze candidate vs criteria
    - Identify strong matches with evidence
    - Identify weaknesses or gaps
    - Provide recommendations
    - _Requirements: 8.5, 8.6, 8.7_
  
  - [ ] 9.5 Implement match result caching
    - Cache results in Redis with TTL of 1 hour
    - Use hash of award criteria as cache key
    - _Requirements: Performance optimization_

- [ ] 10. Draft Generator Service - Core Implementation
  - [ ] 10.1 Implement section-by-section generation
    - Generate introduction section
    - Generate achievement details section
    - Generate impact results section
    - Generate supporting evidence section
    - Generate conclusion section
    - _Requirements: 9.5, 9.6, 9.7, 9.8, 9.9_
  
  - [ ] 10.2 Implement citation extraction and linking
    - Parse generated text for citation markers
    - Link citations to original document chunks
    - Store citation metadata
    - _Requirements: 9.3_
  
  - [ ]* 10.3 Write property test for draft structure completeness
    - **Property 15: Draft Structure Completeness**
    - **Validates: Requirements 9.3, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.12**
  
  - [ ]* 10.4 Write property test for draft input integration
    - **Property 16: Draft Input Integration**
    - **Validates: Requirements 9.1**
  
  - [ ] 10.5 Implement draft versioning
    - Store drafts in nomination_drafts table
    - Increment version number on updates
    - Preserve previous versions for rollback
    - _Requirements: 9.12_
  
  - [ ]* 10.6 Write property test for version control correctness
    - **Property 17: Version Control Correctness**
    - **Validates: Requirements 10.3**
  
  - [ ] 10.7 Implement section regeneration
    - Allow regeneration of specific sections
    - Preserve other sections unchanged
    - Update version number
    - _Requirements: 10.4, 10.5_
  
  - [ ]* 10.8 Write property test for selective section regeneration
    - **Property 18: Selective Section Regeneration**
    - **Validates: Requirements 10.4, 10.5**
  
  - [ ] 10.9 Implement format requirements handling
    - Parse format requirements from user input
    - Include in system prompt for generation
    - Validate output against requirements
    - _Requirements: 9.4_

- [ ] 11. Export Service - Core Implementation
  - [ ] 11.1 Implement markdown export
    - Return draft content as-is
    - _Requirements: 10.7_
  
  - [ ] 11.2 Implement DOCX export
    - Use docx library to convert markdown
    - Preserve headings, bullet points, emphasis
    - _Requirements: 10.8_
  
  - [ ]* 11.3 Write property test for export format preservation
    - **Property 19: Export Format Preservation**
    - **Validates: Requirements 10.8**
  
  - [ ] 11.4 Implement PDF export
    - Use puppeteer or pdfkit to render markdown as PDF
    - Preserve formatting
    - _Requirements: 10.7_
  
  - [ ] 11.5 Implement TXT export
    - Strip markdown formatting
    - Return plain text
    - _Requirements: 10.7_

- [ ] 12. Checkpoint - Core Services Complete
  - Ensure all core services are implemented and tested
  - Verify integration between services
  - Ask the user if questions arise

- [ ] 13. API Routes - Nomination Management
  - [ ] 13.1 Implement POST /api/nominations
    - Create new nomination with title
    - Initialize status as DRAFT
    - Return nomination details
    - _Requirements: 14.1_
  
  - [ ] 13.2 Implement GET /api/nominations/:id
    - Retrieve nomination details
    - Verify user ownership
    - Include documents, summary, draft
    - _Requirements: 14.13_
  
  - [ ] 13.3 Implement GET /api/nominations
    - List all nominations for authenticated user
    - Support pagination (page, limit)
    - Support status filtering
    - _Requirements: 14.14_
  
  - [ ] 13.4 Implement DELETE /api/nominations/:id
    - Verify user ownership
    - Delete nomination and all associated data
    - Remove documents from S3
    - Remove embeddings from Pinecone
    - _Requirements: 14.15, 12.6_
  
  - [ ]* 13.5 Write property test for cascade deletion completeness
    - **Property 23: Cascade Deletion Completeness**
    - **Validates: Requirements 12.6, 16.7**

- [ ] 14. API Routes - Document Management
  - [ ] 14.1 Implement POST /api/nominations/:id/documents
    - Handle file upload with multer
    - Validate file type and size
    - Store in S3 and database
    - Trigger async processing
    - _Requirements: 14.2_
  
  - [ ] 14.2 Implement GET /api/nominations/:nominationId/documents
    - List all documents for nomination
    - Return metadata and processing status
    - Calculate total size
    - _Requirements: 14.3_
  
  - [ ] 14.3 Implement DELETE /api/nominations/:nominationId/documents/:documentId
    - Verify user ownership
    - Delete from S3, Pinecone, database
    - Log deletion in audit log
    - _Requirements: 14.4, 15.1, 15.2, 15.3, 15.4, 15.5_
  
  - [ ]* 14.4 Write property test for document deletion completeness
    - **Property 24: Document Deletion Completeness**
    - **Validates: Requirements 15.1, 15.2, 15.3, 15.4**

- [ ] 15. API Routes - Gap Analysis and Clarifications
  - [ ] 15.1 Implement GET /api/nominations/:id/analysis
    - Trigger gap analysis if not cached
    - Return requirements with confidence scores
    - Return overall completeness
    - _Requirements: 14.5_
  
  - [ ] 15.2 Implement POST /api/nominations/:id/clarifications
    - Submit clarification answer
    - Update confidence score
    - Store in database with timestamp
    - _Requirements: 14.6_

- [ ] 16. API Routes - Summary and Matching
  - [ ] 16.1 Implement GET /api/nominations/:id/summary
    - Retrieve latest summary version
    - Return structured JSON
    - _Requirements: 14.7_
  
  - [ ] 16.2 Implement PUT /api/nominations/:id/summary
    - Update summary sections
    - Create new version
    - Validate JSON structure
    - _Requirements: 14.8_
  
  - [ ] 16.3 Implement POST /api/nominations/:id/match
    - Accept award criteria
    - Compute match score
    - Generate explanation
    - Return results
    - _Requirements: 14.9_

- [ ] 17. API Routes - Draft Management
  - [ ] 17.1 Implement POST /api/nominations/:id/draft
    - Generate nomination draft
    - Accept format requirements
    - Return draft with sections and citations
    - _Requirements: 14.10_
  
  - [ ] 17.2 Implement PUT /api/nominations/:id/draft
    - Update draft content
    - Support section regeneration
    - Create new version
    - _Requirements: 14.11_
  
  - [ ] 17.3 Implement POST /api/nominations/:id/finalize
    - Mark nomination as FINALIZED
    - Return available export formats
    - _Requirements: 14.12_

- [ ] 18. Workflow State Management
  - [ ] 18.1 Implement state transition logic
    - Validate state transitions against workflow
    - Update status in database
    - Persist state changes
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11_
  
  - [ ]* 18.2 Write property test for state machine correctness
    - **Property 20: State Machine Correctness**
    - **Validates: Requirements 11.1-11.11**
  
  - [ ] 18.3 Implement state restoration
    - Load nomination state from database
    - Restore workflow position
    - Allow continuation from last step
    - _Requirements: 11.12_
  
  - [ ]* 18.4 Write property test for state restoration
    - **Property 21: State Restoration**
    - **Validates: Requirements 11.12**
  
  - [ ] 18.5 Implement session state caching
    - Store temporary state in Redis
    - TTL of 1 hour
    - Sync with database on state changes
    - _Requirements: 11.13_

- [ ] 19. Security and Authorization
  - [ ] 19.1 Implement JWT authentication middleware
    - Validate JWT tokens
    - Extract user ID from token
    - Handle expired tokens
    - _Requirements: 12.1_
  
  - [ ] 19.2 Implement ownership verification
    - Check user owns nomination before operations
    - Return 403 Forbidden for unauthorized access
    - Log authorization failures
    - _Requirements: 12.2_
  
  - [ ]* 19.3 Write property test for authorization enforcement
    - **Property 22: Authorization Enforcement**
    - **Validates: Requirements 12.2**
  
  - [ ] 19.4 Implement audit logging
    - Log all operations with user_id, timestamp, operation type
    - Store in nomination_audit_log table
    - _Requirements: 12.5, 15.5_
  
  - [ ]* 19.5 Write property test for audit logging completeness
    - **Property 25: Audit Logging Completeness**
    - **Validates: Requirements 12.5, 15.5**
  
  - [ ] 19.6 Implement data encryption
    - Enable S3 server-side encryption
    - Encrypt sensitive data in database
    - _Requirements: 12.4_

- [ ] 20. Error Handling and Resilience
  - [ ] 20.1 Implement validation error handling
    - Validate inputs at API boundary
    - Return 400 with field-level errors
    - _Requirements: 17.1, 17.6_
  
  - [ ] 20.2 Implement authentication error handling
    - Return 401 for missing/invalid tokens
    - _Requirements: 17.7_
  
  - [ ] 20.3 Implement authorization error handling
    - Return 403 for unauthorized access
    - _Requirements: 17.8_
  
  - [ ] 20.4 Implement not found error handling
    - Return 404 for missing resources
    - _Requirements: 17.9_
  
  - [ ] 20.5 Implement rate limiting
    - Use express-rate-limit middleware
    - Return 429 with retry-after header
    - _Requirements: 17.4_
  
  - [ ] 20.6 Implement circuit breaker for external services
    - Implement circuit breaker pattern
    - Retry with exponential backoff
    - Return 503 for service unavailability
    - _Requirements: 17.5_
  
  - [ ] 20.7 Implement processing failure handling
    - Mark operations as failed in database
    - Store error messages
    - Allow retry without re-upload
    - _Requirements: 17.2, 17.3_
  
  - [ ]* 20.8 Write property test for error handling correctness
    - **Property 28: Error Handling Correctness**
    - **Validates: Requirements 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9**

- [ ] 21. Performance Optimization
  - [ ] 21.1 Implement caching strategy
    - Cache gap analysis results (1 hour TTL)
    - Cache match results (1 hour TTL)
    - Cache retrieval results (1 hour TTL)
    - _Requirements: Performance optimization_
  
  - [ ] 21.2 Implement async job queue
    - Use Bull/BullMQ for background jobs
    - Queue document processing
    - Queue embedding generation
    - Queue draft generation
    - _Requirements: 13.7_
  
  - [ ] 21.3 Implement progress tracking
    - Track job progress in Redis
    - Provide progress indicators to users
    - _Requirements: 13.6_
  
  - [ ]* 21.4 Write property test for performance thresholds
    - **Property 26: Performance Thresholds**
    - **Validates: Requirements 1.7, 2.5, 5.10, 7.10, 9.11, 13.1, 13.2, 13.3, 13.4, 13.5**

- [ ] 22. API Contract Compliance
  - [ ] 22.1 Implement standard response format
    - Use APIResponse<T> interface for all endpoints
    - Include success, data, error, timestamp
    - _Requirements: 14.16_
  
  - [ ] 22.2 Implement HTTP status codes
    - Return appropriate status codes (200, 201, 400, 401, 403, 404, 429, 500, 503)
    - _Requirements: 14.17_
  
  - [ ]* 22.3 Write property test for API contract compliance
    - **Property 27: API Contract Compliance**
    - **Validates: Requirements 14.1-14.17**

- [ ] 23. Integration Testing
  - [ ] 23.1 Write integration tests for document upload flow
    - Test upload → extraction → chunking → embedding
    - Verify S3 storage and Pinecone indexing
  
  - [ ] 23.2 Write integration tests for gap analysis flow
    - Test document processing → gap detection → question generation
  
  - [ ] 23.3 Write integration tests for summary generation flow
    - Test clarifications → summary generation → versioning
  
  - [ ] 23.4 Write integration tests for draft generation flow
    - Test summary → matching → draft generation → export
  
  - [ ] 23.5 Write integration tests for state machine
    - Test all state transitions
    - Test state restoration

- [ ] 24. Deployment and Documentation
  - [ ] 24.1 Update environment variables
    - Add S3 bucket configuration
    - Add Pinecone API key and index name
    - Add OpenAI API key
    - Add Redis connection string
  
  - [ ] 24.2 Create database migration
    - Run migration to create all tables
    - Verify schema integrity
  
  - [ ] 24.3 Update API documentation
    - Document all endpoints
    - Provide request/response examples
    - Document error codes
  
  - [ ] 24.4 Deploy to production
    - Deploy backend changes
    - Verify all services are running
    - Monitor error rates and performance

- [ ] 25. Final Checkpoint - Production Ready
  - All tests passing (unit + property-based + integration)
  - All endpoints documented
  - Database migration applied
  - Deployed to production
  - Monitoring and alerts configured

