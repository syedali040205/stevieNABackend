import { Gauge, Counter } from 'prom-client';
import { register } from './metrics';

export type AcquireOptions = {
  timeoutMs: number;
};

export type AcquireResult =
  | { ok: true; release: () => void; queuedMs: number }
  | { ok: false; reason: 'timeout'; queuedMs: number };

/**
 * A minimal async semaphore with optional bounded wait.
 *
 * Purpose: protect downstream providers (e.g., OpenAI) and your own node process
 * from unbounded concurrent work.
 */
export class ConcurrencyLimiter {
  private readonly max: number;
  private inFlight = 0;
  private queue: Array<{
    resolve: (release: () => void) => void;
    enqueuedAt: number;
    timeout: NodeJS.Timeout;
  }> = [];

  private readonly inFlightGauge: Gauge;
  private readonly queuedGauge: Gauge;
  private readonly acquiredCounter: Counter;
  private readonly timeoutCounter: Counter;

  constructor(params: { name: string; max: number }) {
    this.max = params.max;

    const prefix = params.name.replace(/[^a-zA-Z0-9_]/g, '_');

    this.inFlightGauge = new Gauge({
      name: `${prefix}_in_flight`,
      help: `In-flight operations for ${params.name}`,
      registers: [register],
    });

    this.queuedGauge = new Gauge({
      name: `${prefix}_queued`,
      help: `Queued operations waiting for ${params.name}`,
      registers: [register],
    });

    this.acquiredCounter = new Counter({
      name: `${prefix}_acquired_total`,
      help: `Total acquired operations for ${params.name}`,
      registers: [register],
    });

    this.timeoutCounter = new Counter({
      name: `${prefix}_acquire_timeouts_total`,
      help: `Total acquire timeouts for ${params.name}`,
      registers: [register],
    });
  }

  getInFlight(): number {
    return this.inFlight;
  }

  getQueued(): number {
    return this.queue.length;
  }

  async acquire(opts: AcquireOptions): Promise<AcquireResult> {
    const start = Date.now();

    if (this.inFlight < this.max) {
      this.inFlight++;
      this.inFlightGauge.set(this.inFlight);
      this.acquiredCounter.inc();
      return {
        ok: true,
        queuedMs: 0,
        release: () => this.releaseOne(),
      };
    }

    // Wait in queue with timeout
    const queuedMs = () => Date.now() - start;

    return new Promise<AcquireResult>((resolve) => {
      const timeout = setTimeout(() => {
        // remove from queue if still present
        const idx = this.queue.findIndex((q) => q.timeout === timeout);
        if (idx >= 0) this.queue.splice(idx, 1);
        this.queuedGauge.set(this.queue.length);
        this.timeoutCounter.inc();
        resolve({ ok: false, reason: 'timeout', queuedMs: queuedMs() });
      }, opts.timeoutMs);

      this.queue.push({
        enqueuedAt: Date.now(),
        timeout,
        resolve: (release) => {
          clearTimeout(timeout);
          resolve({ ok: true, release, queuedMs: queuedMs() });
        },
      });
      this.queuedGauge.set(this.queue.length);
    });
  }

  private releaseOne() {
    // Give slot to the next queued waiter if any.
    const next = this.queue.shift();
    if (next) {
      this.queuedGauge.set(this.queue.length);
      // keep inFlight the same (slot is transferred)
      next.resolve(() => this.releaseOne());
      return;
    }

    this.inFlight = Math.max(0, this.inFlight - 1);
    this.inFlightGauge.set(this.inFlight);
  }
}
