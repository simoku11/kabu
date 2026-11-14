interface RateLimitDecision {
  allowed: boolean;
  retryAfterMs: number;
}

interface WindowEntry {
  startedAt: number;
  count: number;
}

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, WindowEntry>();

  constructor(
    private readonly maximum: number,
    private readonly windowMs: number,
  ) {}

  take(key: string, now = Date.now()): RateLimitDecision {
    const previous = this.entries.get(key);
    if (!previous || now - previous.startedAt >= this.windowMs) {
      this.entries.set(key, { startedAt: now, count: 1 });
      return { allowed: true, retryAfterMs: 0 };
    }
    if (previous.count >= this.maximum) {
      return {
        allowed: false,
        retryAfterMs: Math.max(1, previous.startedAt + this.windowMs - now),
      };
    }
    previous.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }
}

export function originAllowed(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  if (origin === undefined) return true;
  try {
    return allowedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

export function parseAllowedOrigins(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => new URL(entry).origin);
}
