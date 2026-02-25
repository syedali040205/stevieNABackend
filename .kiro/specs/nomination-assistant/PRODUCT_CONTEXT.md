# Nomination Assistant - Full Product Context

**Product Name**: Nomination Assistant (powered by Rexy AI backbone)

**Status**: Full feature development

**Integration**: Separate flow from recommendation system

**Storage**: S3 for documents and nominations (year-over-year persistence)

**Vector DB**: Pinecone (already configured)

---

## Core Value Propositions

### 1. Convenience & Speed (First-Year Usage)
- Blank page → structured draft in minutes
- AI-guided interview reduces confusion
- Clear framing of what judges want

### 2. Smart Cross-Program Growth (Same-Year Expansion)
- Identify similar categories after first nomination
- Reuse existing info with incremental answers
- Increase total nominations per entrant

### 3. Year-Over-Year Continuity (Retention Flywheel)
- Store: org profile, product profile, metrics, proofs, narratives
- Next year: "What changed?" prompts
- Quick refresh with existing knowledge base

### 4. Integrity & Differentiation
- Increase completeness, reduce low-quality entries
- Anti-template variety controls
- Evidence-backed claims

### 5. Data Privacy & Controlled Disclosure
- Safe internal collaboration
- No sensitive data in public LLM tools

---

## Target Users

### Entrant Personas
1. **Founder/Exec**: Speed, storytelling, minimal effort
2. **Marketing/Comms Lead**: Narrative polish, brand alignment
3. **Ops/PM**: Structured workflow, proof collection, completeness
4. **Agency/Consultant**: Multi-org management

### Stevie/TBR Internal Personas
1. **Program Ops**: Manage categories, questions, deadlines
2. **Growth/Marketing**: Increase nominations, entrant LTV
3. **Support**: Reduce confusion and back-and-forth
4. **Judging Ops**: Improve entry quality

---

## End-to-End User Experience

### Step 1: Onboarding
- Create account (or SSO)
- Create/select Organization
- Create/select Project/Product
- Invite teammates (collaboration)

### Step 2: Pick Program & Category
- Browse program → category → subcategory
- View: eligibility, questions, limits, proofs, deadlines, fees

### Step 3: AI-Guided Interview (Gap-Filling)
- Load official question set
- Structured interview:
  1. Facts first (dates, metrics, scope)
  2. Outcomes (impact, results)
  3. Differentiation (why unique)
  4. Proof (links/docs/videos)
- Capture structured fields + generate draft answers

### Step 4: Evidence + Claims Validation
- Upload PDFs, decks, case studies, press, screenshots, videos
- Link evidence to specific claims ("evidence mapping")
- Internal review checklist

### Step 5: Nomination Package Assembly
- Generate:
  - Final written answers
  - Executive summary
  - Judge-friendly highlights
  - Asset manifest
- Output:
  - Downloadable ZIP with structured layout
  - Copy-ready format for portal

### Step 6: Recommendations for Additional Entries
- "You may also qualify for: X, Y, Z"
- "Re-use 80% of content; answer 3 extra questions"
- One-click to start new nomination with prefilled content

### Step 7: Next Year Re-Entry
- "Clone last year's nomination"
- AI asks only what changed:
  - Updated metrics
  - New features
  - New customers
  - New impact stats
- Generate updated nomination quickly

---

## Product Components

### A. Stevie Knowledge Base (Program/Category Intelligence)
- Programs (Technology Excellence, Women in Business, etc.)
- Categories and subcategories
- Eligibility rules and constraints
- Question sets (prompts, limits, scoring hints)
- Submission requirements
- Key dates (deadlines)
- Pricing/fees per entry

### B. Entrant Knowledge Base (User/Org/Product Intelligence)
- Organization profile (industry, size, geography, website)
- Product/project profile (what it is, target users, differentiators)
- Achievements (milestones, launches, growth, impact)
- Metrics time series (year-over-year)
- Proof assets and links
- Prior nominations and versions
- Team collaboration notes and approvals

### C. Nomination Builder (Workflow Engine)
- Dynamic interview generation per category
- Required vs optional questions
- Word/character limits
- Branching questions
- Scoring rubric alignment

