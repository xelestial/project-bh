import type { RuntimeStore } from "../runtime/ports.ts";

export type RateLimitScope =
  | "room.create"
  | "room.join"
  | "invite.lookup"
  | "action.query"
  | "command"
  | "ws.upgrade";

export interface RateLimitCheckInput {
  readonly scope: RateLimitScope;
  readonly identity: string;
}

export interface RateLimitCheckResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterMs: number;
}

export interface FixedWindowRateLimiterOptions {
  readonly store: RuntimeStore;
  readonly limit: number;
  readonly windowMs: number;
  readonly now?: () => number;
}

export interface FixedWindowRateLimiter {
  readonly check: (input: RateLimitCheckInput) => Promise<RateLimitCheckResult>;
}

function createWindowStart(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

export function createFixedWindowRateLimiter(
  options: FixedWindowRateLimiterOptions
): FixedWindowRateLimiter {
  const now = options.now ?? (() => Date.now());

  async function check(input: RateLimitCheckInput): Promise<RateLimitCheckResult> {
    const currentTime = now();
    const windowStart = createWindowStart(currentTime, options.windowMs);
    const windowExpiresAt = windowStart + options.windowMs;
    const key = `${input.scope}:${input.identity}:${windowStart}`;
    const count = await options.store.rateLimits.increment(key, windowExpiresAt);
    const remaining = Math.max(0, options.limit - count);

    return {
      allowed: count <= options.limit,
      remaining,
      retryAfterMs: Math.max(0, windowExpiresAt - currentTime)
    };
  }

  return {
    check
  };
}
