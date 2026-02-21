# RAG Optimization Tasks: Improving Recommendation Accuracy

## Overview

This task list focuses on implementing advanced RAG techniques to significantly improve recommendation accuracy for the Stevie Awards Nomination Assistant. Based on industry best practices and research from 2024-2026, these optimizations target the core retrieval and ranking pipeline to deliver more contextually relevant category recommendations.

**Current System Analysis:**
- Pure vector search using text-embedding-3-small (1536d)
- Single-stage retrieval with cosine similarity
- Template-based query formatting with basic synonym expansion
- No reranking or hybrid search
- Fixed chunking strategy (entire category as single chunk)

**Target Improvements:**
- 35-40% improvement in retrieval accuracy (based on research benchmarks)
- Better handling of exact keyword matches (product names, technical terms)
- Improved semantic understanding of user intent
- More relevant top-K results through reranking
- Context-aware retrieval that understands nomination nuances

**Research Sources:**
- Anthropic's Contextual Retrieval (67% reduction in retrieval failures)
- Hybrid Search (BM25 + Vector) best practices
- Two-stage retrieval with reranking (40%+ quality improvement)
- Query expansion and reformulation techniques
- Semantic chunking strategies

---

## Tasks

### Phase 1: Hybrid Search Implementation (Vector + Keyword)

- [x] 1. Research and design hybrid search architecture
  - Review current vector search implementation in embeddingManager.ts
  - Research BM25 implementation options for PostgreSQL (ts_rank, pg_trgm)
  - Design Reciprocal Rank Fusion (RRF) algorithm for merging results
  - Document alpha parameter tuning strategy (balance between vector and keyword)
  - Create design document with architecture diagrams
  - _Target: 20-30% better retrieval accuracy for exact matches_

- [ ] 2. Implement BM25 keyword search in PostgreSQL
  - Add full-text search columns to stevie_categories table (tsvector)
  - Create GIN index on search columns for performance
  - Implement ts_rank scoring function
  - Create database function for BM25-style keyword search
  - Test with various queries (product names, technical terms, exact phrases)
  - _Requirements: Exact keyword matching for technical queries_

- [ ] 3. Implement Reciprocal Rank Fusion (RRF)
  - Create new service: api/src/services/hybridSearchService.ts
  - Implement RRF algorithm (k=60 constant from research)
  - Merge vector search results with BM25 results
  - Handle deduplication by category_id
  - Add configurable alpha parameter (0.0 = pure keyword, 1.0 = pure vector)
  - _Requirements: Combine semantic and keyword search strengths_

- [ ] 4. Integrate hybrid search into recommendation engine
  - Modify recommendationEngine.ts to use hybridSearchService
  - Add HYBRID_SEARCH_ENABLED environment variable (default: true)
  - Add HYBRID_SEARCH_ALPHA environment variable (default: 0.7 for 70% vector, 30% keyword)
  - Retrieve 50 candidates from hybrid search (vs current 15)
  - Log hybrid search metrics (vector score, keyword score, combined score)
  - _Requirements: Backward compatible, feature-flagged_

- [ ] 5. Test hybrid search with diverse queries
  - Create test suite with 20+ diverse nomination scenarios
  - Test exact product names ("Salesforce", "AWS Lambda")
  - Test technical terms ("machine learning", "API integration")
  - Test semantic queries ("improved customer satisfaction")
  - Compare results: pure vector vs hybrid search
  - Measure improvement in top-5 and top-10 accuracy
  - _Target: 20-30% improvement in retrieval accuracy_

### Phase 2: Two-Stage Retrieval with Reranking

- [ ] 6. Research reranking models and services
  - Evaluate Cohere Rerank API (rerank-english-v3.0)
  - Evaluate open-source alternatives (BGE Reranker, Jina Reranker)
  - Compare cost, latency, and accuracy trade-offs
  - Document recommendation: Cohere for production, BGE for cost-sensitive
  - Create cost analysis (Cohere: $1 per 1,000 rerank requests)
  - _Target: 35-40% improvement in ranking quality_

- [ ] 7. Implement Cohere Rerank integration
  - Install cohere-ai npm package
  - Create new service: api/src/services/rerankerService.ts
  - Implement Cohere Rerank API integration
  - Add error handling and fallback (return original ranking if rerank fails)
  - Add RERANK_ENABLED environment variable (default: false for gradual rollout)
  - Add RERANK_MODEL environment variable (default: rerank-english-v3.0)
  - _Requirements: Optional, feature-flagged, graceful degradation_

