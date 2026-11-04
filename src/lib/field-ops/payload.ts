import { z } from "zod";

import type { FieldOpsBoard } from "./board";

/**
 * Wire contracts for the field-ops endpoints.
 *
 * These live apart from the builders (`board.ts`, `merchant-rows.ts`) because an
 * island may import a schema — that is the whole point of validating at the
 * boundary — while the builder behind it reaches the stores, which are
 * `server-only`. Keeping both in one module makes the client bundle pull the
 * server graph, which the production build rejects and
 * `scripts/check-runtime-usage.mjs` now fails on.
 */

/**
 * The board is a composite of six collections that already have one definition
 * each in `board.ts`, shared by the route that builds it and the island that
 * renders it. Re-declaring all six as Zod objects here would duplicate that
 * definition — the exact drift a schema is supposed to prevent — so the
 * boundary check is on the *container*: the payload must be an object whose six
 * collections are arrays and whose `today` is a date string.
 *
 * That still catches what a boundary check is for — a redirect, an error
 * envelope, a renamed envelope key — while the element shapes stay typed by the
 * single `FieldOpsBoard` type both sides compile against.
 */
const COLLECTIONS = [
  "tasks",
  "cities",
  "merchants",
  "transferRequests",
  "editRequests",
  "reports",
] as const;

export type BoardPayload = { board: FieldOpsBoard };

function isBoardPayload(value: unknown): value is BoardPayload {
  if (typeof value !== "object" || value === null) return false;
  const envelope = value as { board?: unknown };
  if (typeof envelope.board !== "object" || envelope.board === null) return false;

  const board = envelope.board as Record<string, unknown>;
  if (typeof board.today !== "string") return false;
  return COLLECTIONS.every((key) => Array.isArray(board[key]));
}

export const boardPayloadSchema = z.custom<BoardPayload>(isBoardPayload, {
  message: "Field operations board does not match the expected shape.",
});

/**
 * One row of the merchant directory.
 *
 * Every value is already display text: the labels are resolved where the
 * vocabulary lives (`CONTRACT_STATE_META`, `teamLabel`) and the amount is
 * formatted in the operator's locale, so the client formats nothing per row.
 */
export const merchantRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  vendorType: z.string(),
  vendorTypeId: z.number(),
  cityName: z.string(),
  teamLabel: z.string(),
  stateLabel: z.string(),
  stateTone: z.string(),
  commissionLabel: z.string(),
});

export type MerchantRow = z.infer<typeof merchantRowSchema>;

export const merchantRowsPayloadSchema = z.object({
  rows: z.array(merchantRowSchema),
});

export type MerchantRowsPayload = z.infer<typeof merchantRowsPayloadSchema>;
