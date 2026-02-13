import { Registry, Counter, Histogram, Gauge } from 'prom-client';

// Create a custom registry
export const register = new Registry();

// Add default labels to all metrics
register.setDefaultLabels({
  app: 'stevie-awards-api',
});

// HTTP request counter
export const httpRequestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

// HTTP request duration histogram
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10], // seconds
  registers: [register],
});

// Active connections gauge
export const activeConnections = new Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [register],
});

// Business metrics
export const conversationsStarted = new Counter({
  name: 'conversations_started_total',
  help: 'Total number of conversations started',
  registers: [register],
});

export const conversationsCompleted = new Counter({
  name: 'conversations_completed_total',
  help: 'Total number of conversations completed',
  registers: [register],
});

export const recommendationsGenerated = new Counter({
  name: 'recommendations_generated_total',
  help: 'Total number of recommendations generated',
  registers: [register],
});

// Database metrics
export const databaseQueryDuration = new Histogram({
  name: 'database_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 3, 5],
  registers: [register],
});

export const databaseErrors = new Counter({
  name: 'database_errors_total',
  help: 'Total number of database errors',
  labelNames: ['operation'],
  registers: [register],
});

// External service metrics
export const externalServiceCalls = new Counter({
  name: 'external_service_calls_total',
  help: 'Total number of external service calls',
  labelNames: ['service', 'status'],
  registers: [register],
});

export const externalServiceDuration = new Histogram({
  name: 'external_service_duration_seconds',
  help: 'Duration of external service calls in seconds',
  labelNames: ['service'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

// Cache metrics
export const cacheHits = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'],
  registers: [register],
});

export const cacheMisses = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type'],
  registers: [register],
});

// Error metrics
export const errorCounter = new Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['error_type', 'severity'],
  registers: [register],
});

// OpenAI token usage (for cost control and SRE at scale)
export const openaiTokensTotal = new Counter({
  name: 'openai_tokens_total',
  help: 'Total OpenAI tokens used',
  labelNames: ['type'], // 'prompt' | 'completion'
  registers: [register],
});

// Collect default metrics (CPU, memory, etc.)
import { collectDefaultMetrics } from 'prom-client';
collectDefaultMetrics({ register });
