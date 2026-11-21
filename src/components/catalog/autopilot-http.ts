"use client";

/**
 * JSON POST with bounded retries for the autopilot batches.
 *
 * The importer runs hundreds of small batches through a Cloudflare edge route,
 * so a transient 502/503/504 or a dropped connection must not abort the whole
 * file. Kept separate from `use-autopilot.ts` so the hook stays focused on run
 * state and under the file-size limit.
 */

const MAX_RETRIES = 2;
const RETRY_BASE_MS = 2000;
const RETRYABLE_STATUS = new Set([502, 503, 504]);

class RequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof RequestError)) return false;
  return error.status === undefined || RETRYABLE_STATUS.has(error.status);
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new RequestError("تعذر الاتصال بالخادم. أعد المحاولة.");
  }

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new RequestError(
      payload.error ?? "تعذر إكمال طلب الاستيراد.",
      response.status,
    );
  }
  return payload as T;
}

/** Retries transient 502/503/504 and dropped connections with 2s backoff. */
export async function postWithRetry<T>(url: string, body: unknown): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await postJson<T>(url, body);
    } catch (error) {
      if (attempt >= MAX_RETRIES || !isRetryable(error)) throw error;
      await sleep(RETRY_BASE_MS * (attempt + 1));
    }
  }
}
