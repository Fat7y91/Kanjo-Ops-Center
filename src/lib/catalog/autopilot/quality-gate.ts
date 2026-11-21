import { normalizeSearchText } from "@/lib/search/normalize";

/**
 * Quality gate for reuse of reference-catalog text.
 *
 * The reference merchant was imported from a messy source, so its image can be
 * reused but its name/description/category cannot be trusted blindly. This pure
 * audit decides what is safe to copy and flags the rest for the pharmacist.
 */

export type ReferenceTextInput = {
  name: string;
  description?: string | null;
  categoryKey?: string | null;
  imageUrl?: string | null;
};

export type ReferenceTextAudit = {
  nameValid: boolean;
  descriptionValid: boolean;
  categoryValid: boolean;
  imageValid: boolean;
  needsReview: boolean;
  reasons: string[];
};

const PLACEHOLDER = /^(غير محدد|غير معروف|بدون|بدون اسم|بدون وصف|بدون تصنيف|منتج|صنف|n\/a|na|none|null|test|dummy|lorem ipsum|undefined|-+)$/i;

export function cleanProductDescription(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

function letterCount(value: string): number {
  return (value.match(/\p{L}/gu) ?? []).length;
}

function validName(value: string): boolean {
  const cleaned = value.replace(/^[^\p{L}\p{N}]+/u, "").trim();
  if (!cleaned || PLACEHOLDER.test(normalizeSearchText(cleaned))) return false;
  return letterCount(cleaned) >= 3;
}

function validDescription(value: string, name: string): boolean {
  const cleaned = cleanProductDescription(value);
  if (!cleaned || cleaned.length < 8) return false;
  if (PLACEHOLDER.test(normalizeSearchText(cleaned))) return false;
  if (normalizeSearchText(cleaned) === normalizeSearchText(name)) return false;
  return letterCount(cleaned) >= 3;
}

function validCategory(value: string | null | undefined): boolean {
  const cleaned = (value ?? "").trim();
  if (!cleaned) return false;
  return !PLACEHOLDER.test(normalizeSearchText(cleaned));
}

function validImage(value: string | null | undefined): boolean {
  const cleaned = (value ?? "").trim();
  return /^https?:\/\//i.test(cleaned) || cleaned.includes("/api/catalog/images/");
}

export function auditReferenceText(input: ReferenceTextInput): ReferenceTextAudit {
  const reasons: string[] = [];
  const nameValid = validName(input.name);
  const descriptionValid = validDescription(input.description ?? "", input.name);
  const categoryValid = validCategory(input.categoryKey);
  const imageValid = validImage(input.imageUrl);

  if (!nameValid) reasons.push("اسم المرجع غير صالح");
  if (!descriptionValid) reasons.push("وصف المرجع غير صالح");
  if (!categoryValid) reasons.push("تصنيف المرجع غير محدد");
  if (!imageValid) reasons.push("صورة المرجع غير متاحة");

  return {
    nameValid,
    descriptionValid,
    categoryValid,
    imageValid,
    needsReview: reasons.length > 0,
    reasons,
  };
}

/**
 * Factual fallback copy when the reference description cannot be reused: the
 * product's own name plus its manufacturer, never invented claims.
 */
export function neutralDescription(parts: {
  name: string;
  company?: string | null;
}): string {
  return [parts.name.trim(), (parts.company ?? "").trim()]
    .filter(Boolean)
    .join(" — ");
}
