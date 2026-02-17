/**
 * In-memory per-process in-flight guard keyed by session_id.
 *
 * NOTE: This protects a single Node.js instance. In a multi-instance ECS setup,
 * concurrent requests could still hit different instances. That's OK: it still
 * prevents accidental duplicate submits from the same client most of the time,
 * and the global capacity limiter protects downstream providers.
 *
 * If you need cross-instance per-session locking, move this to Redis.
 */
export class SessionInFlight {
  private readonly inFlight = new Set<string>();

  tryAcquire(sessionId: string): boolean {
    if (this.inFlight.has(sessionId)) return false;
    this.inFlight.add(sessionId);
    return true;
  }

  release(sessionId: string) {
    this.inFlight.delete(sessionId);
  }

  has(sessionId: string): boolean {
    return this.inFlight.has(sessionId);
  }
}

export const sessionInFlight = new SessionInFlight();
