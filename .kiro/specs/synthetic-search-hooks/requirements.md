# Requirements Document: Synthetic Search Hooks

## Introduction

The Synthetic Search Hooks feature enhances the Stevie Awards RAG (Retrieval Augmented Generation) system by generating multiple search perspectives for each award category. This addresses the current problem of false positives where users receive recommendations for irrelevant award categories. By creating specialized "hooks" that capture different search angles (industry focus, user persona, and success metrics), the system improves retrieval accuracy and reduces mismatches between user queries and award categories.

## Glossary

- **RAG_System**: The Retrieval Augmented Generation system that recommends award categories to users based on semantic similarity
- **Search_Hook**: A synthetic text document generated for an award category that captures a specific search perspective (industry, persona, or outcome)
- **Category_Embedding**: A vector representation of an award category stored in the vector database for similarity search
- **Hook_Generator**: The LLM-based service that generates synthetic search hooks from category data
- **Vector_Database**: Pinecone database storing embeddings with metadata for semantic search
- **Subject_Type**: The classification of who/what is being nominated (Individual, Team, or Organization)
- **False_Positive**: An irrelevant award category recommendation that doesn't match the user's actual intent
- **Metadata_Tag**: Structured data attached to embeddings for filtering (program name, subject type, hook type)
- **Original_Description**: The existing award category description that must be preserved alongside hooks

## Requirements

### Requirement 1: Generate Industry-Focused Search Hooks

**User Story:** As a user searching for awards, I want the system to match my industry or business sector, so that I receive relevant category recommendations for my specific field.

#### Acceptance Criteria

1. WHEN the Hook_Generator processes a category, THE Hook_Generator SHALL generate an industry_hook containing 10-15 specific sector keywords
2. THE Hook_Generator SHALL format the industry_hook with prefix "Program: [Program Name] | Type: [Subject Type] | Focus: Industry Match"
3. THE Hook_Generator SHALL include diverse industry terms such as "Banking, Fintech, Healthcare, Manufacturing, Retail, NGO"
4. THE Hook_Generator SHALL ensure the Subject_Type field in the prefix accurately reflects whether the award is for Individual, Team, or Organization
5. WHEN storing the industry_hook, THE RAG_System SHALL preserve the prefix format for metadata extraction

### Requirement 2: Generate Persona-Based Search Hooks

**User Story:** As a user with a specific job role, I want the system to understand my perspective and intent, so that I find awards relevant to my position and goals.

#### Acceptance Criteria

1. WHEN the Hook_Generator processes a category, THE Hook_Generator SHALL generate a persona_hook containing 3-5 first-person sentences
2. THE Hook_Generator SHALL write persona_hook content from the nominee's perspective (e.g., "I am a CMO looking for a branding award")
3. THE Hook_Generator SHALL format the persona_hook with prefix "Program: [Program Name] | Type: [Subject Type] | Focus: User Persona"
4. THE Hook_Generator SHALL ensure the Subject_Type field accurately reflects the award's target (Individual, Team, or Organization)
5. THE Hook_Generator SHALL include job titles, roles, and intent phrases relevant to the category

### Requirement 3: Generate Outcome-Focused Search Hooks

**User Story:** As a user describing my achievements, I want the system to match specific metrics and results, so that I find awards aligned with my success stories.

#### Acceptance Criteria

1. WHEN the Hook_Generator processes a category, THE Hook_Generator SHALL generate an outcome_hook containing relevant KPIs and achievements
2. THE Hook_Generator SHALL include specific metrics such as "Increased revenue by 20%" or "Launched new AI product"
3. THE Hook_Generator SHALL format the outcome_hook with prefix "Program: [Program Name] | Type: [Subject Type] | Focus: Success Metrics"
4. THE Hook_Generator SHALL ensure the Subject_Type field accurately reflects the award's target (Individual, Team, or Organization)
5. THE Hook_Generator SHALL generate outcome examples that align with the category's focus areas

### Requirement 4: Maintain Subject Type Accuracy

**User Story:** As a system administrator, I want the Subject Type field to be strictly accurate in all hooks, so that false positives are minimized through proper filtering.

#### Acceptance Criteria