### D. Draft Generator (LLM Layer)
- Question-by-question answers
- Executive summaries
- Unified narrative options
- Multiple tones (direct, data-driven, story-led)
- Anti-template variation
- Strict adherence to limits

### E. Evidence Manager
- Upload, store, tag, reference assets
- Evidence-to-claim mapping
- Versioning per year/cycle

### F. Recommendation Engine
- Uses: entrant profile + completed content
- Produces: recommended programs/categories
- Effort estimate ("80% reusable, 3 missing answers")
- Potential cost vs benefit metrics

### G. Exporter / Submission Mapper
- ZIP generator with consistent structure
- Field mapping templates per program/category
- Export formats: JSON, DOCX/PDF, plain text

### H. Admin Console (for Stevie Ops)
- Manage program taxonomy
- Import/edit question sets
- Validate changes before publishing
- Version control per awards cycle
- Audit logs

### I. Analytics & Experimentation
- Funnel analytics
- Cohorts (returning users)
- A/B testing (recommendation timing, question flow)

---

## Architecture Overview

### Data Stores
1. **Relational DB (Postgres/Supabase)**
   - Programs, categories, questions, eligibility
   - Organizations, products, nominations, answers, versions

2. **Vector Store (Pinecone)**
   - Category descriptions, guidance, FAQs
   - Entrant docs, case studies, prior nominations
   - **Namespace per user**: `user_{user_id}_documents`

3. **Object Storage (S3)**
   - PDFs, videos, images
   - Generated DOCX/PDF, ZIP packages
   - Year-over-year persistence

### RAG Design (Two-Sided Retrieval)

**Stevie Corpus**:
- Category description
- Eligibility rules
- Question guidance
- Examples (if allowed)
- Rubric hints

**Entrant Corpus**:
- Org/product profile
- Prior answers
- Attached evidence
- Prior nominations

**Retrieval Strategy**:
For each question, retrieve:
1. Relevant official guidance (Stevie KB)
2. Relevant entrant facts and proofs (Entrant KB)
3. Generate answer that is:
   - Grounded in entrant facts
   - Compliant with category constraints
   - Consistent in voice, not templated

### LLM Orchestration (Per Answer)
1. Normalize question + constraints
2. Retrieve Stevie guidance + entrant info
3. Draft answer (stick to facts provided)
4. Self-check:
   - Limit compliance
   - Missing data detection
   - Claim/evidence alignment
5. Ask follow-up if needed (gap closure)
6. Finalize and store:
   - Structured extracted facts
   - Final narrative answer
   - Citations to internal sources

---

## Preventing "All Nominations Look the Same"

### Integrity Controls

1. **Fact-First Design**
   - Force unique details, metrics, dates, outcomes
   - AI can't invent; must ask for concrete inputs

2. **Voice & Structure Variability**
   - Multiple narrative styles (data-driven, story-led, technical, customer impact)
   - Controlled variability in phrasing

3. **Evidence-Linked Claims**
   - Encourage proof attachment
   - Naturally differentiates entries

4. **Anti-Template Prompts**
   - Explicitly instruct LLM to avoid generic filler
   - No "award-speak"

5. **Human Finalization**
   - Require user review and edits before export

6. **Originality Nudges**
   - Flag generic drafts: "Add specifics: metric, customer story, before/after, timeframe"

---

## Security, Privacy & Compliance

### Data Handling Principles
- Entrant data is sensitive and proprietary
- Encryption at rest and in transit
- Strict access controls per org/project
- Audit logs for access and exports
- Data retention policies per cycle

### Model & Vendor Controls
- OpenAI API configuration for privacy
- Clear policy: what is stored, what is not
- Who can access inside Stevie/Rexy
- How long evidence files remain available

### Multi-Tenant Isolation
- Organization-level separation (mandatory)
- No cross-org retrieval
- No cross-org vector indexing
- Explicit `tenant_id` on every record
- Pinecone namespace per user

### Collaboration Controls
- Roles: owner, editor, viewer
- Export permissions
- Add/remove assets permissions

---

## Success Metrics

### Primary Metrics
- **Nominations per entrant** (revenue lever)
- **Recommendation acceptance rate**
- **Completion rate per nomination session**
- **Time to first completed nomination**
- **Returning entrant rate next cycle**

