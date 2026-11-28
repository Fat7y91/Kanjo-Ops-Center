/**
 * Build a `wa.me` deep link for a registered merchant mobile number.
 *
 * Numbers stored by reps are usually local Egyptian formats ("01012345678",
 * "+20 101 234 5678", "0020101..."). WhatsApp requires a bare international
 * number with no symbols, so we normalize to the 20 country code.
 */
export function whatsappNumber(mobile: string | null | undefined): string | null {
  const raw = (mobile ?? "").replace(/[^\d+]/g, "");
  if (!raw) return null;

  let digits = raw.replace(/\+/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("20")) return digits;
  if (digits.startsWith("0")) return `20${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("1")) return `20${digits}`;
  return digits.length >= 8 ? digits : null;
}

export function whatsappLink(
  mobile: string | null | undefined,
  message?: string,
): string | null {
  const number = whatsappNumber(mobile);
  if (!number) return null;
  const query = message?.trim()
    ? `?text=${encodeURIComponent(message.trim())}`
    : "";
  return `https://wa.me/${number}${query}`;
}
