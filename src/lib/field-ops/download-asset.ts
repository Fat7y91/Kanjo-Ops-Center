/** Best-effort browser download of a remote image asset. */

function fileNameFromUrl(url: string, fallback: string): string {
  try {
    const { pathname } = new URL(url);
    const last = pathname.split("/").pop();
    return last && last.includes(".") ? last : fallback;
  } catch {
    return fallback;
  }
}

function saveBlob(blob: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

/**
 * Downloads an image served from another origin.
 *
 * The `download` attribute is ignored for cross-origin links, so we fetch the
 * bytes and save them through a blob URL. If the host blocks CORS we cannot
 * read the body; the honest fallback is to open the image in a new tab so the
 * operator can still save it rather than getting a silent failure.
 */
export async function downloadAsset(
  url: string,
  fallbackName: string,
): Promise<void> {
  const fileName = fileNameFromUrl(url, fallbackName);
  try {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    saveBlob(blob, fileName);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