- [ ] 8. Integrate reranking into recommendation pipeline
  - Modify recommendationEngine.ts to add reranking stage
  - Retrieve 50 candidates from hybrid search (Stage 1)
  - Rerank to top 15 using Cohere (Stage 2)
  - Format rerank query: user description + context
  - Format rerank documents: category title + description
  - Log reranking metrics (before/after scores, reordering count)
  - _Requirements: Two-stage retrieval pipeline_

- [ ] 9. Implement reranking cache layer
  - Add reranking cache to cacheManager.ts
  - Cache key: hash of (query + candidate IDs)
  - TTL: 24 hours (same as recommendation cache)
  - Check cache before calling Cohere API
  - Reduce API costs by 70-80% through caching
  - _Requirements: Cost optimization_

- [ ] 10. Test reranking with A/B comparison
  - Create test suite comparing: hybrid search vs hybrid + rerank
  - Measure top-5 accuracy improvement
  - Measure NDCG@10 (Normalized Discounted Cumulative Gain)
  - Measure latency impact (target: <2s for reranking)
  - Document cost per recommendation (target: <$0.01)
  - _Target: 35-40% improvement in ranking quality_

### Phase 3: Query Expansion and Reformulation

- [x] 11. Implement HyDE (Hypothetical Document Embeddings)
  - Create new method in embeddingManager.ts: generateHyDEQuery()
  - Use LLM to generate hypothetical award category description from user context
  - Embed the hypothetical description (not the original query)
  - Improves semantic match when user descriptions are vague
  - Add HYDE_ENABLED environment variable (default: false)
  - _Requirements: Better handling of short/vague descriptions_

- [x] 12. Implement multi-query expansion
  - Create new method: generateExpandedQueries()
  - Use LLM to generate 3-5 alternative phrasings of user query
  - Example: "AI product" → ["artificial intelligence solution", "machine learning platform", "intelligent software"]
  - Retrieve candidates for each query variant
  - Merge results using RRF
  - Add MULTI_QUERY_ENABLED environment variable (default: false)
  - _Requirements: Better recall for ambiguous queries_

- [x] 13. Implement contextual query enrichment
  - Enhance existing generateRichSearchQuery() method
  - Add industry-specific terminology expansion
  - Add achievement-type specific keywords (innovation → breakthrough, pioneering)
  - Add organization-type specific context (for-profit → business, revenue, growth)
  - Use few-shot examples for consistent formatting
  - _Requirements: More contextually relevant queries_

- [ ] 14. Test query expansion techniques
  - Compare baseline vs HyDE vs multi-query vs enrichment
  - Measure recall improvement (% of relevant categories retrieved)
  - Measure precision (% of retrieved categories that are relevant)
  - Measure latency impact (target: <3s total)
  - Document optimal strategy for different query types
  - _Target: 15-25% improvement in recall_

### Phase 4: Contextual Retrieval and Chunking

- [x] 15. Implement contextual chunk enrichment (Anthropic technique)
  - For each category, generate contextual prefix using LLM
  - Prefix format: "This category is for [context]. [original description]"
  - Context includes: program name, focus areas, eligibility criteria
  - Prepend context to category text before embedding
  - Store both original and contextual embeddings
  - Add CONTEXTUAL_EMBEDDINGS_ENABLED environment variable
  - _Requirements: 67% reduction in retrieval failures (Anthropic benchmark)_

- [ ] 16. Implement semantic chunking for long categories
  - Identify categories with descriptions >500 tokens
  - Split into semantic chunks (preserve sentence boundaries)
  - Add 50-100 token overlap between chunks
  - Generate separate embeddings for each chunk
  - Aggregate chunk scores during retrieval (max or average)
  - _Requirements: Better handling of long category descriptions_

- [ ] 17. Optimize chunk size and overlap
  - Test chunk sizes: 256, 512, 768 tokens
  - Test overlap: 0%, 10%, 20%
  - Measure retrieval accuracy for each configuration
  - Document optimal settings (research suggests 512 tokens, 20% overlap)
  - _Target: 15% improvement for long documents_

- [x] 18. Re-embed all categories with contextual enrichment
  - Create migration script for contextual embeddings
  - Generate contextual prefix for each category
  - Re-embed all categories with new format
  - Store in new column: contextual_embedding
  - Update search function to use contextual embeddings
  - Maintain backward compatibility (fallback to original embeddings)
  - _Requirements: One-time migration, zero downtime_

### Phase 5: Evaluation and Monitoring

