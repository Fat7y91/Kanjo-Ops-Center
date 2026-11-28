import type { VisitFormField } from "./validate-visit-form";

/**
 * Stable DOM id for a field the visit form can fail on.
 *
 * The report form is far taller than the viewport and the Save button sits at
 * the bottom, so a rep who forgets the merchant's mobile sees "nothing happen"
 * while the message sits off-screen. Each control carries this id so the form
 * can scroll the failing field into view instead of trusting the rep to find it.
 */
export function visitFieldId(field: VisitFormField): string {
  return `visit-field-${field}`;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Bring the first invalid field into view and focus it.
 *
 * Order matters: `scrollIntoView` positions the field before focus is moved,
 * and `preventScroll` on `focus` keeps the browser from re-scrolling a second
 * time (which reads as a jump on long forms). Elements that cannot take focus
 * on their own — the outcome card group, the custom weight slider — carry
 * `tabIndex={-1}` at the call site so they still receive focus for screen
 * readers.
 */
export function focusVisitField(field: VisitFormField): void {
  if (typeof document === "undefined") return;
  const element = document.getElementById(visitFieldId(field));
  if (!element) return;

  element.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "center",
  });

  if (typeof (element as HTMLElement).focus === "function") {
    (element as HTMLElement).focus({ preventScroll: true });
  }
}
