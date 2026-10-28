"use client";

import { directWhatsappLink, sanitizePhone, telLink } from "@/lib/field-ops/phone";
import type { FollowUpKind } from "@/lib/field-ops/types";

type FollowUpActionsProps = {
  kind: FollowUpKind | null | undefined;
  number: string | null | undefined;
  merchantName: string;
  whatsappMessage?: string;
  size?: "small" | "default";
};

/**
 * Direct, clickable channel actions for a communication follow-up.
 *
 * Renders nothing for `visit` follow-ups (or when the stored number is not
 * dialable), so callers can drop it into any row without extra conditionals.
 */
export function FollowUpActions({
  kind,
  number,
  merchantName,
  whatsappMessage,
  size = "small",
}: FollowUpActionsProps) {
  if (!kind || kind === "visit") return null;
  if (sanitizePhone(number).length < 8) return null;

  const sizeClass = size === "small" ? " button-small" : "";

  if (kind === "whatsapp") {
    const href = directWhatsappLink(
      number,
      whatsappMessage ?? `مرحباً ${merchantName}، بخصوص متابعة الاتفاق.`,
    );
    if (!href) return null;
    return (
      <a
        href={href}
        className={`button${sizeClass} button-whatsapp`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`تواصل واتساب مع ${merchantName}`}
      >
        تواصل واتساب
      </a>
    );
  }

  const href = telLink(number);
  if (!href) return null;
  return (
    <a
      href={href}
      className={`button${sizeClass} button-call`}
      aria-label={`إتصال مباشر مع ${merchantName}`}
    >
      إتصال مباشر
    </a>
  );
}
