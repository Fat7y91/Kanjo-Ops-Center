"use client";

import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { formatCoordinates, formatDuration } from "@/lib/field-ops/geolocation";
import {
  ADVANCED_OUTCOMES,
  CONTRACT_STATES,
  CONTRACT_STATE_META,
  REP_OPINIONS,
  REP_OPINION_META,
  type ContractState,
  type Merchant,
  type RepOpinion,
} from "@/lib/field-ops/types";
import type { VisitDraft } from "@/components/field-ops/visit-mode";

export type VisitReportDraft = {
  outcome: ContractState;
  notes: string;
  contact: { name: string; role: string; mobile: string };
  opinions: RepOpinion[];
  followUpAt: string;
  followUpKind: "visit" | "call";
  followUpNote: string;
};

type VisitReportFormProps = {
  open: boolean;
  merchant: Merchant | null;
  draft: VisitDraft | null;
  visitCount: number;
  canManageState: boolean;
  offline: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (report: VisitReportDraft) => void;
};

type OutcomeOption = {
  value: ContractState;
  label: string;
  description: string;
  advanced: boolean;
};

const OUTCOME_LABELS: Record<ContractState, { label: string; description: string }> = {
  no_agreement: {
    label: "بدون تعاقد",
    description: "الزيارة انتهت دون اتفاق. يستمر التاجر في المسار الطبيعي.",
  },
  provisional: {
    label: "اتفاق مبدئي",
    description: "قبول مبدئي للعمولة، مع حاجة لجولة نهائية.",
  },
  final_contract: {
    label: "اتفاق نهائي",
    description: "بنود نهائية متفق عليها. حفظ العقد يسير إلى مكتب العقود.",
  },
  signed_contract: {
    label: "توقيع العقد",
    description: "تم توقيع العقد رسمياً واحتساب العمولة.",
  },
};

