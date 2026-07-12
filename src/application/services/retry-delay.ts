export interface RetryDelayOptions {
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitterRatio: number;
  readonly random: () => number;
}

export function calculateRetryDelay(
  retryIndex: number,
  retryAfterMs: number | null,
  options: RetryDelayOptions,
): number {
  const exponent = Math.min(Math.max(0, retryIndex), 52);
  const exponential = Math.min(
    options.maxDelayMs,
    options.baseDelayMs * 2 ** exponent,
  );
  const capped = Number.isFinite(exponential)
    ? exponential
    : options.maxDelayMs;
  const jitterRange = capped * options.jitterRatio;
  const jittered =
    capped -
    jitterRange +
    Math.min(1, Math.max(0, options.random())) * jitterRange;
  const withHeader = Math.max(jittered, retryAfterMs ?? 0);
  return Math.min(options.maxDelayMs, Math.max(0, Math.round(withHeader)));
}

export function parseRetryAfter(
  raw: string | undefined,
  nowMs: number,
  maxDelayMs: number,
): number | null {
  if (raw === undefined) {
    return null;
  }
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    return Math.min(maxDelayMs, Number(trimmed) * 1_000);
  }
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp) || timestamp < nowMs) {
    return null;
  }
  return Math.min(maxDelayMs, Math.max(0, timestamp - nowMs));
}
