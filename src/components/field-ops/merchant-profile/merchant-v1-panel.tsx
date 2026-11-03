"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CheckboxField, TextField } from "@/components/ui/form-inputs";
import type { MerchantV1Profile } from "@/lib/field-ops/types";

import { useMerchantV1Profile } from "./use-merchant-v1-profile";

type MerchantV1PanelProps = {
  merchantId: string;
  merchantName: string;
  profile: MerchantV1Profile;
  canEditSocials: boolean;
  canTogglePublish: boolean;
  canManageVip: boolean;
  canExport: boolean;
  onAnnounce: (message: string) => void;
};

/**
 * V1 parity block for the merchant card.
 *
 * Address/socials, the app publish switch, the VIP listing flag and the export
 * actions each sit behind their own capability, so the panel renders the whole
 * section and disables only the controls the viewer cannot use. Drive and Excel
 * are plain links, never a client-side export of data the caller cannot read.
 */
export function MerchantV1Panel({
  merchantId,
  merchantName,
  profile,
  canEditSocials,
  canTogglePublish,
  canManageVip,
  canExport,
  onAnnounce,
}: MerchantV1PanelProps) {
  const { draft, setField, saveSocials, toggleFlag, saving, error } =
    useMerchantV1Profile({ merchantId, profile, onAnnounce });
  const [socialsOpen, setSocialsOpen] = useState(false);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">بيانات التشغيل</p>
          <h2>العنوان والنشر والملفات</h2>
        </div>
        <div className="profile-badges">
          <span
            className={`badge ${profile.appPublished ? "badge-green" : "badge-gold"}`}
          >
            {profile.appPublished ? "منشور في التطبيق" : "غير منشور"}
          </span>
          {profile.vipMenu ? (
            <span className="badge badge-purple">قائمة VIP</span>
          ) : null}
        </div>
      </div>

      <div className="detail-grid detail-grid-wide">
        <div>
          <span className="detail-label">العنوان الفعلي</span>
          <strong>{profile.actualAddress || "غير محدد"}</strong>
        </div>
        <div>
          <span className="detail-label">فيسبوك</span>
          <strong>
            {profile.facebookUrl ? (
              <a href={profile.facebookUrl} target="_blank" rel="noreferrer">
                فتح الصفحة
              </a>
            ) : (
              "غير مضاف"
            )}
          </strong>
        </div>
        <div>
          <span className="detail-label">إنستغرام / الموقع</span>
          <strong>
            {profile.instagramUrl ? (
              <a href={profile.instagramUrl} target="_blank" rel="noreferrer">
                فتح الرابط
              </a>
            ) : (
              "غير مضاف"
            )}
          </strong>
        </div>
      </div>

      {error ? <p className="inline-note">{error}</p> : null}

      {canEditSocials ? (
        socialsOpen ? (
          <div className="form-stack">
            <TextField
              label="العنوان الفعلي"
              value={draft.actualAddress}
              onChange={(event) => setField("actualAddress", event.target.value)}
            />
            <TextField
              label="رابط فيسبوك"
              value={draft.facebookUrl}
              onChange={(event) => setField("facebookUrl", event.target.value)}
            />
            <TextField
              label="إنستغرام أو الموقع"
              value={draft.instagramUrl}
              onChange={(event) => setField("instagramUrl", event.target.value)}
            />
            <div className="profile-actions">
              <Button
                variant="primary"
                size="sm"
                disabled={saving}
                onClick={async () => {
                  const saved = await saveSocials();
                  if (saved) setSocialsOpen(false);
                }}
              >
                حفظ بيانات التواصل
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSocialsOpen(false)}
              >
                إلغاء
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="quiet"
            size="sm"
            onClick={() => setSocialsOpen(true)}
          >
            تعديل العنوان والروابط
          </Button>
        )
      ) : null}

      <div className="form-stack">
        {canTogglePublish ? (
          <CheckboxField
            label="منشور ومتزامن مع التطبيق"
            hint="يظهر التاجر ومنتجاته للعملاء في تطبيق كانجو."
            checked={profile.appPublished}
            disabled={saving}
            onChange={(checked) => toggleFlag("appPublished", checked)}
          />
        ) : null}
        {canManageVip ? (
          <CheckboxField
            label="تحت التعاقد (VIP / عرض مبدئي)"
            hint="يسمح بإدراج المنيو دون اتفاق عمولة نهائي."
            checked={profile.vipMenu}
            disabled={saving}
            onChange={(checked) => toggleFlag("vipMenu", checked)}
          />
        ) : null}
      </div>

      {canExport ? (
        <div className="profile-actions">
          {profile.driveFolderUrl ? (
            <a
              href={profile.driveFolderUrl}
              className="button button-quiet"
              target="_blank"
              rel="noreferrer"
            >
              ملفات التاجر الرسمية
            </a>
          ) : (
            <span className="inline-note">لم يُضف مجلد درايف الرسمي بعد.</span>
          )}
          <a
            href={`/api/field-ops/merchants/${merchantId}/export`}
            className="button button-quiet"
            download
          >
            Export Kanjo Excel
          </a>
        </div>
      ) : null}

      <p className="inline-note">
        {merchantName} · آخر تحديث{" "}
        {profile.updatedAt ? profile.updatedAt.slice(0, 10) : "—"}
      </p>
    </div>
  );
}
