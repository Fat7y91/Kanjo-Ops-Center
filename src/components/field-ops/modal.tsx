"use client";

import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
  closeOnBackdrop = false,
}: ModalProps) {
  const modalId = useId();

  useEffect(() => {
    if (!open) return;
    openStack.push(modalId);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (openStack[openStack.length - 1] !== modalId) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      const index = openStack.lastIndexOf(modalId);
      if (index !== -1) openStack.splice(index, 1);
      document.body.style.overflow = previous;
    };
  }, [open, onClose, modalId]);

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
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );

  return typeof document === "undefined"
    ? content
    : createPortal(content, document.body);
}
