// Simple in-memory rate limiter. Good enough for MVP single-instance dev/prod.
// For multi-instance, swap to Upstash Redis with the same interface.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodic cleanup so the Map doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (b.resetAt < now) buckets.delete(key);
  }
}, 60_000);

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds?: number;
}

/**
 * Allow `max` requests per `windowMs`. Per-key bucket.
 */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1, resetAt: now + windowMs };
  }

  if (bucket.count >= max) {
    const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
    return {
      ok: false,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfterSeconds,
    };
  }

  bucket.count += 1;
  return {
    ok: true,
    remaining: max - bucket.count,
    resetAt: bucket.resetAt,
  };
}

/**
 * Build standard rate-limit headers (same convention as GitHub / Cloudflare).
 */
export function rateLimitHeaders(result: RateLimitResult, max: number): Record<string, string> {
  const h: Record<string, string> = {
    "X-RateLimit-Limit": String(max),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
  if (!result.ok && result.retryAfterSeconds) {
    h["Retry-After"] = String(result.retryAfterSeconds);
  }
  return h;
}
