import "server-only";

import { JournalError } from "./errors";
import { loadJournalEntry } from "./repository";
import type { JournalEntryDetail } from "./types";

/**
 * The voucher shown when an operator clicks a ledger row.
 *
 * A missing entry answers 404: an empty voucher would read as a zeroed entry and
 * hide the fact that the row points nowhere. Everything else is a plain read, so
 * this service only adds the not-found translation.
 */
export async function loadEntryVoucher(
  entryId: string,
): Promise<JournalEntryDetail> {
  const entry = await loadJournalEntry(entryId);
  if (!entry) {
    throw new JournalError("JOURNAL_ENTRY_NOT_FOUND", "القيد غير موجود.", 404);
  }
  return entry;
}
