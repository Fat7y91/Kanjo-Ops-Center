/**
 * Connection-failure triage shared by every client boundary.
 *
 * A dropped network, an aborted fetch or a closed RSC stream is not a defect in
 * the page: the data is momentarily unreachable. Treating those like code bugs
 * is what unmounts the whole app into a fatal "Application error" screen, so
 * the boundaries classify them separately and render a reconnecting state
 * instead of a crash report.
 */

const CONNECTION_SIGNATURES = [
  /connection closed/i,
  /failed to fetch/i,
  /networkerror/i,
  /network request failed/i,
  /load failed/i,
  /fetch failed/i,
  /err_internet_disconnected/i,
  /err_network/i,
  /websocket is closed/i,
  /event source/i,
  /socket hang up/i,
  /econnreset/i,
  /econnrefused/i,
  /etimedout/i,
  /the operation was aborted/i,
  /aborterror/i,
  /timeouterror/i,
  /تم إغلاق الاتصال/,
] as const;

/**
 * True when the thrown value looks like a connectivity problem rather than a
 * rendering defect.
 *
 * The check spans the error name, message and any nested `cause`, because the
 * RSC runtime reports a severed stream as `Error("Connection closed.")` while a
 * `fetch()` abort arrives as `AbortError` and a Supabase failure as a plain
 * `TypeError: Failed to fetch`.
 */
export function isConnectionError(error: unknown): boolean {
  let current: unknown = error;
  // Follow the `cause` chain a few levels: wrappers often rethrow with a
  // generic message and keep the transport error underneath.
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (typeof current === "string") {
      if (matches(current)) return true;
      break;
    }
    if (typeof current !== "object") break;

    const name = (current as { name?: unknown }).name;
    const message = (current as { message?: unknown }).message;
    if (typeof name === "string" && matches(name)) return true;
    if (typeof message === "string" && matches(message)) return true;

    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function matches(value: string): boolean {
  return CONNECTION_SIGNATURES.some((pattern) => pattern.test(value));
}

/**
 * True when the browser currently believes it has no network.
 *
 * Guards the case where the error text is unhelpful but the device is plainly
 * offline; the boundary can still show the reconnecting state.
 */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
