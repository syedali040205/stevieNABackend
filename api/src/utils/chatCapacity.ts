import { Counter, Histogram } from 'prom-client';
import { register } from './metrics';
import { ConcurrencyLimiter } from './concurrencyLimiter';

// Default: be conservative per-instance. Tune with metrics.
const DEFAULT_MAX_IN_FLIGHT = parseInt(process.env.CHAT_MAX_IN_FLIGHT ?? '25', 10);
const DEFAULT_QUEUE_TIMEOUT_MS = parseInt(process.env.CHAT_QUEUE_TIMEOUT_MS ?? '4000', 10);

export const chatCapacityLimiter = new ConcurrencyLimiter({
  name: 'chat_generation',
  max: Number.isFinite(DEFAULT_MAX_IN_FLIGHT) ? DEFAULT_MAX_IN_FLIGHT : 25,
});

export const chatQueueWaitSeconds = new Histogram({
  name: 'chat_queue_wait_seconds',
  help: 'Time spent waiting in queue for chat generation capacity',
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 3, 4, 5],
  registers: [register],
});

export const chatBusyTotal = new Counter({
  name: 'chat_busy_total',
  help: 'Total number of chat requests rejected as busy (capacity or session lock)',
  labelNames: ['reason'],
  registers: [register],
});

export const chatAbortedTotal = new Counter({
  name: 'chat_aborted_total',
  help: 'Total number of chat generations aborted (client disconnect / cancel)',
  labelNames: ['reason'],
  registers: [register],
});

export const chatCapacityConfig = {
  maxInFlight: DEFAULT_MAX_IN_FLIGHT,
  queueTimeoutMs: DEFAULT_QUEUE_TIMEOUT_MS,
};
