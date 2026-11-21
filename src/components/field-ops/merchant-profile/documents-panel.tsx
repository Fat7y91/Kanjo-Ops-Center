"use client";

import type { Merchant, MerchantDocument } from "@/lib/field-ops/types";

import { formatDateTime } from "@/lib/field-ops/format";
import { DOCUMENT_TYPES } from "@/lib/field-ops/profile-meta";
import { useDocuments } from "./use-documents";

type DocumentsPanelProps = {
  merchant: Merchant;
  agreementReached: boolean;
  canEditMerchants: boolean;
  onAnnounce: (message: string) => void;
};

export function DocumentsPanel({
  merchant,
  agreementReached,
  canEditMerchants,
  onAnnounce,
}: DocumentsPanelProps) {
  const {
    docName,
    setDocName,
    docType,
    setDocType,
    docUrl,
    setDocUrl,
    docError,
    docSaving,
    addDocument,
  } = useDocuments({ merchantId: merchant.id, onAnnounce });

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">مستندات التاجر</p>
          <h2>ملف الاتفاق</h2>
        </div>
        <span
          className={`badge ${agreementReached ? "badge-green" : "badge-gold"}`}
        >
          {agreementReached ? "مفتوح" : "مقفل"}
        </span>
      </div>

      {!agreementReached ? (
        <p className="empty-state">
          تُفتح المستندات فقط بعد اتفاق نهائي أو موقّع. يحافظ ذلك على تدفق
          الزيارات اليومية دون رفع مستندات.
        </p>
      ) : (
        <>
          {merchant.documents.length === 0 ? (
            <p className="empty-state">لا توجد مستندات مرفقة بعد.</p>
          ) : (
            <ul className="document-list">
              {merchant.documents.map((document) => (
                <li key={document.id}>
                  <div>
                    <strong>{document.name}</strong>
                    <span>
                      {
                        DOCUMENT_TYPES.find(
                          (option) => option.value === document.type,
                        )?.label
                      }{" "}
                      · {formatDateTime(document.uploadedAt)}
                    </span>
                  </div>
                  {document.url ? (
                    <a
                      href={document.url}
                      className="button button-small button-quiet"
                      target="_blank"
                      rel="noreferrer"
                    >
                      فتح
                    </a>
                  ) : (
                    <span className="badge">لا يوجد رابط</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {canEditMerchants ? (
            <form className="form-stack document-form" onSubmit={addDocument}>
              <div className="form-grid">
                <label className="field">
                  <span>اسم المستند</span>
                  <input
                    value={docName}
                    onChange={(event) => setDocName(event.target.value)}
                    placeholder="العقد الموقّع 2026"
                    required
                  />
                </label>
                <label className="field">
                  <span>النوع</span>
                  <select
                    value={docType}
                    onChange={(event) =>
                      setDocType(event.target.value as MerchantDocument["type"])
                    }
                  >
                    {DOCUMENT_TYPES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="field">
                <span>رابط المستند</span>
                <input
                  value={docUrl}
                  onChange={(event) => setDocUrl(event.target.value)}
                  placeholder="https://storage.example.com/contract.pdf"
                />
              </label>
              {docError ? (
                <p className="form-error" role="alert">
                  {docError}
                </p>
              ) : null}
              <div className="form-actions">
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={docSaving}
                >
                  {docSaving ? "جارٍ الإرفاق..." : "إرفاق المستند"}
                </button>
              </div>
            </form>
          ) : null}
        </>
      )}
    </div>
  );
}
