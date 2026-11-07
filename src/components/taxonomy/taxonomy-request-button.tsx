"use client";

import { useState } from "react";

import { usePermission } from "@/components/auth/use-permission";
import { TaxonomyDirectAddButton } from "@/components/taxonomy/taxonomy-direct-add";
import { TaxonomyRequestModal } from "@/components/taxonomy/taxonomy-request-modal";
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
  directLabel?: string;
  onRequested?: (message: string) => void;
};

export function TaxonomyRequestButton({
  kind,
  vendorTypes,
  vendorTypeId,
  suggestedName,
  label = `طلب إضافة ${TAXONOMY_KIND_META[kind].label}`,
  directLabel = `إضافة ${TAXONOMY_KIND_META[kind].label} مباشرة`,
  onRequested,
}: TaxonomyRequestButtonProps) {
  const { hasPermission } = usePermission();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  // A dedicated manager capability for this kind creates directly; the umbrella
  // `manage_categories` grant also implies direct entry for every kind.
  const canManageKind =
    hasPermission("manage_categories") ||
    (kind === "vendor_type" && hasPermission("manage_merchant_types")) ||
    (kind === "category" && hasPermission("manage_categories")) ||
    (kind === "variant" && hasPermission("manage_variables"));

  if (canManageKind) {
    return (
      <TaxonomyDirectAddButton
        kind={kind}
        vendorTypes={vendorTypes}
        label={directLabel}
        onCreated={(createdMessage) => {
          setMessage(createdMessage);
          onRequested?.(createdMessage);
        }}
      />
    );
  }

  if (!hasPermission("review_add_requests")) return null;

  return (
    <>
      <button
        type="button"
        className="button button-small button-quiet taxonomy-request-trigger"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

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
