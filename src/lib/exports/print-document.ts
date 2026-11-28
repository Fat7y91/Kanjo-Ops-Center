/**
 * Opens the browser print dialog with a descriptive document title.
 *
 * "Save as PDF" derives the suggested filename from `document.title`, so a
 * generic app title would produce an unnamed file. The previous title is
 * restored when the dialog closes (`afterprint`), once for safety.
 */
export function printWithDocumentTitle(title: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const previous = document.title;
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    document.title = previous;
    window.removeEventListener("afterprint", restore);
  };

  window.addEventListener("afterprint", restore);
  document.title = title;
  window.print();
}
