"use client";

import { useEffect, useState } from "react";

import type { CatalogMerchantOption } from "@/components/catalog/merchant-picker";
import { DraftQueueBanner } from "@/components/catalog/draft-queue-banner";
import { ProductForm } from "@/components/catalog/product-form";
import {
  useProductEntry,
  type SaveMode,
} from "@/components/catalog/use-product-entry";
import { Modal } from "@/components/field-ops/modal";
import { removeDraft } from "@/lib/catalog/draft-queue";
import { useCatalogDraftQueue } from "@/lib/catalog/use-draft-queue";
import type {
  TaxonomyCategory,
  TaxonomyVariant,
  TaxonomyVendorType,
} from "@/lib/taxonomy/types";

type ProductEntryProps = {
  open: boolean;
  merchants: CatalogMerchantOption[];
  vendorTypes: TaxonomyVendorType[];
  categories: TaxonomyCategory[];
  variants: TaxonomyVariant[];
  onClose: () => void;
  onSynced: () => void;
};

/**
 * "Add product" container: offline queue banner + entry modal.
 *
 * Every save writes to the local draft queue first; the banner is the only
 * surface that talks to the server, and it stays visible with the modal closed.
 */
export function ProductEntry({
  open,
  merchants,
  vendorTypes,
  categories,
  variants,
  onClose,
  onSynced,
}: ProductEntryProps) {
  const queue = useCatalogDraftQueue();
  const entry = useProductEntry({ variants, refreshQueue: queue.refresh });
  const [toast, setToast] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setToast(""), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Uploads are manual-only, so this refresh fires exactly when the rep presses
  // "رفع الكل الآن". Depending on the outcome object (not just its count) makes
  // repeated 1-item flushes refire.
  const lastOutcome = queue.lastOutcome;
  useEffect(() => {
    if (lastOutcome && lastOutcome.synced > 0) onSynced();
  }, [lastOutcome, onSynced]);

  async function uploadAll() {
    const outcome = await queue.flush();
    if (!outcome) return;
    if (outcome.synced > 0) {
      setToast(`تم رفع ${outcome.synced} منتج إلى الكتالوج.`);
    }
    if (outcome.failed > 0) {
      setToast(`${outcome.failed} منتج لم يُرفع — ما زال في المسودة.`);
    }
    if (outcome.synced === 0 && outcome.failed === 0) {
      setToast("لا يوجد اتصال — بقيت المسودات محفوظة محلياً.");
    }
  }

  async function handleSave(mode: SaveMode) {
    const saved = await entry.save(mode);
    if (!saved) return;
    setToast(
      mode === "another"
        ? "تم الحفظ. التاجر محتفظ به لإدخال المنتج التالي."
        : "تم حفظ المنتج في المسودة.",
    );
    if (mode === "close") onClose();
  }

  return (
    <>
      <DraftQueueBanner
        drafts={queue.drafts}
        syncing={queue.syncing}
        online={queue.online}
        onUploadAll={() => void uploadAll()}
        onRemove={(clientProductId) => {
          void removeDraft(clientProductId).then(queue.refresh);
        }}
      />

      <Modal
        open={open}
        title="إضافة منتج إلى الكتالوج"
        eyebrow="إدخال ميداني"
        description="يُحفظ المنتج محلياً أولاً ثم يُرفع إلى الكتالوج، حتى لو انقطع الاتصال."
        onClose={() => {
          if (!entry.busy) onClose();
        }}
        wide
      >
        <ProductForm
          values={entry.values}
          merchants={merchants}
          vendorTypes={vendorTypes}
          categories={categories}
          variants={variants}
          onChange={entry.patch}
          onMerchantChange={entry.changeMerchant}
          onSave={(mode) => void handleSave(mode)}
          onCancel={onClose}
          error={entry.error}
          submitting={entry.busy}
        />
      </Modal>

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}
