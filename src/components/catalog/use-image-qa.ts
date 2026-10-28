"use client";

import { useCallback, useState } from "react";

import type { CatalogProduct } from "@/lib/catalog/types";

type UseImageQaArgs = {
  onUpdated: (product: CatalogProduct, revision?: number) => void;
};

/**
 * Image QA mutations.
 *
 * All three actions converge on the same endpoint; the only difference is
 * whether an enhanced image is included in the payload.
 */
export function useImageQa({ onUpdated }: UseImageQaArgs) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const complete = useCallback(
    async (product: CatalogProduct, imageDataUrl?: string) => {
      setBusyId(product.id);
      setError("");
      setMessage("");
      try {
        const response = await fetch(
          `/api/catalog/products/${product.id}/image-qa`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              imageDataUrl === undefined
                ? {}
                : { imageDataUrl },
            ),
          },
        );
        const payload = (await response.json()) as {
          product?: CatalogProduct;
          revision?: number;
          error?: string;
        };
        if (!response.ok || !payload.product) {
          setError(payload.error ?? "تعذر إكمال مراجعة الصورة.");
          return false;
        }
        const updated = payload.product;
        onUpdated(updated, payload.revision);
        setMessage(
          imageDataUrl === undefined
            ? `تم اعتماد صورة «${updated.name}».`
            : `تم استبدال صورة «${updated.name}» واعتمادها.`,
        );
        return true;
      } catch {
        setError("تعذر الوصول إلى الخادم. أعد المحاولة.");
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [onUpdated],
  );

  const downloadOriginal = useCallback((product: CatalogProduct) => {
    if (!product.imageDataUrl) {
      setError("لا توجد صورة أصلية لهذا المنتج.");
      return;
    }
    const link = document.createElement("a");
    link.href = product.imageDataUrl;
    link.download = `${product.sku || product.id}-original`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, []);

  const clearMessage = useCallback(() => setMessage(""), []);

  return {
    busyId,
    error,
    message,
    approve: (product: CatalogProduct) => complete(product),
    uploadEnhanced: (product: CatalogProduct, dataUrl: string) =>
      complete(product, dataUrl),
    downloadOriginal,
    clearMessage,
  };
}
