"use client";

import { useState } from "react";

import { usePermission } from "@/components/auth/use-permission";
import { TaxonomyRequestModal } from "@/components/taxonomy/taxonomy-request-modal";
import { Button } from "@/components/ui/button";
import type {
  TaxonomyKind,
  TaxonomyVendorType,
} from "@/lib/taxonomy/types";
import { TAXONOMY_KIND_META } from "@/lib/taxonomy/types";

type TaxonomyRequestButtonProps = {
  kind: TaxonomyKind;
  vendorTypes: TaxonomyVendorType[];
  vendorTypeId?: number | null;
  suggestedName?: string;
  label?: string;
  onRequested?: (message: string) => void;
};

/**
 * Requests a new taxonomy entry for central review.
 *
 * There is no direct-create path by design: every vendor type, category and
 * variant enters the catalog through the central dashboard sheet, then a
 * reviewer links the official Dashboard ID back to the request. That keeps a
 * single source of truth for ids and stops the catalog inventing local ones.
 */
export function TaxonomyRequestButton({
  kind,
  vendorTypes,
  vendorTypeId,
  suggestedName,
  label = `طلب إضافة ${TAXONOMY_KIND_META[kind].label}`,
  onRequested,
}: TaxonomyRequestButtonProps) {
  const { hasPermission } = usePermission();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  if (!hasPermission("review_add_requests")) return null;

  return (
    <>
      <Button
        variant="quiet"
        size="sm"
        className="taxonomy-request-trigger"
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>

      <TaxonomyRequestModal
        open={open}
        kind={kind}
        vendorTypes={vendorTypes}
        defaultVendorTypeId={vendorTypeId ?? null}
        suggestedName={suggestedName}
        onClose={() => setOpen(false)}
        onDone={(doneMessage) => {
          setMessage(doneMessage);
          onRequested?.(doneMessage);
        }}
      />

      {message && !onRequested ? (
        <p className="taxonomy-request-note" role="status">
          {message}
        </p>
      ) : null}
    </>
  );
}
