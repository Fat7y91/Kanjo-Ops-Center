import { cache } from "react";

/**
 * Per-request memo for RBAC reads.
 *
 * A single page render asks for the same roster several times — the sidebar,
 * the page guard and the admin matrix each resolve users, and
 * `listAssignableManagers()` is `listUsers()` filtered again. Without a memo
 * each caller paid for its own query.
 *
 * `cache()` is scoped to one React render, so the memo can never carry one
 * request's authorization data into the next: outside a render it is a
 * pass-through, and a new request starts with an empty cache. That property is
 * the reason this is a React cache and not a module-level map — an isolate
 * serves many requests, and a map there would keep serving a revoked grant.
 *
 * Contract for callers: a read that must observe a write performed earlier in
 * the *same* request must not go through the memo. `users.ts` keeps its write
 * paths on the repository for exactly this reason, and `getRbacRevision()` is
 * not memoised because the admin routes read it after committing.
 */
export function memoizeRead<TResult>(
  read: () => Promise<TResult>,
): () => Promise<TResult> {
  return cache(read);
}
