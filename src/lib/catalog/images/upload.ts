"use client";

/**
 * Uploads a freshly captured photo and returns its public URL.
 *
 * Called while the operator is online so the draft queue and product rows only
 * ever carry a short URL. Callers fall back to the prepared data URL when this
 * rejects (offline capture); the server converts it on write in that case.
 */
export async function uploadCatalogImage(
  dataUrl: string,
  merchantId: string | null = null,
): Promise<string> {
  const response = await fetch("/api/catalog/images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl, merchantId }),
  });
  if (!response.ok) {
    throw new Error(`IMAGE_UPLOAD_FAILED:${response.status}`);
  }
  const payload = (await response.json()) as { url?: unknown };
  if (typeof payload.url !== "string" || !/^https?:\/\//i.test(payload.url)) {
    throw new Error("IMAGE_UPLOAD_INVALID_RESPONSE");
  }
  return payload.url;
}
