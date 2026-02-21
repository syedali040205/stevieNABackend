
# Intent Classification Best Practices for AI Chatbots

## Overview

This document provides research-backed best practices for implementing and optimizing intent classification in conversational AI systems. Based on 2024-2026 research and industry standards, these practices are specifically tailored for the Stevie Awards Nomination Assistant chatbot.

**Current System Analysis:**
- Binary classification: `recommendation` vs `qa` modes
- LLM-based classification using GPT-4o-mini
- Keyword fallback for obvious nomination requests
- Zero-shot classification (no training examples)
- Fixed confidence threshold (no tuning)
- No multi-turn context awareness

**Target Improvements:**
- 5-10% improvement in classification accuracy
- Better handling of ambiguous queries
- Context-aware multi-turn classification
- Confidence calibration and threshold tuning
- Reduced latency through hybrid approach
- Out-of-scope detection

---

## Research-Backed Best Practices

### 1. Hybrid Classification Architecture

**Problem:** Pure LLM classification is slow (2-3s) and expensive ($0.001 per request). Pure keyword matching is fast but brittle.

**Solution:** Two-stage hybrid approach combining speed and accuracy.

**Content rephrased for compliance with licensing restrictions**

Research shows that combining fast keyword-based filtering with LLM classification provides optimal balance of speed and accuracy ([source](https://www.voiceflow.com/pathways/benchmarking-hybrid-llm-classification-systems)).

```typescript
class HybridIntentClassifier {
  // Stage 1: Fast keyword/pattern matching (< 1ms)
  async quickClassify(message: string): Promise<{
    intent: string | null;
    confidence: number;
  }> {
    const patterns = {
      recommendation: [
        /\b(nominate|nomination|find categor|recommend categor)\b/i,
        /\b(which award|what award|help me find)\b/i,
        /\b(want to nominate|would like to nominate)\b/i,
      ],
      qa: [
        /\b(what is|when is|how much|where is)\b.*\b(deadline|fee|cost|eligibility)\b/i,
        /\b(tell me about|explain|how does)\b.*\b(judging|process|program)\b/i,
      ],
    };
    
    // Check patterns
    for (const [intent, regexList] of Object.entries(patterns)) {
      for (const regex of regexList) {
        if (regex.test(message)) {
          return { intent, confidence: 0.85 };
        }
      }
    }
    
    return { intent: null, confidence: 0.0 };
  }
  
  // Stage 2: LLM classification for ambiguous cases
  async deepClassify(message: string, context: any): Promise<{
    intent: string;
    confidence: number;
  }> {
    // Only called when Stage 1 returns null or low confidence
    return await this.llmClassify(message, context);
  }
  
  // Combined pipeline
  async classify(message: string, context: any): Promise<{
    intent: string;
    confidence: number;
  }> {
    // Try fast path first
    const quick = await this.quickClassify(message);
    if (quick.intent && quick.confidence > 0.8) {
      return { intent: quick.intent, confidence: quick.confidence };
    }
    
    // Fall back to LLM for ambiguous cases
    return await this.deepClassify(message, context);
  }
}
```

**Benefits:**
- 80% of requests handled by fast path (< 1ms)
- 20% of ambiguous requests use LLM (2-3s)
- Average latency: 0.4s (vs 2.5s pure LLM)
- Cost reduction: 80% fewer LLM calls

---

### 2. Few-Shot Learning with Examples

**Problem:** Zero-shot classification struggles with domain-specific terminology and edge cases.

**Solution:** Include 3-5 representative examples in the prompt to guide the model.

Research demonstrates that few-shot prompting can rival full fine-tuning while maintaining flexibility ([source](https://www.emergentmind.com/topics/few-shot-prompt-engineering)).

```typescript
const FEW_SHOT_EXAMPLES = `
## Examples

Example 1:
User: "I want to nominate my team for an innovation award"
Context: recommendation
Confidence: 0.95
Reasoning: Clear nomination intent

Example 2:
User: "What's the deadline for the Technology Excellence program?"
Context: qa
Confidence: 0.90
Reasoning: Factual question about deadline

Example 3:
User: "We developed an AI product that won first place at a hackathon"
Context: recommendation
Confidence: 0.85
Reasoning: Describing achievement for nomination (implicit intent)

Example 4:
User: "How much does it cost to enter?"
Context: qa
Confidence: 0.90
Reasoning: Factual question about fees

Example 5:
User: "I'm not sure which category fits my product"
Context: recommendation
Confidence: 0.80
Reasoning: Seeking category recommendations
`;

const SYSTEM_PROMPT = `You are a context classifier for a Stevie Awards chatbot.

${FEW_SHOT_EXAMPLES}

Now classify the user's message...`;
```

**Best Practices:**
- Use 3-5 examples (more doesn't always help)
- Include edge cases and ambiguous queries
- Show both positive and negative examples
- Update examples based on production errors
- Use diverse phrasing to avoid overfitting

**Expected Impact:** 5-10% improvement in classification accuracy

---

### 3. Multi-Turn Context Awareness

**Problem:** Single-turn classification ignores conversation history, leading to errors when user intent evolves.

**Solution:** Incorporate conversation history and user state into classification.

Research shows that multi-turn intent classification with context improves accuracy by 5% ([source](https://arxiv.org/html/2411.12307v1)).

```typescript
interface ConversationState {
  currentIntent: string;
  intentHistory: Array<{ intent: string; turn: number }>;
  collectedFields: string[];
  lastQuestion: string;
}

class ContextAwareClassifier {
  async classify(
    message: string,
    state: ConversationState
  ): Promise<{ intent: string; confidence: number }> {
    // Build context-aware prompt
    const contextInfo = this.buildContextInfo(state);
    
    const prompt = `
Current conversation state:
- Current intent: ${state.currentIntent}
- Fields collected: ${state.collectedFields.join(', ')}
- Last question asked: ${state.lastQuestion}
- Intent history: ${this.formatIntentHistory(state.intentHistory)}

User's latest message: "${message}"

Consider:
1. Is the user answering the last question? (stay in current intent)
2. Is the user switching topics? (change intent)
3. Is the user clarifying or expanding? (stay in current intent)

Classify the intent...`;
    
    return await this.llmClassify(prompt);
  }
  
  private buildContextInfo(state: ConversationState): string {
    // Summarize conversation state for LLM
    if (state.currentIntent === 'recommendation' && state.collectedFields.length > 0) {
      return `User is in the middle of providing nomination details. They've given: ${state.collectedFields.join(', ')}. Unless they explicitly ask a question, stay in recommendation mode.`;
    }
    return '';
  }
}
```

**Key Insights:**
- If user is answering a question → stay in current intent (95% confidence)
- If user asks a new question → classify independently
- Track intent switches to detect confused users
- Use collected fields as signal (more fields = more committed to intent)

---

### 4. Confidence Calibration and Threshold Tuning

**Problem:** LLM confidence scores are often miscalibrated (90% confidence ≠ 90% accuracy).

**Solution:** Calibrate confidence scores and tune thresholds based on production data.

Research shows that proper calibration enables meaningful automation thresholds ([source](https://www.runpulse.com/blog/confidence-scoring-for-downstream-automation-when-to-trust-when-to-review)).

```typescript
class CalibratedClassifier {
  private readonly CONFIDENCE_THRESHOLDS = {
    HIGH: 0.85,    // Auto-route with high confidence
    MEDIUM: 0.60,  // Route but log for review
    LOW: 0.40,     // Flag for human review or ask clarifying question
  };
  
  async classifyWithCalibration(
    message: string,
    context: any
  ): Promise<{
    intent: string;
    confidence: number;
    action: 'auto' | 'review' | 'clarify';
  }> {
    const result = await this.classify(message, context);
    
    // Calibrate confidence based on historical accuracy
    const calibratedConfidence = this.calibrate(
      result.confidence,
      result.intent
    );
    
    // Determine action based on threshold
    let action: 'auto' | 'review' | 'clarify';
    if (calibratedConfidence >= this.CONFIDENCE_THRESHOLDS.HIGH) {
      action = 'auto';
    } else if (calibratedConfidence >= this.CONFIDENCE_THRESHOLDS.MEDIUM) {
      action = 'review';  // Log for later analysis
    } else {
      action = 'clarify';  // Ask user to clarify
    }
    
    return {
      intent: result.intent,
      confidence: calibratedConfidence,
      action,
    };
  }
  
  private calibrate(rawConfidence: number, intent: string): number {
    // Apply calibration curve based on historical data
    // Example: LLM says 0.9 but historical accuracy is 0.75 → return 0.75
    const calibrationCurves = {
      recommendation: (c: number) => c * 0.95,  // Slightly overconfident
      qa: (c: number) => c * 0.85,              // More overconfident
    };
    
    return calibrationCurves[intent]?.(rawConfidence) || rawConfidence;
  }
}
```

**Threshold Tuning Process:**
1. Collect 100+ labeled examples from production
2. Measure accuracy at different confidence levels
3. Plot calibration curve (predicted confidence vs actual accuracy)
4. Adjust thresholds to achieve target precision/recall
5. Monitor and re-calibrate monthly

**Recommended Thresholds:**
- High confidence (≥0.85): Auto-route, 95%+ accuracy
- Medium confidence (0.60-0.85): Route but log for review
- Low confidence (<0.60): Ask clarifying question

---

### 5. Out-of-Scope Detection

**Problem:** Users sometimes ask questions outside the chatbot's domain (e.g., "What's the weather?").

**Solution:** Add explicit out-of-scope detection to gracefully handle off-topic queries.

```typescript
type Intent = 'recommendation' | 'qa' | 'out_of_scope';

const SYSTEM_PROMPT = `You are a context classifier for a Stevie Awards chatbot.

Classify user messages into one of three intents:

1. **recommendation** - User wants to find award categories or get nomination help
2. **qa** - User has questions about Stevie Awards (deadlines, fees, rules, eligibility)
3. **out_of_scope** - User is asking about something unrelated to Stevie Awards

Examples of out_of_scope:
- "What's the weather today?"
- "Tell me a joke"
- "How do I cook pasta?"
- "What's the capital of France?"
- "Can you help me with my homework?"

If the query is clearly unrelated to awards, nominations, or Stevie Awards information, classify as out_of_scope.`;

class OutOfScopeDetector {
  async classify(message: string): Promise<{
    intent: Intent;
    confidence: number;
  }> {
    const result = await this.llmClassify(message);
    
    if (result.intent === 'out_of_scope') {
      return {
        intent: 'out_of_scope',
        confidence: result.confidence,
      };
    }
    
    return result;
  }
  
  getOutOfScopeResponse(): string {
    return "I'm specialized in helping with Stevie Awards nominations and questions. I can help you find award categories or answer questions about the awards process. How can I assist you with that?";
  }
}
```

**Benefits:**
- Prevents wasted processing on irrelevant queries
- Provides clear boundaries to users
- Improves user experience (clear expectations)
- Reduces support burden

---

### 6. Intent Hierarchy and Sub-Intents

**Problem:** Binary classification (recommendation vs qa) is too coarse-grained for complex conversations.

**Solution:** Implement hierarchical intent structure with sub-intents.

```typescript
interface HierarchicalIntent {
  primary: 'recommendation' | 'qa';
  secondary?: string;
  confidence: number;
}

const INTENT_HIERARCHY = {
  recommendation: {
    subIntents: [
      'find_categories',      // "Help me find categories"
      'nomination_guidance',  // "How do I nominate?"
      'category_comparison',  // "Which is better: X or Y?"
      'eligibility_check',    // "Am I eligible for this category?"
    ],
  },
  qa: {
    subIntents: [
      'deadline_inquiry',     // "When is the deadline?"
      'fee_inquiry',          // "How much does it cost?"
      'process_inquiry',      // "How does judging work?"
      'program_inquiry',      // "Tell me about Technology Excellence"
    ],
  },
};

class HierarchicalClassifier {
  async classify(message: string): Promise<HierarchicalIntent> {
    // Stage 1: Classify primary intent
    const primary = await this.classifyPrimary(message);
    
    // Stage 2: Classify sub-intent within primary
    const secondary = await this.classifySecondary(
      message,
      primary.intent
    );
    
    return {
      primary: primary.intent,
      secondary: secondary.subIntent,
      confidence: Math.min(primary.confidence, secondary.confidence),
    };
  }
}
```

**Use Cases:**
- Route to specialized handlers (deadline bot, fee bot, category finder)
- Provide more targeted responses
- Track user journey through intent funnel
- Identify gaps in coverage (high volume sub-intents without handlers)

---

### 7. Continuous Learning and Monitoring

**Problem:** Intent distribution shifts over time as users discover new ways to phrase requests.

**Solution:** Implement monitoring and continuous improvement pipeline.

```typescript
interface IntentMetrics {
  intent: string;
  count: number;
  avgConfidence: number;
  accuracy: number;  // From manual review
  latency: number;
}

class IntentMonitor {
  async logClassification(
    message: string,
    intent: string,
    confidence: number,
    latency: number
  ): Promise<void> {
    // Log to database for analysis
    await db.insert('intent_logs', {
      message,
      intent,
      confidence,
      latency,
      timestamp: new Date(),
    });
  }
  
  async getMetrics(timeRange: string): Promise<IntentMetrics[]> {
    // Aggregate metrics by intent
    return await db.query(`
      SELECT 
        intent,
        COUNT(*) as count,
        AVG(confidence) as avgConfidence,
        AVG(latency) as latency
      FROM intent_logs
      WHERE timestamp > NOW() - INTERVAL '${timeRange}'
      GROUP BY intent
    `);
  }
  
  async identifyDriftingIntents(): Promise<string[]> {
    // Find intents with declining confidence over time
    const recentMetrics = await this.getMetrics('7 days');
    const historicalMetrics = await this.getMetrics('30 days');
    
    const drifting = [];
    for (const recent of recentMetrics) {
      const historical = historicalMetrics.find(h => h.intent === recent.intent);
      if (historical && recent.avgConfidence < historical.avgConfidence - 0.1) {
        drifting.push(recent.intent);
      }
    }
    
    return drifting;
  }
}
```

**Monitoring Checklist:**
- [ ] Track classification accuracy (weekly manual review of 50 samples)
- [ ] Monitor confidence distribution (detect calibration drift)
- [ ] Track latency percentiles (p50, p95, p99)
- [ ] Identify low-confidence queries (candidates for clarification)
- [ ] Detect intent distribution shifts (new user behaviors)
- [ ] A/B test prompt changes (measure impact on accuracy)

---

## Implementation Roadmap

### Phase 1: Quick Wins (Week 1-2)

- [ ] 1. Implement hybrid classification (keyword + LLM)
  - Add fast keyword matching for obvious cases
  - Measure latency improvement (target: 80% reduction)
  - Measure cost reduction (target: 80% fewer LLM calls)

- [ ] 2. Add few-shot examples to prompt
  - Collect 5 representative examples from production logs
  - Add to system prompt
  - Measure accuracy improvement (target: 5-10%)

- [ ] 3. Implement confidence logging
  - Log all classifications with confidence scores
  - Create dashboard for monitoring
  - Establish baseline metrics

### Phase 2: Context Awareness (Week 3-4)

- [ ] 4. Implement multi-turn context tracking
  - Track conversation state (current intent, collected fields)
  - Incorporate state into classification prompt
  - Measure improvement in multi-turn accuracy

- [ ] 5. Add out-of-scope detection
  - Extend intent taxonomy to include out_of_scope
  - Create graceful fallback responses
  - Measure reduction in irrelevant queries

- [ ] 6. Implement clarification questions
  - Detect low-confidence classifications (<0.60)
  - Generate clarifying questions
  - Re-classify after clarification

### Phase 3: Optimization (Week 5-6)

- [ ] 7. Confidence calibration
  - Collect 100+ labeled examples
  - Build calibration curves
  - Tune confidence thresholds

- [ ] 8. Intent hierarchy
  - Define sub-intents for recommendation and qa
  - Implement two-stage classification
  - Route to specialized handlers

- [ ] 9. Continuous monitoring
  - Set up automated metrics collection
  - Create weekly accuracy review process
  - Implement drift detection alerts

---

## Configuration

New environment variables:

```bash
# Intent Classification
INTENT_CLASSIFICATION_MODE=hybrid  # hybrid | llm_only | keyword_only
INTENT_CONFIDENCE_THRESHOLD_HIGH=0.85
INTENT_CONFIDENCE_THRESHOLD_MEDIUM=0.60
INTENT_CONFIDENCE_THRESHOLD_LOW=0.40

# Few-Shot Learning
INTENT_FEW_SHOT_ENABLED=true
INTENT_FEW_SHOT_EXAMPLES=5

# Multi-Turn Context
INTENT_CONTEXT_WINDOW=4  # Number of previous turns to consider
INTENT_USE_CONVERSATION_STATE=true

# Out-of-Scope Detection
INTENT_OUT_OF_SCOPE_ENABLED=true
INTENT_OUT_OF_SCOPE_THRESHOLD=0.70

# Monitoring
INTENT_LOGGING_ENABLED=true
INTENT_LOGGING_SAMPLE_RATE=1.0  # Log 100% of classifications
```

---

## Expected Results

| Metric | Baseline | After Phase 1 | After Phase 2 | After Phase 3 | Total Improvement |
|--------|----------|---------------|---------------|---------------|-------------------|
| Accuracy | 85% | 90% (+5%) | 93% (+3%) | 95% (+2%) | +10% |
| Avg Latency | 2.5s | 0.5s (-80%) | 0.6s (+0.1s) | 0.7s (+0.1s) | -72% |
| Cost per Request | $0.001 | $0.0002 (-80%) | $0.0002 | $0.0002 | -80% |
| Out-of-Scope Rate | 5% | 5% | 2% (-60%) | 1% (-50%) | -80% |
| Low Confidence Rate | 15% | 12% (-20%) | 8% (-33%) | 5% (-38%) | -67% |

---

## Testing Strategy

### Unit Tests
- Test keyword matching with various phrasings
- Test few-shot example formatting
- Test confidence calibration curves
- Test out-of-scope detection

### Integration Tests
- Test hybrid classification pipeline end-to-end
- Test multi-turn context tracking
- Test clarification question generation
- Test intent switching mid-conversation

### Evaluation Tests
- Manual review of 100 random classifications (weekly)
- Measure accuracy, precision, recall for each intent
- Compare against baseline (current system)
- A/B test prompt changes

### Production Monitoring
- Track classification accuracy in real-time
- Monitor confidence distribution
- Alert on accuracy drops >5%
- Weekly review of low-confidence queries

---

## Common Pitfalls and Solutions

### Pitfall 1: Over-reliance on Keywords
**Problem:** Keyword matching misses paraphrased or creative phrasings.
**Solution:** Use keywords for obvious cases only, fall back to LLM for ambiguous queries.

### Pitfall 2: Ignoring Conversation Context
**Problem:** Classifying each message independently leads to intent switching errors.
**Solution:** Track conversation state and bias toward current intent unless explicit switch.

### Pitfall 3: Miscalibrated Confidence
**Problem:** LLM confidence scores don't match actual accuracy.
**Solution:** Collect labeled data and build calibration curves.

### Pitfall 4: No Out-of-Scope Handling
**Problem:** Chatbot tries to answer irrelevant questions, confusing users.
**Solution:** Add explicit out-of-scope detection and graceful fallback.

### Pitfall 5: Static Prompts
**Problem:** Prompts become stale as user behavior evolves.
**Solution:** Monitor accuracy, review low-confidence queries, update examples monthly.

---

## References

**Content rephrased for compliance with licensing restrictions**

1. **Hybrid Classification**: Combining encoder NLU models with LLM classification improves both speed and accuracy ([source](https://www.voiceflow.com/pathways/benchmarking-hybrid-llm-classification-systems))

2. **Few-Shot Learning**: Well-crafted few-shot prompts can rival full fine-tuning while maintaining flexibility ([source](https://www.emergentmind.com/topics/few-shot-prompt-engineering))

3. **Multi-Turn Context**: Incorporating conversation history improves multi-turn intent classification accuracy by 5% ([source](https://arxiv.org/html/2411.12307v1))

4. **Confidence Calibration**: Proper calibration enables meaningful automation thresholds (auto-process above 90%, review 70-90%, reject below 70%) ([source](https://www.runpulse.com/blog/confidence-scoring-for-downstream-automation-when-to-trust-when-to-review))

5. **Intent Hierarchy**: Building hierarchical intent structures improves routing and response quality ([source](https://developer.vonage.com/en/blog/how-to-build-an-intent-classification-hierarchy))

6. **Continuous Learning**: Monitoring intent distribution and confidence over time detects drift and enables continuous improvement ([source](https://arxiv.org/html/2411.12307v1))

---

## Appendix: Current System Analysis

### Strengths
✅ Fast keyword fallback for obvious nomination requests  
✅ Clear binary classification (recommendation vs qa)  
✅ Graceful error handling with fallback to recommendation mode  
✅ Logging for monitoring  

### Weaknesses
❌ No few-shot examples (zero-shot only)  
❌ No multi-turn context awareness  
❌ No confidence calibration or threshold tuning  
❌ No out-of-scope detection  
❌ No intent hierarchy (too coarse-grained)  
❌ No continuous monitoring or improvement pipeline  

### Recommended Priority
1. **High Priority**: Hybrid classification (80% cost/latency reduction)
2. **High Priority**: Few-shot examples (5-10% accuracy improvement)
3. **Medium Priority**: Multi-turn context (3-5% accuracy improvement)
4. **Medium Priority**: Confidence calibration (enables automation)
5. **Low Priority**: Out-of-scope detection (improves UX)
6. **Low Priority**: Intent hierarchy (enables specialized routing)

---

**Last Updated:** February 2026  
**Status:** Ready for Implementation  
**Estimated Effort:** 4-6 weeks (with 1 engineer)  
**Expected ROI:** 10% accuracy improvement, 80% cost reduction, 72% latency reduction