1. WHEN extracting Subject_Type from category metadata, THE Hook_Generator SHALL validate it matches one of: "Individual", "Team", or "Organization"
2. WHEN the Subject_Type is ambiguous or missing, THE Hook_Generator SHALL log an error and skip hook generation for that category
3. THE Hook_Generator SHALL apply the same Subject_Type value to all three hooks (industry, persona, outcome) for a given category
4. WHEN storing hooks in the Vector_Database, THE RAG_System SHALL include Subject_Type as a metadata tag for filtering
5. THE RAG_System SHALL use Subject_Type metadata to filter search results before returning recommendations

### Requirement 5: Store Hooks in Vector Database

**User Story:** As a developer, I want hooks stored with proper metadata in the vector database, so that the RAG system can retrieve them effectively during search.

#### Acceptance Criteria

1. WHEN a hook is generated, THE RAG_System SHALL create an embedding using the OpenAI embedding model
2. THE RAG_System SHALL store each hook as a separate vector in the Vector_Database
3. WHEN storing a hook, THE RAG_System SHALL attach metadata including program_name, subject_type, hook_type, and category_id
4. THE RAG_System SHALL preserve the Original_Description embedding alongside the three new hook embeddings
5. WHEN querying the Vector_Database, THE RAG_System SHALL return both hook matches and original description matches

### Requirement 6: Integrate with Existing RAG Pipeline

**User Story:** As a system architect, I want hooks integrated seamlessly with the existing retrieval pipeline, so that the system continues to function without breaking changes.

#### Acceptance Criteria

1. THE RAG_System SHALL use the existing embeddingManager service to generate hook embeddings
2. THE RAG_System SHALL use the existing openaiService for LLM-based hook generation
3. THE RAG_System SHALL use the existing openaiRequestQueue for rate-limited API calls
4. WHEN retrieving categories, THE RAG_System SHALL combine results from hook embeddings and original embeddings
5. THE RAG_System SHALL maintain backward compatibility with existing category search functionality

### Requirement 7: Batch Process Existing Categories

**User Story:** As a system administrator, I want to generate hooks for all existing categories in batch, so that the entire catalog benefits from improved search accuracy.

#### Acceptance Criteria

1. THE Hook_Generator SHALL provide a batch processing script that iterates through all active categories
2. WHEN processing in batch mode, THE Hook_Generator SHALL handle rate limits using the openaiRequestQueue
3. THE Hook_Generator SHALL log progress including categories processed, hooks generated, and any errors
4. WHEN a category fails hook generation, THE Hook_Generator SHALL continue processing remaining categories
5. THE Hook_Generator SHALL provide a summary report showing total categories processed and success rate

### Requirement 8: Create Testing Framework

**User Story:** As a quality assurance engineer, I want to measure false positive reduction, so that I can validate the effectiveness of synthetic search hooks.

#### Acceptance Criteria

1. THE RAG_System SHALL provide a test suite that compares search results with and without hooks
2. THE test suite SHALL measure false positive rate using a labeled test dataset
3. THE test suite SHALL calculate precision and recall metrics for category recommendations
4. WHEN running tests, THE RAG_System SHALL log detailed results including query, expected categories, and actual matches
5. THE test suite SHALL generate a comparison report showing improvement percentage in false positive reduction

### Requirement 9: Handle Hook Generation Errors

**User Story:** As a developer, I want robust error handling during hook generation, so that failures don't corrupt the database or halt processing.

#### Acceptance Criteria

1. WHEN the OpenAI API fails, THE Hook_Generator SHALL retry up to 3 times with exponential backoff
2. WHEN a category has insufficient data for hook generation, THE Hook_Generator SHALL log a warning and skip that category
3. WHEN embedding generation fails, THE Hook_Generator SHALL not store partial hooks for that category
4. THE Hook_Generator SHALL validate generated hook text is non-empty before creating embeddings
5. WHEN database writes fail, THE Hook_Generator SHALL rollback all hooks for that category to maintain consistency

### Requirement 10: Preserve Original Category Data

**User Story:** As a system administrator, I want original category descriptions preserved, so that existing functionality remains intact while hooks provide additional search angles.

#### Acceptance Criteria

1. THE RAG_System SHALL maintain the existing category_embeddings table structure
2. WHEN adding hooks, THE RAG_System SHALL not modify or delete Original_Description embeddings
3. THE RAG_System SHALL store hooks as additional rows in the category_embeddings table with distinct metadata
4. WHEN querying categories, THE RAG_System SHALL be able to distinguish between original embeddings and hook embeddings using metadata
5. THE RAG_System SHALL support rollback by deleting only hook embeddings while preserving original embeddings
