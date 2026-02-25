# Design Document: Synthetic Search Hooks

## Overview

The Synthetic Search Hooks feature enhances the Stevie Awards RAG system by generating multiple search perspectives for each award category. Instead of relying solely on the original category description, the system will create three specialized "hooks" that capture different angles users might search from:

1. **Industry Hook**: Captures specific industries and business sectors eligible for the award
2. **Persona Hook**: Captures user perspective with first-person intent statements
3. **Outcome Hook**: Captures specific metrics, KPIs, and success stories

Each hook is embedded separately and stored in the vector database with metadata tags. During search, the RAG system retrieves matches from both original descriptions and synthetic hooks, improving recall while reducing false positives through accurate Subject Type filtering.

### Key Design Principles

- **Preserve existing functionality**: Original category embeddings remain unchanged
- **Leverage existing services**: Use embeddingManager, openaiService, and openaiRequestQueue
- **Metadata-driven filtering**: Subject Type accuracy is critical for preventing false positives
- **Batch processing support**: Handle all existing categories efficiently with rate limiting
- **Testable improvements**: Measure false positive reduction with quantitative metrics

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Hook Generation Flow                      │
└─────────────────────────────────────────────────────────────┘

┌──────────────────┐
│  Category Data   │
│  (Supabase)      │
└────────┬─────────┘
         │
         v
┌──────────────────┐      ┌─────────────────────┐
│  Hook Generator  │─────>│  OpenAI Service     │
│  (TypeScript)    │      │  (LLM Generation)   │
└────────┬─────────┘      └─────────────────────┘
         │
         v
┌──────────────────┐      ┌─────────────────────┐
│  Hook Formatter  │─────>│  Embedding Manager  │
│  (Add Prefixes)  │      │  (Create Vectors)   │
└────────┬─────────┘      └─────────────────────┘
         │
         v
┌──────────────────┐
│  Vector Database │
│  (Pinecone)      │
└──────────────────┘


┌─────────────────────────────────────────────────────────────┐
│                    Search Retrieval Flow                     │
└─────────────────────────────────────────────────────────────┘

┌──────────────────┐
│  User Query      │
└────────┬─────────┘
         │
         v
┌──────────────────┐      ┌─────────────────────┐
│  Embedding       │─────>│  Vector Database    │
│  Manager         │      │  (Search)           │
└──────────────────┘      └────────┬────────────┘
                                   │
                                   v
                          ┌─────────────────────┐
                          │  Results Combiner   │
                          │  (Hooks + Original) │
                          └────────┬────────────┘
                                   │
                                   v
                          ┌─────────────────────┐
                          │  Metadata Filter    │
                          │  (Subject Type)     │
                          └────────┬────────────┘
                                   │
                                   v
                          ┌─────────────────────┐
                          │  Ranked Results     │
                          └─────────────────────┘
```

### Data Flow

1. **Hook Generation Phase** (Batch Processing):
   - Fetch all active categories from Supabase
   - For each category, generate 3 hooks using OpenAI (via openaiRequestQueue)
   - Format each hook with appropriate prefix (Program | Type | Focus)
   - Generate embeddings for each hook using embeddingManager
   - Store hooks in category_embeddings table with metadata tags

2. **Search Phase** (Real-time):
   - User submits query through existing RAG pipeline
   - Generate query embedding using embeddingManager
   - Search vector database (returns both original and hook embeddings)
   - Filter results by Subject Type metadata
   - Combine and rank results
   - Return top N recommendations

## Components and Interfaces

### 1. Hook Generator Service

**File**: `api/src/services/hookGenerator.ts`

**Purpose**: Generate synthetic search hooks using LLM based on category data.

**Interface**:

```typescript
interface CategoryData {
  category_id: string;
  category_name: string;
  description: string;
  program_name: string;
  program_code: string;
  metadata: {
    nomination_subject_type: 'Individual' | 'Team' | 'Organization';
    applicable_org_types?: string[];
    achievement_focus?: string[];
    geographic_scope?: string[];
  };
}

interface SearchHook {
  hook_type: 'industry' | 'persona' | 'outcome';
  content: string;
  prefix: string;
  full_text: string; // prefix + content
}

interface GeneratedHooks {
  category_id: string;
  industry_hook: SearchHook;
  persona_hook: SearchHook;
  outcome_hook: SearchHook;
}

