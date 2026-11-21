import { CUSTODY_ITEM_LABEL, type CustodyItemDraft } from "./types";

export const DEFAULT_HANDOVER_OFFICER = "م/ محمود الجمل";
export const DEFAULT_CASH_CUSTODY = 2000;

const DEFAULT_CONDITION = "جديد";

export const DEFAULT_CUSTODY_ITEMS: readonly CustodyItemDraft[] = [
  {
    key: "HB",
    label: CUSTODY_ITEM_LABEL.HB,
    codePrefix: "HB",
    quantity: 1,
    condition: DEFAULT_CONDITION,
    unitPrice: 3500,
  },
  {
    key: "HP",
    label: CUSTODY_ITEM_LABEL.HP,
    codePrefix: "HP",
    quantity: 0,
    condition: DEFAULT_CONDITION,
    unitPrice: 0,
  },
  {
    key: "TSH",
    label: CUSTODY_ITEM_LABEL.TSH,
    codePrefix: "TSH",
    quantity: 2,
    condition: DEFAULT_CONDITION,
    unitPrice: 420,
  },
  {
    key: "CAP",
    label: CUSTODY_ITEM_LABEL.CAP,
    codePrefix: "CAP",
    quantity: 1,
    condition: DEFAULT_CONDITION,
    unitPrice: 160,
  },
  {
    key: "OTHER",
    label: CUSTODY_ITEM_LABEL.OTHER,
    codePrefix: null,
    quantity: 0,
    condition: DEFAULT_CONDITION,
    unitPrice: 0,
  },
];

export function buildDefaultItems(): CustodyItemDraft[] {
  return DEFAULT_CUSTODY_ITEMS.map((item) => ({ ...item }));
}
