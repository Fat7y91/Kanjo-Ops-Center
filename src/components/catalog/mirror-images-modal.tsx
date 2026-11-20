"use client";

import { useEffect } from "react";

import { useCatalogMirror } from "@/components/catalog/use-catalog-mirror";
import { Modal } from "@/components/field-ops/modal";
import { Button } from "@/components/ui/button";
import { needsMirroring } from "@/lib/catalog/images/hosted";
import type { CatalogProduct } from "@/lib/catalog/types";

type MirrorImagesModalProps = {
  open: boolean;
  merchantId: string;
  products: CatalogProduct[];
  onClose: () => void;
  onMirrored: (productId: string, url: string) => void;
  onEditProduct: (productId: string) => void;
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="autopilot-stat">
      <span>{label}</span>
      <strong>{value.toLocaleString("ar-EG")}</strong>
    </div>
  );
}

/**
 * Progress dialog for the mirror run.
 *
 * The counts are the whole story the operator needs: how many photos were
 * copied, how many were already stored, how many failed and how much is left.
 * Failed rows can be reopened in the product editor without leaving the run.
 */
export function MirrorImagesModal({
  open,
  merchantId,
  products,
  onClose,
  onMirrored,
  onEditProduct,
}: MirrorImagesModalProps) {
  const mirror = useCatalogMirror({ merchantId, onMirrored });
  const running = mirror.stage === "running";
  const pending = products.filter((product) =>
    needsMirroring(product.imageDataUrl),
  ).length;
  const processed = mirror.counts.mirrored + mirror.counts.failed;
  const remaining = Math.max(0, mirror.counts.total - processed);
  const percent =
    mirror.counts.total > 0
      ? Math.min(100, Math.round((processed / mirror.counts.total) * 100))
      : 0;

  useEffect(() => {
    if (open) mirror.reset();
  }, [open, mirror.reset]);

  return (
    <Modal
      open={open}
      title="توطين الصور على السيرفر"
      eyebrow="كتالوج التاجر"
      description="تُنسخ صور المنتجات إلى سيرفر كنجو ويُستبدل الرابط القديم برابط ثابت يعمل في ملف Excel."
      onClose={() => {
        if (!running) onClose();
      }}
      wide
    >
      <div className="autopilot-body">
        {mirror.counts.total === 0 && mirror.stage !== "done" ? (
          <p className="autopilot-note">
            {pending === 0
              ? "كل صور هذا الكتالوج موجودة بالفعل على السيرفر."
              : `يوجد ${pending.toLocaleString("ar-EG")} صورة بحاجة إلى توطين.`}
          </p>
        ) : null}

        <div
          className="autopilot-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="تقدم توطين الصور"
        >
          <span style={{ width: `${percent}%` }} />
        </div>

        <p className="autopilot-note">
          تم توطين: {mirror.counts.mirrored.toLocaleString("ar-EG")} | موجود
          مسبقاً على السيرفر:{" "}
          {mirror.counts.alreadyHosted.toLocaleString("ar-EG")} | فشل:{" "}
          {mirror.counts.failed.toLocaleString("ar-EG")} | المتبقي:{" "}
          {remaining.toLocaleString("ar-EG")}
        </p>

        <div className="autopilot-stats">
          <Stat label="تم التوطين" value={mirror.counts.mirrored} />
          <Stat label="موجود مسبقاً" value={mirror.counts.alreadyHosted} />
          <Stat label="فشل" value={mirror.counts.failed} />
          <Stat label="المتبقي" value={remaining} />
        </div>

        {mirror.error ? (
          <p className="form-error" role="alert">
            {mirror.error}
          </p>
        ) : null}

        {mirror.failures.length > 0 ? (
          <div>
            <p className="autopilot-note">الصور التي تعذر توطينها:</p>
            <ul className="autopilot-note">
              {mirror.failures.map((failure) => (
                <li key={failure.id}>
                  {failure.name}: {failure.reason}{" "}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onEditProduct(failure.id)}
                  >
                    تعديل الصورة
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="form-actions">
          {mirror.failures.length > 0 && mirror.stage === "done" ? (
            <Button
              variant="quiet"
              onClick={mirror.retryFailed}
            >
              إعادة المحاولة للفاشل فقط
            </Button>
          ) : null}

          {mirror.stage === "idle" ? (
            <Button
              variant="primary"
              onClick={() => mirror.start(products)}
              disabled={pending === 0}
            >
              بدء التوطين
            </Button>
          ) : null}

          {mirror.stage === "paused" ? (
            <Button variant="primary" onClick={mirror.resume}>
              استكمال
            </Button>
          ) : null}

          {running ? (
            <Button variant="quiet" onClick={mirror.pause}>
              إيقاف مؤقت
            </Button>
          ) : null}

          {running || mirror.stage === "paused" ? (
            <Button variant="ghost" onClick={mirror.cancel}>
              إلغاء
            </Button>
          ) : null}

          <Button variant="ghost" onClick={onClose} disabled={running}>
            إغلاق
          </Button>
        </div>
      </div>
    </Modal>
  );
}
