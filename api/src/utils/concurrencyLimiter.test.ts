import { ConcurrencyLimiter } from './concurrencyLimiter';

describe('ConcurrencyLimiter', () => {
  test('acquire/release allows up to max concurrent', async () => {
    const limiter = new ConcurrencyLimiter({ name: 'test_limiter', max: 2 });

    const a = await limiter.acquire({ timeoutMs: 50 });
    const b = await limiter.acquire({ timeoutMs: 50 });

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(limiter.getInFlight()).toBe(2);

    if (a.ok) a.release();
    if (b.ok) b.release();

    // queue drained, inFlight decremented
    expect(limiter.getInFlight()).toBe(0);
  });

  test('third acquire waits for release and then succeeds', async () => {
    const limiter = new ConcurrencyLimiter({ name: 'test_limiter2', max: 1 });

    const first = await limiter.acquire({ timeoutMs: 50 });
    expect(first.ok).toBe(true);
    expect(limiter.getInFlight()).toBe(1);

    const pending = limiter.acquire({ timeoutMs: 250 });

    // allow event loop tick so it queues
    await new Promise((r) => setTimeout(r, 10));
    expect(limiter.getQueued()).toBe(1);

    // release should transfer slot to queued waiter (inFlight stays 1)
    if (first.ok) first.release();

    const second = await pending;
    expect(second.ok).toBe(true);
    expect(limiter.getInFlight()).toBe(1);
    expect(limiter.getQueued()).toBe(0);

    if (second.ok) second.release();
    expect(limiter.getInFlight()).toBe(0);
  });

  test('acquire times out if not released in time', async () => {
    const limiter = new ConcurrencyLimiter({ name: 'test_limiter3', max: 1 });

    const first = await limiter.acquire({ timeoutMs: 50 });
    expect(first.ok).toBe(true);

    const start = Date.now();
    const second = await limiter.acquire({ timeoutMs: 60 });
    const elapsed = Date.now() - start;

    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe('timeout');
      expect(elapsed).toBeGreaterThanOrEqual(50);
    }

    if (first.ok) first.release();
  });
});
