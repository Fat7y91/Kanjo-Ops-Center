/**
 * Shapes for the drill-down view of a single journal entry.
 *
 * The ledger rows on the treasury and clearinghouse screens show one line each.
 * The drill-down answers the audit question behind that line: the full
 * double-entry voucher — both sides, the party, the reason, the reference and
 * the attached receipt.
 */

export type JournalPartyType = "merchant" | "courier" | "bank" | "customer";

/** One side of the posted entry, resolved to a human label. */
export type JournalLineDetail = {
  id: string;
  code: string;
  name: string;
  side: "debit" | "credit";
  amount: number;
  memo: string;
  partyType: JournalPartyType | null;
  /** Resolved party name when the line is a party sub-account. */
  partyName: string | null;
};

export type JournalReceipt = {
  receiptNo: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  /** Short-lived signed URL; null when storage could not sign it. */
  url: string | null;
};

export type JournalEntryDetail = {
  entryId: string;
  entryNo: string;
  entryDate: string;
  createdAt: string;
  memo: string;
  sourceType: string;
  sourceId: string | null;
  currency: "EGP" | "SAR";
  lines: JournalLineDetail[];
  debitTotal: number;
  creditTotal: number;
  parties: {
    merchants: string[];
    couriers: string[];
  };
  receipt: JournalReceipt | null;
};

/** Name maps resolved at read time from the merchant/courier rosters. */
export type JournalPartyNames = {
  merchants: Map<string, string>;
  couriers: Map<string, string>;
};
