"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef } from "react";

import { lockBodyScroll, unlockBodyScroll } from "@/lib/ui/scroll-lock";

import { CatalogImage } from "@/components/catalog/catalog-image";
import { resolveDisplayImageUrl } from "@/lib/catalog/format";

type LightboxModalProps = {
  src: string | null;
  alt: string;
  onClose: () => void;
};

/** Full-resolution image viewer. Click the backdrop or press Escape to close. */
export function LightboxModal({ src, alt, onClose }: LightboxModalProps) {
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!src) return;
    lockBodyScroll();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockBodyScroll();
    };
  }, [src]);

  if (!src || typeof document === "undefined") return null;

  const resolvedSrc = resolveDisplayImageUrl(src);
  if (!resolvedSrc) return null;

  return createPortal(
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`صورة ${alt}`}
      onClick={onClose}
    >
      <button
        type="button"
        className="lightbox-close"
        onClick={onClose}
        aria-label="إغلاق الصورة"
      >
        ×
      </button>
      <CatalogImage
        className="lightbox-image"
        src={src}
        alt={alt}
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body,
  );
}