class HookGenerator {
  constructor(
    private openaiService: OpenAIService,
    private openaiQueue: OpenAIRequestQueue
  );

  /**
   * Generate all three hooks for a category
   */
  async generateHooks(category: CategoryData): Promise<GeneratedHooks>;

  /**
   * Generate industry-focused hook (10-15 sector keywords)
   */
  private async generateIndustryHook(category: CategoryData): Promise<string>;

  /**
   * Generate persona-based hook (3-5 first-person sentences)
   */
  private async generatePersonaHook(category: CategoryData): Promise<string>;

  /**
   * Generate outcome-focused hook (KPIs and metrics)
   */
  private async generateOutcomeHook(category: CategoryData): Promise<string>;

  /**
   * Format hook with appropriate prefix
   */
  private formatHookWithPrefix(
    content: string,
    hookType: 'industry' | 'persona' | 'outcome',
    programName: string,
    subjectType: string
  ): SearchHook;

  /**
   * Validate Subject Type is one of: Individual, Team, Organization
   */
  private validateSubjectType(subjectType: string): boolean;
}
```

**LLM Prompts**:

```typescript
// Industry Hook Prompt
const INDUSTRY_HOOK_PROMPT = `Given this award category, generate 10-15 specific industry or business sector keywords that would be eligible for this award.

Category: {category_name}
Description: {description}
Focus Areas: {achievement_focus}

Output ONLY a comma-separated list of specific sectors (e.g., "Banking, Fintech, Healthcare, Manufacturing, Retail, NGO, Education, Government").
Do not include explanations or formatting.`;

// Persona Hook Prompt
const PERSONA_HOOK_PROMPT = `Given this award category, write 3-5 first-person sentences from the perspective of someone who would nominate themselves or their team for this award.

Category: {category_name}
Description: {description}
Subject Type: {subject_type}
Focus Areas: {achievement_focus}

Write from the nominee's perspective using "I" or "we". Include their likely job title and what they're looking for.
Example: "I am a CMO looking for recognition of our rebranding campaign. We transformed our company's market position through innovative marketing strategies."

Output ONLY the first-person sentences, no labels or formatting.`;

// Outcome Hook Prompt
const OUTCOME_HOOK_PROMPT = `Given this award category, generate 5-7 specific achievement examples with metrics that would qualify for this award.

Category: {category_name}
Description: {description}
Focus Areas: {achievement_focus}

Include concrete metrics and outcomes (e.g., "Increased revenue by 20%", "Launched new AI product serving 10,000 users", "Reduced costs by $500K").
Output ONLY the achievement examples, one per line, no labels or formatting.`;
```

### 2. Hook Storage Service

**File**: `api/src/services/hookStorage.ts`

**Purpose**: Store generated hooks in the vector database with proper metadata.

**Interface**:

```typescript
interface HookEmbedding {
  category_id: string;
  hook_type: 'industry' | 'persona' | 'outcome';
  embedding: number[];
  embedding_text: string;
  contextual_prefix: string;
  metadata: {
    program_name: string;
    program_code: string;
    subject_type: 'Individual' | 'Team' | 'Organization';
    hook_type: 'industry' | 'persona' | 'outcome';
    is_synthetic_hook: boolean;
  };
}

class HookStorage {
  constructor(
    private embeddingManager: EmbeddingManager,
    private supabaseClient: SupabaseClient
  );

  /**
   * Store all hooks for a category
   */
  async storeHooks(
    categoryId: string,
    hooks: GeneratedHooks,
    categoryMetadata: CategoryData['metadata']
  ): Promise<void>;

  /**
   * Store a single hook embedding
   */
  private async storeHookEmbedding(
    hookEmbedding: HookEmbedding
  ): Promise<void>;

  /**
   * Delete all synthetic hooks for a category (rollback support)
   */
  async deleteHooksForCategory(categoryId: string): Promise<void>;