- [ ] 19. Implement RAG evaluation metrics
  - Create new service: api/src/services/ragEvaluator.ts
  - Implement Hit Rate@K (% of queries with ≥1 relevant result in top K)
  - Implement MRR (Mean Reciprocal Rank of first relevant result)
  - Implement NDCG@K (Normalized Discounted Cumulative Gain)
  - Implement Context Precision (relevance of retrieved chunks)
  - Implement Context Recall (coverage of relevant information)
  - _Requirements: Objective measurement of retrieval quality_

- [ ] 20. Create evaluation test set
  - Collect 50-100 real user queries from production logs
  - Manually label relevant categories for each query (ground truth)
  - Include diverse query types: short, long, technical, vague
  - Include edge cases: ambiguous, multi-focus, niche
  - Store in database table: rag_evaluation_queries
  - _Requirements: Representative test set for benchmarking_

- [ ] 21. Implement automated evaluation pipeline
  - Create script: api/scripts/evaluate-rag.ts
  - Run evaluation on test set with different configurations
  - Compare: baseline vs hybrid vs rerank vs contextual
  - Generate evaluation report with metrics
  - Track metrics over time (regression detection)
  - _Requirements: Continuous quality monitoring_

- [ ] 22. Add RAG metrics to monitoring dashboard
  - Add Prometheus metrics for retrieval quality
  - Track hit rate, MRR, NDCG in real-time
  - Track latency percentiles (p50, p95, p99)
  - Track cache hit rates for each optimization
  - Create Grafana dashboard for RAG metrics
  - Set up alerts for quality degradation
  - _Requirements: Production monitoring_

### Phase 6: Advanced Optimizations (Optional)

- [ ]* 23. Implement query classification for adaptive retrieval
  - Classify queries by type: exact match, semantic, hybrid
  - Use different retrieval strategies per type
  - Exact match → pure BM25, Semantic → pure vector, Ambiguous → hybrid
  - Improves efficiency and accuracy
  - _Requirements: Adaptive retrieval strategy_

- [ ]* 24. Implement user feedback loop
  - Track which recommendations users select
  - Store feedback in database: recommendation_feedback table
  - Use feedback to fine-tune retrieval weights
  - Implement learning-to-rank with user signals
  - _Requirements: Continuous improvement from user behavior_

- [ ]* 25. Implement cross-encoder fine-tuning
  - Collect training data from user feedback
  - Fine-tune BGE Reranker on Stevie Awards data
  - Improves domain-specific ranking accuracy
  - Reduces dependency on external APIs (Cohere)
  - _Requirements: Custom reranker for Stevie Awards domain_

- [ ]* 26. Implement query intent detection
  - Detect user intent: exploratory vs specific
  - Exploratory → broader results, more diversity
  - Specific → narrow results, high precision
  - Adjust retrieval parameters based on intent
  - _Requirements: Intent-aware retrieval_

---

## Configuration

New environment variables to add:

```bash
# Hybrid Search
HYBRID_SEARCH_ENABLED=true
HYBRID_SEARCH_ALPHA=0.7  # 70% vector, 30% keyword
BM25_K1=1.2              # BM25 term frequency saturation
BM25_B=0.75              # BM25 length normalization

# Reranking
RERANK_ENABLED=true
RERANK_MODEL=rerank-english-v3.0
RERANK_TOP_K=15          # Rerank top 50 to top 15
COHERE_API_KEY=your_key_here

# Query Expansion
HYDE_ENABLED=false       # Hypothetical Document Embeddings
MULTI_QUERY_ENABLED=false
QUERY_EXPANSION_COUNT=3  # Number of query variants

# Contextual Retrieval
CONTEXTUAL_EMBEDDINGS_ENABLED=true
CHUNK_SIZE=512           # Tokens per chunk
CHUNK_OVERLAP=0.2        # 20% overlap

# Evaluation
RAG_EVALUATION_ENABLED=true
EVALUATION_TEST_SET_SIZE=100
```

---

## Expected Results

| Metric | Baseline | After Phase 1 | After Phase 2 | After Phase 3 | After Phase 4 | Total Improvement |
|--------|----------|---------------|---------------|---------------|---------------|-------------------|
| Hit Rate@5 | 65% | 75% (+10%) | 85% (+10%) | 88% (+3%) | 92% (+4%) | +27% |
| MRR | 0.45 | 0.55 (+0.10) | 0.65 (+0.10) | 0.68 (+0.03) | 0.72 (+0.04) | +60% |
| NDCG@10 | 0.60 | 0.70 (+0.10) | 0.80 (+0.10) | 0.83 (+0.03) | 0.87 (+0.04) | +45% |
| Avg Latency | 2.5s | 3.0s (+0.5s) | 4.5s (+1.5s) | 5.0s (+0.5s) | 5.5s (+0.5s) | +3.0s |
| Cost per Query | $0.02 | $0.02 | $0.03 (+$0.01) | $0.04 (+$0.01) | $0.05 (+$0.01) | +$0.03 |

