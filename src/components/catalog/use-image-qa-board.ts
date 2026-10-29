"use client";

import { useCallback, useMemo, useState } from "react";

import {
  approveProductImage,
  uploadEnhancedProductImage,
  type ImageQaActionResult,
} from "@/app/(workspace)/catalog/qa/actions";
import { prepareImage } from "@/lib/catalog/image";
import type { CatalogProduct } from "@/lib/catalog/types";

type UseImageQaBoardArgs = {
  initialProducts: CatalogProduct[];
};

/**
 * Image QA view controller (Tier 1 glue).
 *
 * The page is a server component; this hook owns client state, optimistic list
 * updates and the calls into the Tier 2 server actions. It never re-implements
 * a domain rule.
 */
export function useImageQaBoard({ initialProducts }: UseImageQaBoardArgs) {
  const [products, setProducts] = useState<CatalogProduct[]>(initialProducts);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const count = products.length;

  const remove = useCallback((productId: string) => {
    setProducts((current) => current.filter((item) => item.id !== productId));
  }, []);

  const run = useCallback(
    async (productId: string, action: () => Promise<ImageQaActionResult>) => {
      setBusyId(productId);
      setError("");
      setMessage("");
      try {
        const result = await action();
        if (!result.ok) {
          setError(result.error ?? "تعذر إكمال مراجعة الصورة.");
          return false;
        }
        remove(productId);
        setMessage(
          result.product
            ? `تم اعتماد صورة «${result.product.name}».`
            : "تم اعتماد الصورة.",
        );
        return true;
      } catch {
        setError("تعذر الوصول إلى الخادم. أعد المحاولة.");
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [remove],
  );

  const approve = useCallback(
    (product: CatalogProduct) =>
      run(product.id, () => approveProductImage(product.id)),
    [run],
  );

  const uploadEnhanced = useCallback(
    async (product: CatalogProduct, file: File) => {
      setPreparingId(product.id);
      setError("");
      try {
        const prepared = await prepareImage(file);
        await run(product.id, () =>
          uploadEnhancedProductImage(product.id, prepared.dataUrl),
        );
      } catch {
        setError("تعذر معالجة الصورة المحسّنة. جرّب صورة أخرى.");
      } finally {
        setPreparingId(null);
      }
    },
    [run],
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

  return useMemo(
    () => ({
      products,
      count,
      busyId,
      preparingId,
      error,
      message,
      approve,
      uploadEnhanced,
      downloadOriginal,
      clearMessage,
    }),
    [
      products,
      count,
      busyId,
      preparingId,
      error,
      message,
      approve,
      uploadEnhanced,
      downloadOriginal,
      clearMessage,
    ],
  );
}
