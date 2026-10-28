"use client";

import { Protect } from "@/components/auth/protect";
import { CONTRACT_STATE_META } from "@/lib/field-ops/types";
import type { Merchant } from "@/lib/field-ops/types";

import { formatAmount } from "@/lib/field-ops/format";

type EconomicsPanelProps = {
  merchant: Merchant;
  canViewFieldOps: boolean;
  otherTeam: boolean;
  onRequestEdit: () => void;
  onOpenSign: () => void;
};

export function EconomicsPanel({
  merchant,
  canViewFieldOps,
  otherTeam,
  onRequestEdit,
  onOpenSign,
}: EconomicsPanelProps) {
  const meta = CONTRACT_STATE_META[merchant.contractState];
  const finalLocked =
    merchant.contractState === "final_contract" && !merchant.editUnlocked;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">الجوانب التجارية</p>
          <h2>اقتصاديات الاتفاق</h2>
        </div>
      </div>
      <div className="detail-grid detail-grid-wide">
        <div>
          <span className="detail-label">القيمة الشهرية</span>
          <strong>{formatAmount(merchant.monthlyValue)}</strong>
        </div>
        <div>
          <span className="detail-label">العمولة المستهدفة</span>
          <strong>{merchant.targetCommission}%</strong>
        </div>
        <div>
          <span className="detail-label">النسبة المتفق عليها</span>
          <strong>
            {merchant.agreedCommission != null
              ? `${merchant.agreedCommission}%`
              : "لم تُحدَّد"}
          </strong>
        </div>
        <div>
          <span className="detail-label">العمولة المكتسبة</span>
          <strong>{formatAmount(merchant.commissionAmount)}</strong>
        </div>
        <div>
          <span className="detail-label">الحالة الحالية</span>
          <strong>{meta.label}</strong>
        </div>
      </div>

      <Protect require="manage_merchant_state">
        {merchant.contractState !== "signed_contract" ? (
          <div className="sign-panel">
            <div className="sign-panel-head">
              <div>
                <p className="eyebrow">اعتماد إداري</p>
                <h3>اعتماد توقيع العقد</h3>
              </div>
              <span className="badge badge-gold">صلاحية إدارة الحالات</span>
            </div>
            <p>
              متاح فقط بعد الوصول إلى اتفاق نهائي. يُدخل المدير النسبة النهائية
              المقفلة، فتُحدَّث حالة التاجر إلى «توقيع العقد» وتُحتسب العمولة
              نهائياً.
            </p>
            {merchant.contractState === "final_contract" ||
            merchant.contractState === "provisional" ? (
              <button
                type="button"
                className="button button-primary button-sign"
                onClick={onOpenSign}
              >
                اعتماد توقيع العقد
              </button>
            ) : (
              <p className="inline-note">
                يجب الوصول إلى اتفاق مبدئي أو نهائي أولاً قبل اعتماد التوقيع.
                الحالة الحالية: {meta.label}.
              </p>
            )}
          </div>
        ) : null}
      </Protect>
      {finalLocked && canViewFieldOps && !otherTeam ? (
        <div className="lock-panel">
          <span className="badge badge-red">الاتفاق النهائي مقفل</span>
          <p>
            تغيير النتيجة يتطلب اعتماد المدير. أرسل طلب تعديل مع ذكر السبب.
          </p>
          <button
            type="button"
            className="button button-primary"
            onClick={onRequestEdit}
          >
            طلب اعتماد التعديل
          </button>
        </div>
      ) : null}
      {merchant.contractState === "signed_contract" ? (
        <p className="inline-note">
          العقود الموقّعة مقفلة تماماً. تم احتساب العمولة، وفقط صلاحية إدارة
          الحالات يمكنها تغيير هذا السجل.
        </p>
      ) : null}
    </div>
  );
}