**Key Insights:**
- Phase 1 (Hybrid Search): Best ROI - 10% improvement, minimal cost
- Phase 2 (Reranking): Highest quality gain - 10% improvement, moderate cost
- Phase 3 (Query Expansion): Incremental gains - 3% improvement, low cost
- Phase 4 (Contextual Retrieval): Long-term investment - 4% improvement, one-time migration cost

---

## Testing Strategy

### Unit Tests
- Test BM25 scoring function with known queries
- Test RRF algorithm with mock results
- Test query expansion with various inputs
- Test contextual prefix generation

### Integration Tests
- Test hybrid search end-to-end
- Test reranking with Cohere API
- Test query expansion pipeline
- Test contextual retrieval with real categories

### Evaluation Tests
- Run automated evaluation on test set
- Compare metrics before/after each phase
- Validate improvement targets achieved
- Document any regressions

### A/B Tests (Production)
- Deploy with feature flags
- Run A/B test: 50% baseline, 50% optimized
- Measure user engagement (click-through rate)
- Measure user satisfaction (feedback scores)
- Gradual rollout based on results

---

## Rollout Strategy

1. **Phase 1 (Week 1-2)**: Hybrid Search
   - Low risk, high impact
   - Deploy with feature flag (HYBRID_SEARCH_ENABLED=false initially)
   - Test with 10% of traffic
   - Monitor metrics for 3 days
   - Gradual rollout to 100%

2. **Phase 2 (Week 3-4)**: Reranking
   - Medium risk, high impact
   - Deploy with feature flag (RERANK_ENABLED=false initially)
   - Test with 10% of traffic
   - Monitor costs and latency
   - Gradual rollout to 100%

3. **Phase 3 (Week 5)**: Query Expansion
   - Low risk, incremental impact
   - Deploy with feature flags (all disabled initially)
   - Test each technique independently
   - Enable best-performing technique

4. **Phase 4 (Week 6-7)**: Contextual Retrieval
   - High effort, high long-term impact
   - Run migration during off-peak hours
   - Test with 10% of traffic
   - Monitor for regressions
   - Gradual rollout to 100%

5. **Phase 5 (Week 8)**: Evaluation & Monitoring
   - Continuous monitoring
   - Weekly evaluation reports
   - Monthly optimization reviews

---

## Success Criteria

- [ ] Hit Rate@5 improves from 65% to 85%+ (target: 20% improvement)
- [ ] MRR improves from 0.45 to 0.65+ (target: 44% improvement)
- [ ] NDCG@10 improves from 0.60 to 0.80+ (target: 33% improvement)
- [ ] Average latency stays under 6 seconds
- [ ] Cost per query stays under $0.05
- [ ] No regressions in existing functionality
- [ ] All feature flags working correctly
- [ ] Monitoring dashboards operational
- [ ] Evaluation pipeline automated

---

## References

**Content rephrased for compliance with licensing restrictions**

1. **Hybrid Search**: Combining keyword-based BM25 with vector search improves accuracy by handling both exact matches and semantic similarity ([source](https://roundproxies.com/blog/rag-chatbot/))

2. **Reranking**: Two-stage retrieval with cross-encoder reranking can improve quality by 40% or more ([source](https://stackviv.ai/blog/retrieval-reranking-rag-systems))

3. **Contextual Retrieval**: Anthropic's technique of prepending context to chunks reduces retrieval failures by 67% ([source](https://www.mcloudtechnology.com/post/contextual-rag-anthropic-s-67-breakthrough-for-high-stakes-accuracy))

4. **Query Expansion**: Enhancing queries with additional contextually relevant terms bridges the gap between user intent and data representation ([source](https://medium.com/@sahin.samia/query-expansion-in-enhancing-retrieval-augmented-generation-rag-d41153317383))

5. **Semantic Chunking**: Splitting documents at semantic boundaries with overlap preserves context and improves retrieval by 15-25% ([source](https://customgpt.ai/rag-chunking-strategies/))

---

**Last Updated:** February 2026  
**Status:** Ready for Implementation  
**Estimated Effort:** 6-8 weeks (with 2 engineers)  
**Expected ROI:** 35-45% improvement in recommendation accuracy
