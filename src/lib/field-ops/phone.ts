import type { FollowUpKind } from "@/lib/field-ops/types";
import { whatsappNumber } from "@/lib/field-ops/whatsapp";

/**
 * Strip every character that is not a digit. Used to validate that a stored
 * follow-up number is actually dialable before rendering channel actions.
 */
export function sanitizePhone(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** True for the follow-up channels that need a dialable contact number. */
export function isCommunicationKind(kind: FollowUpKind | null | undefined): boolean {
  return kind === "call" || kind === "whatsapp";
}

/** Build a `tel:` deep link from a sanitized number, or null when invalid. */
export function telLink(value: string | null | undefined): string | null {
  const digits = sanitizePhone(value);
  return digits.length >= 8 ? `tel:${digits}` : null;
}

/**
 * Build a `wa.me` deep link. Reuses the shared number normalizer so local
 * Egyptian formats ("0101...", "00201...") still reach the right chat; the
 * generic sanitizer alone would emit an unreachable `wa.me/0101...` link.
 */
export function directWhatsappLink(
  value: string | null | undefined,
  message?: string,
): string | null {
  const number = whatsappNumber(value);
  if (!number) return null;
  const query = message?.trim()
    ? `?text=${encodeURIComponent(message.trim())}`
    : "";
  return `https://wa.me/${number}${query}`;
}
