import type { MerchantTimelineEntry } from "@/lib/field-ops/store";
import type { MerchantDocument } from "@/lib/field-ops/types";

export const DOCUMENT_TYPES: Array<{
  value: MerchantDocument["type"];
  label: string;
}> = [
  { value: "contract", label: "عقد" },
  { value: "tax", label: "مستند ضريبي" },
  { value: "license", label: "ترخيص" },
  { value: "other", label: "أخرى" },
];

export const TASK_STATUS_LABEL: Record<string, string> = {
  scheduled: "مجدولة",
  completed: "مكتملة",
};

export const TIMELINE_LABEL: Record<MerchantTimelineEntry["kind"], string> = {
  visit: "زيارة",
  override: "تجاوز حالة",
  document: "مستند",
  follow_up: "متابعة",
};

export const TIMELINE_TONE: Record<MerchantTimelineEntry["kind"], string> = {
  visit: "badge-purple",
  override: "badge-gold",
  document: "badge-blue",
  follow_up: "badge-green",
};
