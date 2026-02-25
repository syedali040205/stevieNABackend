# Nomination Assistant - Implementation Notes

## Overview

The Nomination Assistant spec is now complete and ready for implementation. This document provides a quick reference for developers starting the implementation.

## Spec Status

✅ **Complete** - All documents finalized with production-grade best practices

### Documents
1. **PRODUCT_CONTEXT.md** - Full product vision and requirements
2. **RESEARCH_SUMMARY.md** - 70+ sources researched for best practices
3. **requirements.md** - 17 detailed requirements with acceptance criteria
4. **design.md** - Complete architecture with 28 correctness properties
5. **tasks.md** - Phased implementation plan with 25 tasks
6. **IMPLEMENTATION_NOTES.md** - This document

## Quick Start

1. Open `.kiro/specs/nomination-assistant/tasks.md`
2. Start with Task 1: Database Schema and Migrations
3. Follow the tasks sequentially through checkpoints
4. Each task references specific requirements for validation

## Architecture Highlights

### Technology Stack
- **Runtime**: Node.js 18+ with TypeScript
- **API**: Express.js with middleware
- **Database**: PostgreSQL (Supabase) with JSONB + GIN indexes
- **Vector DB**: Pinecone with namespace-per-user isolation
- **Storage**: AWS S3 with presigned URLs
- **Cache**: Redis for session state
- **Queue**: BullMQ for async processing
- **LLM**: OpenAI GPT-4 + text-embedding-3-small

### Key Design Decisions

#### 1. S3 Presigned URLs (NEW)
- Direct client-to-S3 uploads bypass server
- 15-minute expiration for security
- Reduces server load, enables parallel uploads
- Fallback to traditional upload if needed

#### 2. BullMQ Job Queue (NEW)
- All long-running operations processed asynchronously
- Priority queues for user-initiated vs. batch operations
- Automatic retry with exponential backoff
- Rate limiting for external APIs (OpenAI, Pinecone)

#### 3. Pinecone Namespace Isolation
- One namespace per user: `user_{userId}_nominations`
- Physical isolation prevents data leaks
- Cost optimization (1 RU vs 100 RU)
- Recommended pattern by Pinecone

#### 4. PostgreSQL JSONB with GIN Indexes (NEW)
- 40-60% faster queries on JSONB columns
- Essential for summary and draft storage
- Production-tested optimization

#### 5. OpenAI Batch Processing (NEW)
- Batch size: 100-2048 embeddings per request
- Exponential backoff for rate limits
- Token bucket rate limiter
- Batch API option for non-urgent processing (50% cost savings)

## Implementation Phases

### Phase 1: Foundation (Tasks 1-4)
- Database schema and migrations
- Document processor service
- Document chunking and embedding generation
- **Checkpoint**: Document processing complete

### Phase 2: RAG & Analysis (Tasks 5-9)
- RAG engine service
- Gap analyzer service
- Clarification manager service
- Summary generator service
- Award matcher service
- **Checkpoint**: Core services complete

### Phase 3: Draft Generation (Tasks 10-11)
- Draft generator service
- Export service (DOCX, PDF, TXT, Markdown)

### Phase 4: API Layer (Tasks 13-17)
- Nomination management endpoints
- Document management endpoints
- Gap analysis and clarifications endpoints
- Summary and matching endpoints
- Draft management endpoints

### Phase 5: Infrastructure (Tasks 18-21)
- Workflow state management
- Security and authorization
- Error handling and resilience
- Performance optimization

### Phase 6: Testing & Deployment (Tasks 22-25)
- API contract compliance
- Integration testing
- Deployment and documentation
- **Final Checkpoint**: Production ready

## Critical Implementation Notes

### Security
- **CRITICAL**: Every data access MUST verify user ownership
- Use namespace isolation in Pinecone (not just metadata filters)
- Implement row-level security in PostgreSQL
- Audit all access attempts

### Performance
- Use async job queue for operations >30 seconds
- Implement caching (Redis) for repeated operations
- Batch OpenAI API calls (max 2048 per request)
- Use GIN indexes on all JSONB columns

### Error Handling
- Implement circuit breaker for external services
- Exponential backoff for retries (max 3 attempts)
- Store error messages for user visibility
- Allow retry without re-upload

### Testing
- Write both unit tests AND property-based tests
- Use `fast-check` library for property tests
- Minimum 100 iterations per property test
- Each property test must reference design document property

## Environment Variables Required

```bash
# Database
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=

# Redis
REDIS_URL=

# AWS S3
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
S3_BUCKET=

# Pinecone
PINECONE_API_KEY=
PINECONE_ENVIRONMENT=
PINECONE_INDEX_NAME=

# OpenAI
OPENAI_API_KEY=

# Application
NODE_ENV=
PORT=
JWT_SECRET=
```

## Common Pitfalls to Avoid

1. **Don't skip namespace verification** - Always verify user namespace in Pinecone queries
2. **Don't use metadata filters as primary security** - Use namespaces for isolation
3. **Don't process large operations synchronously** - Use BullMQ for anything >30s
4. **Don't forget GIN indexes** - JSONB queries are slow without them
5. **Don't ignore rate limits** - Implement exponential backoff and rate limiters
6. **Don't skip property-based tests** - They catch edge cases unit tests miss

## Monitoring & Alerts

Set up alerts for:
- Error rate > 5% over 5 minutes
- External service failure rate > 10%
- Average response time > 2x baseline
- Circuit breaker opens
- Database connection pool exhaustion
- Job queue backlog > 1000 jobs

## Support Resources

- **Design Document**: `.kiro/specs/nomination-assistant/design.md`
- **Requirements**: `.kiro/specs/nomination-assistant/requirements.md`
- **Tasks**: `.kiro/specs/nomination-assistant/tasks.md`
- **Research**: `.kiro/specs/nomination-assistant/RESEARCH_SUMMARY.md`

## Next Steps

1. Review all spec documents
2. Set up development environment
3. Create database migration (Task 1)
4. Begin implementation following tasks.md

---

**Ready to start?** Open `tasks.md` and begin with Task 1!
