type RateLimitState = {
  failures: number;
  firstFailureAt: number;
  blockedUntil: number;
};

type RateLimitResult = {
  ok: boolean;
  retryAfterSeconds?: number;
};

const IP_WINDOW_MS = 10 * 60 * 1000;
const IDENTIFIER_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_FAILURES = 6;
const IDENTIFIER_MAX_FAILURES = 8;
const BLOCK_DURATION_MS = 15 * 60 * 1000;

declare global {
  // eslint-disable-next-line no-var
  var studentLookupRateLimitStore:
    | Map<string, RateLimitState>
    | undefined;
}

function getStore() {
  if (!globalThis.studentLookupRateLimitStore) {
    globalThis.studentLookupRateLimitStore = new Map<string, RateLimitState>();
  }

  return globalThis.studentLookupRateLimitStore;
}

function stateKey(scope: "ip" | "identifier", value: string) {
  return `${scope}:${value}`;
}

function normalizeState(
  store: Map<string, RateLimitState>,
  key: string,
  windowMs: number,
  now: number,
) {
  const current = store.get(key);

  if (!current) {
    return null;
  }

  if (current.blockedUntil > now) {
    return current;
  }

  if (now - current.firstFailureAt > windowMs) {
    store.delete(key);
    return null;
  }

  return current;
}

function getRetryAfterSeconds(blockedUntil: number, now: number) {
  return Math.max(1, Math.ceil((blockedUntil - now) / 1000));
}

function getRateLimitKeys(ipAddress: string, identifier?: string | null) {
  return [
    {
      key: stateKey("ip", ipAddress),
      windowMs: IP_WINDOW_MS,
      maxFailures: IP_MAX_FAILURES,
    },
    ...(identifier
      ? [
          {
            key: stateKey("identifier", identifier),
            windowMs: IDENTIFIER_WINDOW_MS,
            maxFailures: IDENTIFIER_MAX_FAILURES,
          },
        ]
      : []),
  ];
}

export function getStudentLookupRateLimitStatus(input: {
  ipAddress: string;
  identifier?: string | null;
}): RateLimitResult {
  const store = getStore();
  const now = Date.now();

  for (const item of getRateLimitKeys(input.ipAddress, input.identifier)) {
    const state = normalizeState(store, item.key, item.windowMs, now);

    if (state?.blockedUntil && state.blockedUntil > now) {
      return {
        ok: false,
        retryAfterSeconds: getRetryAfterSeconds(state.blockedUntil, now),
      };
    }
  }

  return { ok: true };
}

export function registerStudentLookupFailure(input: {
  ipAddress: string;
  identifier?: string | null;
}): RateLimitResult {
  const store = getStore();
  const now = Date.now();

  for (const item of getRateLimitKeys(input.ipAddress, input.identifier)) {
    const state =
      normalizeState(store, item.key, item.windowMs, now) ?? {
        failures: 0,
        firstFailureAt: now,
        blockedUntil: 0,
      };

    state.failures += 1;

    if (now - state.firstFailureAt > item.windowMs) {
      state.failures = 1;
      state.firstFailureAt = now;
      state.blockedUntil = 0;
    }

    if (state.failures >= item.maxFailures) {
      state.blockedUntil = now + BLOCK_DURATION_MS;
    }

    store.set(item.key, state);
  }

  return getStudentLookupRateLimitStatus(input);
}

export function clearStudentLookupFailures(input: {
  ipAddress: string;
  identifier?: string | null;
}) {
  const store = getStore();

  for (const item of getRateLimitKeys(input.ipAddress, input.identifier)) {
    store.delete(item.key);
  }
}