export function VisitReportForm({
  open,
  merchant,
  draft,
  visitCount,
  canManageState,
  offline,
  saving,
  onClose,
  onSubmit,
}: VisitReportFormProps) {
  const [outcome, setOutcome] = useState<ContractState>(
    merchant?.contractState ?? "no_agreement",
  );
  const [notes, setNotes] = useState("");
  const [contactName, setContactName] = useState(merchant?.contact?.name ?? "");
  const [contactRole, setContactRole] = useState(merchant?.contact?.role ?? "");
  const [contactMobile, setContactMobile] = useState(merchant?.contact?.mobile ?? "");
  const [opinions, setOpinions] = useState<RepOpinion[]>(merchant?.opinions ?? []);
  const [followUpAt, setFollowUpAt] = useState("");
  const [followUpKind, setFollowUpKind] = useState<"visit" | "call">("visit");
  const [followUpNote, setFollowUpNote] = useState("");
  const [error, setError] = useState("");

  const canUseAdvanced = visitCount > 0 || canManageState;

  // Reset the form whenever a new visit opens; the modal stays mounted so
  // React state would otherwise leak the previous merchant's answers.
  useEffect(() => {
    if (!open || !merchant) return;
    setOutcome(
      ADVANCED_OUTCOMES.includes(merchant.contractState) && visitCount === 0
        ? "no_agreement"
        : merchant.contractState,
    );
    setNotes("");
    setContactName(merchant.contact?.name ?? "");
    setContactRole(merchant.contact?.role ?? "");
    setContactMobile(merchant.contact?.mobile ?? "");
    setOpinions(merchant.opinions ?? []);
    setFollowUpAt("");
    setFollowUpKind("visit");
    setFollowUpNote("");
    setError("");
  }, [open, merchant, visitCount]);

  const outcomeOptions = useMemo<OutcomeOption[]>(() => {
    return CONTRACT_STATES.filter((state) => state !== "signed_contract" || canManageState)
      .map((state) => ({
        value: state as ContractState,
        label: OUTCOME_LABELS[state].label,
        description: OUTCOME_LABELS[state].description,
        advanced: ADVANCED_OUTCOMES.includes(state),
      }))
      .filter((option) => !option.advanced || canUseAdvanced);
  }, [canManageState, canUseAdvanced]);

  if (!merchant) return null;
  const target = merchant;

  function toggleOpinion(opinion: RepOpinion) {
    setOpinions((current) =>
      current.includes(opinion)
        ? current.filter((value) => value !== opinion)
        : [...current, opinion],
    );
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (notes.trim().length < 10) {
      setError("ملاحظات الزيارة يجب ألا تقل عن 10 أحرف.");
      return;
    }
    if (ADVANCED_OUTCOMES.includes(outcome) && !canUseAdvanced) {
      setError(
        "تسليم المسودة وتوقيع العقد متاحان فقط للتجار الذين لديهم زيارة سابقة.",
      );
      return;
    }
    if (
      followUpAt &&
      new Date(followUpAt).getTime() < Date.now() - 60_000
    ) {
      setError("موعد المتابعة يجب أن يكون في المستقبل.");
      return;
    }
    if (followUpAt && !target.team) {
      setError("لا يمكن جدولة مهمة متابعة قبل إسناد التاجر لفريق.");
      return;
    }

    onSubmit({
      outcome,
      notes,
      contact: {
        name: contactName,
        role: contactRole,
        mobile: contactMobile,
      },
      opinions,
      followUpAt,
      followUpKind,
      followUpNote,
    });
  }

  return (
    <Modal
      open={open}
      title={`تقرير الزيارة — ${merchant.name}`}
      eyebrow="إدخال بيانات الزيارة"
      description={
        offline
          ? "لا يوجد اتصال الآن. سيُحفظ التقرير محلياً ويُزامن تلقائياً عند عودة الشبكة."
          : "سيُحفظ التقرير مباشرة ويُحدّث كارت التاجر بالكامل."
      }
      onClose={onClose}
      wide
    >
      <form className="form-stack visit-report-form" onSubmit={submit}>
        {draft ? (
          <section className="visit-summary-strip" aria-label="ملخص الزيارة">
            <div>
              <span>المدة</span>
              <strong>{formatDuration(draft.durationSeconds)}</strong>
            </div>
            <div>
              <span>موقع البداية</span>
              <strong className="visit-coords">{formatCoordinates(draft.startLocation)}</strong>
            </div>
            <div>
              <span>موقع النهاية</span>
              <strong className="visit-coords">{formatCoordinates(draft.endLocation)}</strong>
            </div>
            <div>
              <span>عدد الزيارات السابقة</span>
              <strong>{visitCount}</strong>
            </div>
          </section>
        ) : null}

        <section className="visit-form-section">
          <div className="visit-form-head">
            <p className="eyebrow">بيانات التواصل</p>
            <span className="badge">تُحدَّث في كارت التاجر تلقائياً</span>
          </div>
          <div className="visit-contact-grid">
            <label className="field">
              <span>اسم مسؤول التواصل</span>
              <input
                type="text"
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                placeholder="من قابلته في الزيارة؟"
              />
            </label>
            <label className="field">
              <span>المسمى الوظيفي</span>
              <input
                type="text"
                value={contactRole}
                onChange={(event) => setContactRole(event.target.value)}
                placeholder="المالك، مدير الفرع، مسؤول المشتريات…"
              />
            </label>
            <label className="field">
              <span>رقم الموبايل</span>
              <input
                type="tel"
                value={contactMobile}
                onChange={(event) => setContactMobile(event.target.value)}
                placeholder="01xxxxxxxxx"
                inputMode="tel"
              />
            </label>
          </div>
        </section>

        <section className="visit-form-section">
          <div className="visit-form-head">
            <p className="eyebrow">نتيجة الزيارة</p>
            <span className="badge badge-gold">
              {visitCount === 0
                ? "أول زيارة — الخيارات المتقدمة مخفية"
                : `زيارة رقم ${visitCount + 1}`}
            </span>
          </div>

          <div className="outcome-grid">
            {outcomeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`outcome-option${outcome === option.value ? " outcome-option-active" : ""}`}
                onClick={() => setOutcome(option.value)}
                aria-pressed={outcome === option.value}
              >
                <strong>{option.label}</strong>
                <span>{option.description}</span>
                {option.advanced ? (
                  <em className="outcome-advanced-tag">يتطلب زيارة سابقة</em>
                ) : null}
              </button>
            ))}
          </div>

          {!canUseAdvanced ? (
            <p className="inline-note">
              «تسليم مسودة العقد» و«توقيع العقد» يظهران فقط للتجار الذين لديهم
              زيارة سابقة مسجلة في سجلهم.
            </p>
          ) : null}

          {ADVANCED_OUTCOMES.includes(outcome) && canUseAdvanced ? (
            <p className="visit-advanced-note">
              هذا الخيار يفترض وجود اتفاق سابق. تأكد من مطابقة الحالة الحالية
              ({CONTRACT_STATE_META[merchant.contractState].label}) قبل الحفظ.
            </p>
          ) : null}
        </section>

        <label className="field">
          <span>التقرير النوعي الكامل</span>
          <textarea
            rows={5}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="ماذا لاحظت؟ بمن قابلت؟ ما الاتفاق الذي تم؟ ما الخطوة التالية؟"
            minLength={10}
            required
          />
          <span className="field-hint">
            10 أحرف على الأقل. يُحفظ التقرير في السجل الزمني لكارت التاجر.
          </span>
        </label>

        <section className="visit-form-section">
          <div className="visit-form-head">
            <p className="eyebrow">رأي المندوب</p>
            <span className="badge">{opinions.length} وسم</span>
          </div>
          <div className="opinion-grid">
            {REP_OPINIONS.map((opinion) => {
              const active = opinions.includes(opinion);
              return (
                <button
                  key={opinion}
                  type="button"
                  className={`opinion-chip${active ? " is-active" : ""}`}
                  onClick={() => toggleOpinion(opinion)}
                  aria-pressed={active}
                >
                  <span className={`badge ${REP_OPINION_META[opinion].tone}`}>
                    {REP_OPINION_META[opinion].label}
                  </span>
                  <span className="opinion-check" aria-hidden="true">
                    {active ? "✓" : "+"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="visit-form-section">
          <div className="visit-form-head">
            <p className="eyebrow">مهمة متابعة</p>
            <span className="badge badge-purple">اختياري</span>
          </div>
          <div className="visit-followup-grid">
            <label className="field">
              <span>نوع المتابعة</span>
              <select
                value={followUpKind}
                onChange={(event) =>
                  setFollowUpKind(event.target.value as "visit" | "call")
                }
              >
                <option value="visit">زيارة متابعة</option>
                <option value="call">مكالمة هاتفية</option>
              </select>
            </label>
            <label className="field">
              <span>الموعد</span>
              <input
                type="datetime-local"
                value={followUpAt}
                onChange={(event) => setFollowUpAt(event.target.value)}
              />
            </label>
            <label className="field visit-followup-note">
              <span>ملاحظة المتابعة</span>
              <input
                type="text"
                value={followUpNote}
                onChange={(event) => setFollowUpNote(event.target.value)}
                placeholder="ما المطلوب في المتابعة؟"
                maxLength={200}
              />
            </label>
          </div>
          {followUpAt ? (
            <p className="inline-note">
              ستُنشأ مهمة مجدولة لفريق {merchant.team ?? "غير مسند"} وتظهر في
              لوحة العمليات الميدانية.
            </p>
          ) : null}
        </section>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="form-actions">
          <button type="button" className="button button-quiet" onClick={onClose} disabled={saving}>
            إلغاء
          </button>
          <button type="submit" className="button button-primary" disabled={saving}>
            {saving
              ? "جارٍ الحفظ…"
              : offline
                ? "حفظ محلياً ومزامنة لاحقاً"
                : "حفظ التقرير"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
