import CircuitBreaker from 'opossum';
import logger from './logger';

/**
 * Circuit breaker options for AI service calls.
 * Opens circuit after 5 consecutive failures.
 * Half-open after 30 seconds to test if service recovered.
 */
const circuitBreakerOptions = {
  timeout: 35000, // 35 seconds (AI service has 30s timeout)
  errorThresholdPercentage: 50, // Open circuit if 50% of requests fail
  resetTimeout: 30000, // Try again after 30 seconds
  rollingCountTimeout: 60000, // 1 minute rolling window
  rollingCountBuckets: 10, // 10 buckets in the rolling window
  name: 'ai-service-circuit-breaker',
};

/**
 * Create a circuit breaker for a function.
 * Automatically opens circuit on repeated failures and provides fallback.
 */
export function createCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  fallback?: (...args: Parameters<T>) => Promise<ReturnType<T>>
): CircuitBreaker<Parameters<T>, ReturnType<T>> {
  const breaker = new CircuitBreaker(fn, circuitBreakerOptions) as CircuitBreaker<Parameters<T>, ReturnType<T>>;

  // Event listeners for monitoring
  breaker.on('open', () => {
    logger.error('circuit_breaker_opened', {
      name: circuitBreakerOptions.name,
      message: 'Circuit breaker opened due to repeated failures',
    });
  });

  breaker.on('halfOpen', () => {
    logger.warn('circuit_breaker_half_open', {
      name: circuitBreakerOptions.name,
      message: 'Circuit breaker half-open, testing service',
    });
  });

  breaker.on('close', () => {
    logger.info('circuit_breaker_closed', {
      name: circuitBreakerOptions.name,
      message: 'Circuit breaker closed, service recovered',
    });
  });

  breaker.on('failure', (error: Error) => {
    logger.warn('circuit_breaker_failure', {
      name: circuitBreakerOptions.name,
      error: error.message,
    });
  });

  breaker.on('success', () => {
    logger.debug('circuit_breaker_success', {
      name: circuitBreakerOptions.name,
    });
  });

  breaker.on('timeout', () => {
    logger.error('circuit_breaker_timeout', {
      name: circuitBreakerOptions.name,
      timeout: circuitBreakerOptions.timeout,
    });
  });

  breaker.on('reject', () => {
    logger.error('circuit_breaker_rejected', {
      name: circuitBreakerOptions.name,
      message: 'Request rejected, circuit is open',
    });
  });

  // Set fallback if provided
  if (fallback) {
    breaker.fallback(fallback);
  }

  return breaker;
}

/**
 * Get circuit breaker statistics for monitoring.
 */
export function getCircuitBreakerStats(breaker: CircuitBreaker<any, any>) {
  const stats = breaker.stats;
  
  return {
    name: breaker.name,
    state: breaker.opened ? 'open' : breaker.halfOpen ? 'half-open' : 'closed',
    failures: stats.failures,
    successes: stats.successes,
    rejects: stats.rejects,
    timeouts: stats.timeouts,
    fires: stats.fires,
    latencyMean: stats.latencyMean,
    percentiles: {
      p50: stats.percentiles['0.5'],
      p90: stats.percentiles['0.9'],
      p99: stats.percentiles['0.99'],
    },
  };
}