### Secondary Metrics
- Support tickets per entrant (should decrease)
- Judging ops feedback on completeness/quality
- Average nominations per entrant
- Funnel conversion rates

---

## Rollout Strategy

### Recommended Approach
**Start separate-but-connected** for one cycle (or subset of programs):
- Prove quality + integrity
- Gather feedback
- Then integrate more deeply once trust is established

### Integration Options

**Option A: Integrated inside Stevie dashboard**
- Pros: Higher usage, easier recommendations, less friction
- Cons: Optics concerns about "AI writing tool"

**Option B: Separate but connected**
- Pros: Clear separation, optional adoption, reduces uniformity risk
- Cons: More friction, lower conversion

---

## Data Model (Conceptual)

### Stevie-Side Entities
- Program
- Category (umbrella)
- Subcategory
- AwardsCycle (year/season)
- Question (with constraints: limit, required, type)
- EligibilityRule (structured + text)
- SubmissionTemplate (for field mapping/export)

### Entrant-Side Entities
- Organization
- Person (optional, for individual categories)
- Product/Project
- Nomination
- NominationAnswer (drafts + final + versions)
- EvidenceAsset (file/link)
- EvidenceLink (to question/claim)
- Metrics (time-series)
- Collaboration (members, roles)
- AuditEvent

---

## What We Need from Stevie Backend

### Ideal (API Endpoints)
1. Category taxonomy endpoint
2. Question set endpoint (with constraints, per-cycle versioning)
3. Eligibility metadata (structured)
4. Deadlines/fees per program/category
5. Stable IDs for programs/categories/questions
6. Change feed: "what changed since last import?"

### Acceptable Fallback
- CSV/JSON export formats
- Scheduled imports (weekly/daily)
- Content validation rules
- Same stable IDs

### Minimum Viable Ingestion
- Program taxonomy
- Question sets + constraints
- Category metadata (eligibility)
- Per-cycle versioning

---

## Key Differentiators from Existing Recommendation System

| Feature | Recommendation System | Nomination Assistant |
|---------|----------------------|---------------------|
| Purpose | Help users find award categories | Help users create nominations |
| Input | User profile (chat-based) | Documents + structured interview |
| Output | Ranked category recommendations | Complete nomination package |
| Storage | Session-based | Year-over-year persistence (S3) |
| Vector DB | Category embeddings | User documents + prior nominations |
| Workflow | Single-step recommendation | Multi-step wizard (7 steps) |
| Collaboration | Single user | Multi-user (owner, editor, viewer) |
| Evidence | Not required | Central feature (upload + mapping) |
| Export | Not applicable | ZIP package with structured layout |

---

## Next Steps

1. ✅ Research completed (70+ sources)
2. ✅ Product context documented
3. ✅ Additional production optimization research (5 sources - OpenAI, S3, PostgreSQL, BullMQ, Pinecone)
4. ✅ Requirements.md complete with full feature set
5. ✅ Design.md complete with detailed architecture and production best practices
6. ✅ Tasks.md complete with implementation plan
7. ⏳ Ready for implementation - open tasks.md to begin

---

**Document Version**: 1.1  
**Last Updated**: 2026-02-25  
**Status**: Spec complete - ready for implementation

## Production Optimizations Added

Based on latest research (2024-2026), the following production-grade optimizations have been incorporated:

### 1. OpenAI Embeddings Optimization
- Batch size increased to 2048 (max supported)
- Exponential backoff for rate limit handling
- Batch API option for non-urgent processing (50% cost savings)
- Token bucket rate limiter implementation

### 2. S3 Presigned URLs
- Direct client-to-S3 uploads (bypasses server bottleneck)
- 15-minute expiration for security
- Parallel upload support
- Reduces server load and improves upload speed

### 3. PostgreSQL JSONB Indexing
- GIN indexes on JSONB columns
- 40-60% faster query performance
- Production-tested optimization patterns

### 4. BullMQ Async Processing
- Redis-backed job persistence
- Priority queues for urgent operations
- Automatic retry with exponential backoff
- Rate limiting for external API calls
- Distributed worker support

### 5. Pinecone Multi-Tenancy
- Namespace-per-user pattern (recommended by Pinecone)
- Physical isolation for security
- Cost optimization (1 RU vs 100 RU for filtered queries)
- No "noisy neighbor" problems
