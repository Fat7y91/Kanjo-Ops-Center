"use client";

import { useEffect, useState } from "react";

import { ImageQaCard } from "@/components/catalog/image-qa-card";
import { LightboxModal } from "@/components/catalog/lightbox-modal";
import { useImageQaBoard } from "@/components/catalog/use-image-qa-board";
import type { CatalogProduct } from "@/lib/catalog/types";

type ImageQaBoardProps = {
  initialProducts: CatalogProduct[];
};

/**
 * Image QA workspace client shell.
 *
 * Renders the reviewer queue from server-provided pending products and wires the
 * cards to the controller hook. No domain rules live here.
 */
export function ImageQaBoard({ initialProducts }: ImageQaBoardProps) {
  const board = useImageQaBoard({ initialProducts });
  const [lightbox, setLightbox] = useState<CatalogProduct | null>(null);

  useEffect(() => {
    if (!board.message) return;
    const timer = window.setTimeout(board.clearMessage, 4000);
    return () => window.clearTimeout(timer);
  }, [board.message, board.clearMessage]);

  return (
    <>
      {board.error ? (
        <p className="form-error" role="alert">
          {board.error}
        </p>
      ) : null}

      {board.count === 0 ? (
        <p className="empty-state">
          لا توجد صور بانتظار المراجعة في نطاق مدنك حالياً.
        </p>
      ) : (
        <section className="img-qa-grid">
          {board.products.map((product) => (
            <ImageQaCard
              key={product.id}
              product={product}
              busy={board.busyId === product.id}
              preparing={board.preparingId === product.id}
              onDownload={() => board.downloadOriginal(product)}
              onApprove={() => void board.approve(product)}
              onUploadEnhanced={(file) => void board.uploadEnhanced(product, file)}
              onOpenImage={() => setLightbox(product)}
            />
          ))}
        </section>
      )}

      <LightboxModal
        src={lightbox?.imageDataUrl ?? null}
        alt={lightbox?.name ?? ""}
        onClose={() => setLightbox(null)}
      />

      {board.message ? (
        <div className="toast" role="status">
          {board.message}
        </div>
      ) : null}
    </>
  );
}