  /**
   * Check if hooks already exist for a category
   */
  async hooksExist(categoryId: string): Promise<boolean>;
}
```

**Database Schema Extension**:

The existing `category_embeddings` table will be used with additional metadata:

```sql
-- Existing table structure (no changes needed)
CREATE TABLE category_embeddings (
  id UUID PRIMARY KEY,
  category_id UUID REFERENCES stevie_categories(id),
  embedding vector(1536),
  embedding_text TEXT,
  contextual_prefix TEXT,
  metadata JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Metadata structure for hooks:
{
  "program_name": "Stevie Awards for Technology Excellence",
  "program_code": "TECH",
  "subject_type": "Organization",
  "hook_type": "industry",  // or "persona" or "outcome"
  "is_synthetic_hook": true
}

-- Metadata structure for original embeddings:
{
  "program_name": "Stevie Awards for Technology Excellence",
  "program_code": "TECH",
  "subject_type": "Organization",
  "is_synthetic_hook": false
}
```

### 3. Batch Processing Script

**File**: `api/scripts/generate-search-hooks.ts`

**Purpose**: Process all categories and generate hooks in batch with rate limiting.

**Interface**:

```typescript
interface BatchProcessingOptions {
  batchSize: number;        // Number of categories to process in parallel
  skipExisting: boolean;    // Skip categories that already have hooks
  dryRun: boolean;          // Generate but don't store (for testing)
  categoryIds?: string[];   // Process specific categories only
}

interface BatchProcessingResult {
  total_categories: number;
  successful: number;
  failed: number;
  skipped: number;
  errors: Array<{
    category_id: string;
    category_name: string;
    error: string;
  }>;
}

async function generateSearchHooks(
  options: BatchProcessingOptions
): Promise<BatchProcessingResult>;

async function processCategoryBatch(
  categories: CategoryData[],
  hookGenerator: HookGenerator,
  hookStorage: HookStorage
): Promise<void>;
```

**Processing Flow**:

1. Fetch all active categories from Supabase
2. Filter out categories that already have hooks (if skipExisting=true)
3. Process in batches using openaiRequestQueue for rate limiting
4. For each category:
   - Validate Subject Type
   - Generate 3 hooks using HookGenerator
   - Create embeddings using EmbeddingManager
   - Store in database using HookStorage
   - Log progress and errors
5. Generate summary report

### 4. Enhanced Search Integration

**File**: `api/src/services/embeddingManager.ts` (modifications)

**Purpose**: Integrate hook retrieval into existing search flow.

**Changes**:

```typescript
// Add to EmbeddingManager class

/**
 * Perform similarity search including synthetic hooks
 * Returns combined results from original embeddings and hooks
 */
async performSimilaritySearchWithHooks(
  userEmbedding: number[],
  userGeographies?: string[],
  userNominationSubject?: string,
  limit: number = 10,
  userOrgType?: string,
  userAchievementFocus?: string[],
  userGender?: string
): Promise<SimilarityResult[]> {
  // Use existing search function (already searches all embeddings)
  const results = await this.performSimilaritySearch(
    userEmbedding,
    userGeographies,
    userNominationSubject,
    limit * 2, // Get more candidates since we have multiple embeddings per category
    userOrgType,
    userAchievementFocus,
    userGender
  );

  // Deduplicate by category_id (keep highest score)
  const deduped = this.deduplicateByCategory(results);

  // Return top N
  return deduped.slice(0, limit);
}

/**
 * Deduplicate results by category_id, keeping highest score
 */
private deduplicateByCategory(
  results: SimilarityResult[]
): SimilarityResult[] {
  const categoryMap = new Map<string, SimilarityResult>();

  for (const result of results) {
    const existing = categoryMap.get(result.category_id);
    if (!existing || result.similarity_score > existing.similarity_score) {
      categoryMap.set(result.category_id, result);
    }
  }

  return Array.from(categoryMap.values())
    .sort((a, b) => b.similarity_score - a.similarity_score);
}
```

## Data Models

### Hook Generation Models

```typescript
// Input: Category data from database
interface CategoryData {
  category_id: string;
  category_name: string;
  description: string;
  program_name: string;
  program_code: string;
  metadata: {
    nomination_subject_type: 'Individual' | 'Team' | 'Organization';
    applicable_org_types?: string[];
    achievement_focus?: string[];
    geographic_scope?: string[];
  };
}

// Output: Generated hooks
interface SearchHook {
  hook_type: 'industry' | 'persona' | 'outcome';
  content: string;           // Raw generated content
  prefix: string;            // "Program: X | Type: Y | Focus: Z"
  full_text: string;         // prefix + content (what gets embedded)
}

interface GeneratedHooks {
  category_id: string;
  industry_hook: SearchHook;
  persona_hook: SearchHook;
  outcome_hook: SearchHook;
}

// Storage: Hook embedding record
interface HookEmbedding {
  id: string;                // UUID
  category_id: string;       // Foreign key to stevie_categories
  embedding: number[];       // 1536-dimensional vector
  embedding_text: string;    // Full text that was embedded
  contextual_prefix: string; // The prefix part (for metadata extraction)
  metadata: {
    program_name: string;
    program_code: string;
    subject_type: 'Individual' | 'Team' | 'Organization';
    hook_type: 'industry' | 'persona' | 'outcome';
    is_synthetic_hook: boolean;
  };
  created_at: Date;
  updated_at: Date;
}
```

### Search Result Models

```typescript
// Enhanced similarity result (existing interface)
interface SimilarityResult {
  category_id: string;
  similarity_score: number;
  category_name: string;
  description: string;
  program_name: string;
  program_code: string;
  geographic_scope: string[];
  applicable_org_types: string[];
  applicable_org_sizes: string[];
  nomination_subject_type: string;
  achievement_focus: string[];
  metadata?: {
    nomination_subject_type: string;
    applicable_org_types: string[];
    applicable_org_sizes: string[];
    achievement_focus: string[];
    geographic_scope: string[];
    is_free: boolean;
    gender_requirement?: string;
    // New fields for hook tracking
    matched_hook_type?: 'industry' | 'persona' | 'outcome' | 'original';
    is_synthetic_hook?: boolean;
  };
}
```

## Error Handling

### Error Categories

1. **LLM Generation Errors**:
   - OpenAI API failures (rate limits, timeouts, service errors)
   - Invalid or empty responses from LLM
   - Malformed JSON or unexpected output format

2. **Validation Errors**:
   - Missing or invalid Subject Type
   - Insufficient category data for hook generation
   - Empty or malformed hook content

3. **Database Errors**:
   - Embedding storage failures
   - Transaction rollback failures
   - Connection timeouts

4. **Rate Limiting Errors**:
   - OpenAI rate limit exceeded
   - Queue overflow

### Error Handling Strategies

```typescript
class HookGenerationError extends Error {
  constructor(
    message: string,
    public categoryId: string,
    public categoryName: string,
    public hookType?: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'HookGenerationError';
  }
}

// Retry logic for transient failures
async function generateHookWithRetry(
  generator: () => Promise<string>,
  maxRetries: number = 3
): Promise<string> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await generator();
      if (result && result.trim().length > 0) {
        return result;
      }
      throw new Error('Empty hook content generated');
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on validation errors
      if (error instanceof HookGenerationError) {
        throw error;
      }

      // Exponential backoff for transient errors
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn('hook_generation_retry', {
          attempt,
          maxRetries,
          delayMs: delay,
          error: error.message
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

// Transaction-based storage with rollback
async function storeHooksWithTransaction(
  categoryId: string,
  hooks: GeneratedHooks,
  storage: HookStorage
): Promise<void> {
  const storedHooks: string[] = [];

  try {
    // Store each hook
    for (const hookType of ['industry', 'persona', 'outcome'] as const) {
      await storage.storeHookEmbedding({
        category_id: categoryId,
        hook_type: hookType,
        ...hooks[`${hookType}_hook`]
      });
      storedHooks.push(hookType);
    }

    logger.info('hooks_stored_successfully', {
      category_id: categoryId,
      hooks_stored: storedHooks
    });
  } catch (error: any) {
    // Rollback: delete any hooks that were stored
    logger.error('hook_storage_failed_rolling_back', {
      category_id: categoryId,
      hooks_stored: storedHooks,
      error: error.message
    });

    try {
      await storage.deleteHooksForCategory(categoryId);
    } catch (rollbackError: any) {
      logger.error('rollback_failed', {
        category_id: categoryId,
        error: rollbackError.message
      });
    }

    throw error;
  }
}
```

### Logging Strategy

```typescript
// Log levels for different scenarios
logger.info('hook_generation_started', {
  category_id,
  category_name,
  subject_type
});

logger.info('hook_generated', {
  category_id,
  hook_type,
  content_length,
  generation_time_ms
});

logger.warn('hook_generation_skipped', {
  category_id,
  reason: 'invalid_subject_type',
  subject_type
});

logger.error('hook_generation_failed', {
  category_id,
  category_name,
  hook_type,
  error: error.message,
  stack: error.stack
});

logger.info('batch_processing_complete', {
  total_categories,
  successful,
  failed,
  skipped,
  duration_seconds
});
```

## Testing Strategy

### Dual Testing Approach

The testing strategy combines unit tests for specific examples and edge cases with property-based tests for universal correctness properties. Both are necessary for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs using randomized testing

Unit tests should focus on concrete scenarios and integration points, while property tests validate general correctness across many inputs. Together they provide complementary coverage.

### Property-Based Testing Configuration

- Use **fast-check** library for TypeScript property-based testing
- Configure each property test to run minimum **100 iterations**
- Tag each test with a comment referencing the design property:
  ```typescript
  // Feature: synthetic-search-hooks, Property 1: Hook prefix format consistency
  ```
- Each correctness property must be implemented by a single property-based test

### Unit Testing Focus

Unit tests should cover:
- Specific examples demonstrating correct behavior
- Integration between HookGenerator, HookStorage, and EmbeddingManager
- Edge cases: empty descriptions, missing metadata, invalid Subject Types
- Error conditions: API failures, database errors, validation failures

Avoid writing too many unit tests for scenarios that property-based tests already cover through randomization.

### Test Categories

1. **Hook Generation Tests**:
   - Verify LLM prompts produce expected format
   - Test prefix formatting with various inputs
   - Validate Subject Type extraction and validation
   - Test error handling for malformed category data

2. **Hook Storage Tests**:
   - Verify embeddings are created correctly
   - Test metadata structure matches specification
   - Validate rollback on partial failures
   - Test deduplication logic

3. **Integration Tests**:
   - End-to-end: category → hooks → embeddings → storage
   - Search integration: verify hooks are retrieved
   - Deduplication: verify highest score is kept per category

4. **False Positive Reduction Tests**:
   - Create labeled test dataset with known false positives
   - Measure precision/recall before and after hooks
   - Validate Subject Type filtering effectiveness
   - Compare search results with and without hooks

### Test Data

```typescript
// Test dataset structure
interface TestCase {
  query: string;
  user_context: {
    description: string;
    achievement_focus: string[];
    nomination_subject: 'Individual' | 'Team' | 'Organization';
  };
  expected_categories: string[];  // Category IDs that should match
  false_positive_categories: string[];  // Category IDs that should NOT match
}

const testCases: TestCase[] = [
  {
    query: "Healthcare innovation for blind patients",
    user_context: {
      description: "Developed cataract surgery technique helping blind patients",
      achievement_focus: ["Healthcare", "Medical Innovation"],
      nomination_subject: "Individual"
    },
    expected_categories: ["healthcare-innovation-individual"],
    false_positive_categories: ["marketing-campaign-team", "tech-product-org"]
  },
  // ... more test cases
];
```

### Metrics to Track

```typescript
interface TestMetrics {
  precision: number;        // TP / (TP + FP)
  recall: number;           // TP / (TP + FN)
  f1_score: number;         // 2 * (precision * recall) / (precision + recall)
  false_positive_rate: number;  // FP / (FP + TN)
  mean_reciprocal_rank: number; // Average of 1/rank for first correct result
}

// Compare metrics before and after hooks
interface ComparisonReport {
  without_hooks: TestMetrics;
  with_hooks: TestMetrics;
  improvement: {
    precision_delta: number;
    recall_delta: number;
    false_positive_reduction: number;  // Percentage reduction
  };
}
```


## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property Reflection

After analyzing all acceptance criteria, I identified several areas of redundancy:

1. **Subject Type Accuracy** (1.4, 2.4, 3.4): These three criteria all state the same requirement for different hook types. They can be combined into a single property that applies to all hooks.

2. **Prefix Format Consistency** (1.2, 2.3, 3.3): These three criteria specify the same pattern for different hook types. They can be combined into a single property with the hook type as a parameter.

3. **Metadata Completeness** (5.3, 5.4): These can be combined into a single property about complete metadata structure.

4. **Hook Storage Atomicity** (9.3, 9.5): Both deal with transaction consistency and can be combined into a single atomicity property.

5. **Data Preservation** (10.2, 10.3, 10.4, 10.5): These all relate to preserving original embeddings and can be combined into comprehensive preservation properties.

### Core Properties

**Property 1: Hook Prefix Format Consistency**

*For any* category and hook type (industry, persona, or outcome), the generated hook prefix SHALL match the pattern "Program: [Program Name] | Type: [Subject Type] | Focus: [Focus Label]" where Focus Label is "Industry Match" for industry hooks, "User Persona" for persona hooks, and "Success Metrics" for outcome hooks.

**Validates: Requirements 1.2, 2.3, 3.3**

**Property 2: Subject Type Accuracy Across All Hooks**

*For any* category with a valid subject type (Individual, Team, or Organization), all three generated hooks (industry, persona, outcome) SHALL contain the identical subject type value in their prefixes.

**Validates: Requirements 1.4, 2.4, 3.4, 4.3**

**Property 3: Subject Type Validation**

*For any* category metadata, if the subject type is not one of "Individual", "Team", or "Organization", the Hook_Generator SHALL reject the category and not generate hooks.

**Validates: Requirements 4.1, 4.2**

**Property 4: Industry Hook Structure**

*For any* generated industry hook, the content SHALL contain between 10 and 15 comma-separated keywords.

**Validates: Requirements 1.1**

**Property 5: Persona Hook Structure**

*For any* generated persona hook, the content SHALL contain between 3 and 5 sentences and SHALL include at least one first-person pronoun ("I", "we", "my", "our").

**Validates: Requirements 2.1, 2.2**

**Property 6: Outcome Hook Metrics Presence**

*For any* generated outcome hook, the content SHALL contain at least one numeric value or percentage, indicating the presence of quantifiable metrics.

**Validates: Requirements 3.1, 3.2**

**Property 7: Hook Storage Round Trip**

*For any* generated hook with its prefix, storing it in the database and then retrieving it SHALL return the identical prefix format and content.

**Validates: Requirements 1.5**

**Property 8: Embedding Generation for All Hooks**

*For any* valid hook text (non-empty, properly formatted), the RAG_System SHALL successfully generate a 1536-dimensional embedding vector.

**Validates: Requirements 5.1**

**Property 9: Three Separate Embeddings Per Category**

*For any* category that successfully completes hook generation, exactly three new embedding records SHALL be created in the database (one for each hook type: industry, persona, outcome).

**Validates: Requirements 5.2**

**Property 10: Complete Metadata Structure**

*For any* stored hook embedding, the metadata SHALL contain all required fields: program_name, program_code, subject_type, hook_type, category_id, and is_synthetic_hook=true.

**Validates: Requirements 5.3, 4.4**

**Property 11: Original Embedding Preservation**

*For any* category that has hooks generated, the original category embedding SHALL remain in the database unchanged (same embedding vector, same metadata with is_synthetic_hook=false).

**Validates: Requirements 5.4, 10.2**

**Property 12: Combined Search Results**

*For any* search query, the results MAY include matches from both hook embeddings (is_synthetic_hook=true) and original embeddings (is_synthetic_hook=false).

**Validates: Requirements 5.5, 6.4**

**Property 13: Subject Type Filtering in Search**

*For any* search query with a specified subject type filter, all returned results SHALL have metadata.subject_type matching the filter value.

**Validates: Requirements 4.5**

**Property 14: Batch Processing Resilience**

*For any* batch of categories where one category fails hook generation, all other categories in the batch SHALL still be processed and have their hooks generated.

**Validates: Requirements 7.4**

**Property 15: Retry on Transient Failures**

*For any* OpenAI API call that fails with a retryable error (rate limit, timeout, 5xx), the Hook_Generator SHALL retry up to 3 times before failing permanently.

**Validates: Requirements 9.1**

**Property 16: Skip Categories with Insufficient Data**

*For any* category with missing or empty description, the Hook_Generator SHALL skip hook generation and log a warning without throwing an error.

**Validates: Requirements 9.2**

**Property 17: Hook Generation Atomicity**

*For any* category, if any of the three hooks (industry, persona, outcome) fails to generate or store, then zero hooks SHALL be stored for that category (all-or-nothing).

**Validates: Requirements 9.3, 9.5**

**Property 18: Non-Empty Hook Validation**

*For any* hook generated by the LLM, if the content is empty or contains only whitespace, the Hook_Generator SHALL reject it and retry generation.

**Validates: Requirements 9.4**

**Property 19: Hook Embedding Distinguishability**

*For any* category with both original and hook embeddings, querying the database with metadata filter is_synthetic_hook=true SHALL return only hook embeddings, and is_synthetic_hook=false SHALL return only the original embedding.

**Validates: Requirements 10.3, 10.4**

**Property 20: Selective Hook Deletion**

*For any* category with both original and hook embeddings, deleting all records where is_synthetic_hook=true SHALL remove only the hooks while preserving the original embedding.

**Validates: Requirements 10.5**

