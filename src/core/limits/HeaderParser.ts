export interface ParsedRateLimits {
  rpm?: {
    limit: number;
    remaining: number;
    reset: Date;
  };
  tpm?: {
    limit: number;
    remaining: number;
    reset: Date;
  };
}

export function parseOpenAIHeaders(headers: Headers | Record<string, string>): ParsedRateLimits {
  const get = (key: string) => {
    if (headers instanceof Headers) {
      return headers.get(key);
    }
    return headers[key] || headers[key.toLowerCase()];
  };

  const result: ParsedRateLimits = {};

  const rpmLimit = get('x-ratelimit-limit-requests');
  const rpmRemaining = get('x-ratelimit-remaining-requests');
  const rpmReset = get('x-ratelimit-reset-requests');

  if (rpmLimit && rpmRemaining && rpmReset) {
    const resetMs = parseDuration(rpmReset);
    result.rpm = {
      limit: parseInt(rpmLimit),
      remaining: parseInt(rpmRemaining),
      reset: new Date(Date.now() + resetMs)
    };
  }

  const tpmLimit = get('x-ratelimit-limit-tokens');
  const tpmRemaining = get('x-ratelimit-remaining-tokens');
  const tpmReset = get('x-ratelimit-reset-tokens');

  if (tpmLimit && tpmRemaining && tpmReset) {
    const resetMs = parseDuration(tpmReset);
    result.tpm = {
      limit: parseInt(tpmLimit),
      remaining: parseInt(tpmRemaining),
      reset: new Date(Date.now() + resetMs)
    };
  }

  return result;
}

export function parseAnthropicHeaders(headers: Headers | Record<string, string>): ParsedRateLimits {
  const get = (key: string) => {
    if (headers instanceof Headers) {
      return headers.get(key);
    }
    return headers[key] || headers[key.toLowerCase()];
  };

  const result: ParsedRateLimits = {};

  const rpmLimit = get('anthropic-ratelimit-requests-limit');
  const rpmRemaining = get('anthropic-ratelimit-requests-remaining');
  const rpmReset = get('anthropic-ratelimit-requests-reset');

  if (rpmLimit && rpmRemaining && rpmReset) {
    result.rpm = {
      limit: parseInt(rpmLimit),
      remaining: parseInt(rpmRemaining),
      reset: new Date(rpmReset)
    };
  }

  const tpmLimit = get('anthropic-ratelimit-tokens-limit');
  const tpmRemaining = get('anthropic-ratelimit-tokens-remaining');
  const tpmReset = get('anthropic-ratelimit-tokens-reset');

  if (tpmLimit && tpmRemaining && tpmReset) {
    result.tpm = {
      limit: parseInt(tpmLimit),
      remaining: parseInt(tpmRemaining),
      reset: new Date(tpmReset)
    };
  }

  return result;
}

export function parseGeminiHeaders(headers: Headers | Record<string, string>): ParsedRateLimits {
  const get = (key: string) => {
    if (headers instanceof Headers) {
      return headers.get(key);
    }
    return headers[key] || headers[key.toLowerCase()];
  };

  const result: ParsedRateLimits = {};

  const rpmLimit = get('x-goog-quota-user-limit-requests-per-minute');
  const rpmRemaining = get('x-goog-quota-user-remaining-requests-per-minute');

  if (rpmLimit && rpmRemaining) {
    const now = new Date();
    const nextMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0, 0);

    result.rpm = {
      limit: parseInt(rpmLimit),
      remaining: parseInt(rpmRemaining),
      reset: nextMinute
    };
  }

  const tpmLimit = get('x-goog-quota-user-limit-tokens-per-minute');
  const tpmRemaining = get('x-goog-quota-user-remaining-tokens-per-minute');

  if (tpmLimit && tpmRemaining) {
    const now = new Date();
    const nextMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1, 0, 0);

    result.tpm = {
      limit: parseInt(tpmLimit),
      remaining: parseInt(tpmRemaining),
      reset: nextMinute
    };
  }

  return result;
}

/** Parse duration string (e.g., "6s", "1m30s") to milliseconds. */
function parseDuration(duration: string): number {
  let totalMs = 0;

  const hoursMatch = duration.match(/(\d+)h/);
  if (hoursMatch) {
    totalMs += parseInt(hoursMatch[1]) * 3600000;
  }

  const minutesMatch = duration.match(/(\d+)m/);
  if (minutesMatch) {
    totalMs += parseInt(minutesMatch[1]) * 60000;
  }

  const secondsMatch = duration.match(/(\d+)s/);
  if (secondsMatch) {
    totalMs += parseInt(secondsMatch[1]) * 1000;
  }

  if (totalMs === 0 && /^\d+$/.test(duration)) {
    totalMs = parseInt(duration) * 1000;
  }

  return totalMs;
}
