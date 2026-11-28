"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { lockBodyScroll, unlockBodyScroll } from "@/lib/ui/scroll-lock";

/**
 * Dialogs can open on top of one another (a voucher opened from a statement).
 * Every stacked dialog listens for Escape, so without an order only the top one
 * may react — otherwise a single Escape would close the whole chain.
 */
const openStack: string[] = [];

type ModalProps = {
  open: boolean;
  title: string;
  eyebrow?: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** Hides the visual header; the dialog keeps its accessible title. */
  hideHeader?: boolean;
  /**
   * Closing when the backdrop is clicked is opt-in. A stray click while filling
   * a form should not discard entered data, so the default keeps the dialog
   * open and the user closes it through the explicit controls.
   */
  closeOnBackdrop?: boolean;
};

export function Modal({
  open,
  title,
  eyebrow,
  description,
  onClose,
  children,
  wide = false,
  hideHeader = false,
  closeOnBackdrop = false,
}: ModalProps) {
  const modalId = useId();
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    openStack.push(modalId);
    lockBodyScroll();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (openStack[openStack.length - 1] !== modalId) return;
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const index = openStack.lastIndexOf(modalId);
      if (index !== -1) openStack.splice(index, 1);
      unlockBodyScroll();
    };
  }, [open, modalId]);

  if (!open) return null;

  const content = (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={`modal-card${wide ? " modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        {hideHeader ? null : (
          <div className="modal-head">
            <div>
              {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
              <h2>{title}</h2>
              {description ? <p className="modal-note">{description}</p> : null}
            </div>
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label="إغلاق النافذة"
            >
              ×
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );

  return typeof document === "undefined"
    ? content
    : createPortal(content, document.body);
}
