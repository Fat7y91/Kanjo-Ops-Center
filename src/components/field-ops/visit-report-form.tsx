"use client";

import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { formatCoordinates, formatDuration } from "@/lib/field-ops/geolocation";
import {
  ADVANCED_OUTCOMES,
  COMMISSION_OUTCOMES,
  CONTRACT_STATE_META,
  FOLLOW_UP_KINDS,
  FOLLOW_UP_KIND_META,
  REP_OPINIONS,
  REP_OPINION_META,
  type ContractState,
  type FollowUpKind,
  type Merchant,
  type RepOpinion,
  type RepOpinionTrait,
} from "@/lib/field-ops/types";
import type { VisitDraft } from "@/components/field-ops/visit-mode";

export type VisitReportDraft = {
  outcome: ContractState;
  notes: string;
  contact: { name: string; role: string; mobile: string };
  opinions: RepOpinion[];
  agreedCommission: number | null;
  followUpAt: string;
  followUpKind: FollowUpKind;
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

/**
 * Reps can only choose the three non-signature outcomes. `signed_contract` is
 * deliberately absent: signing is an admin governance action on the CRM card.
 */
const REP_OUTCOME_ORDER: ContractState[] = [
  "no_agreement",
  "provisional",
  "final_contract",
];

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
    description: "بنود نهائية متفق عليها. اعتماد التوقيع يتم من كارت التاجر.",
  },
  signed_contract: {
    label: "توقيع العقد",
    description: "اعتماد إداري فقط من كارت التاجر.",
  },
};

const DEFAULT_WEIGHTS: Record<RepOpinionTrait, number> = {
  cooperative: 60,
  difficult: 40,
  commission_conservative: 50,
  marketing_interested: 50,
  price_sensitive: 50,
  expansion_ready: 50,
};

type OpinionState = {
  trait: string;
  label?: string;
  weight: number;
  enabled: boolean;
};

function toOpinionState(
  opinions: RepOpinion[] | undefined,
): Record<string, OpinionState> {
  const next: Record<string, OpinionState> = {};
  for (const trait of REP_OPINIONS) {
    next[trait] = {
      trait,
      weight: DEFAULT_WEIGHTS[trait],
      enabled: false,
    };
  }
  for (const opinion of opinions ?? []) {
    const existing = next[opinion.trait];
    next[opinion.trait] = {
      trait: opinion.trait,
      label: opinion.label,
      weight: opinion.weight > 0 ? opinion.weight : existing?.weight ?? 50,
      enabled: true,
    };
  }
  return next;
}

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
  const [outcome, setOutcome] = useState<ContractState>("no_agreement");
  const [notes, setNotes] = useState("");
  const [contactName, setContactName] = useState(merchant?.contact?.name ?? "");
  const [contactRole, setContactRole] = useState(merchant?.contact?.role ?? "");
  const [contactMobile, setContactMobile] = useState(merchant?.contact?.mobile ?? "");
  const [opinionState, setOpinionState] = useState<Record<string, OpinionState>>(
    () => toOpinionState(merchant?.opinions),
  );
  const [customLabel, setCustomLabel] = useState("");
  const [customWeight, setCustomWeight] = useState(50);
  const [customEnabled, setCustomEnabled] = useState(false);
  const [agreedCommission, setAgreedCommission] = useState<string>(
    merchant?.agreedCommission != null ? String(merchant.agreedCommission) : "",
  );
  const [followUpAt, setFollowUpAt] = useState("");
  const [followUpKind, setFollowUpKind] = useState<FollowUpKind>("visit");
  const [followUpNote, setFollowUpNote] = useState("");
  const [error, setError] = useState("");

  const canUseAdvanced = visitCount > 0 || canManageState;
  const needsCommission = COMMISSION_OUTCOMES.includes(outcome);

  // Reset the form whenever a new visit opens; the modal stays mounted so
  // React state would otherwise leak the previous merchant's answers.
  useEffect(() => {
    if (!open || !merchant) return;
    setOutcome(
      ADVANCED_OUTCOMES.includes(merchant.contractState) && visitCount === 0
        ? "no_agreement"
        : REP_OUTCOME_ORDER.includes(merchant.contractState)
          ? merchant.contractState
          : "no_agreement",
    );
    setNotes("");
    setContactName(merchant.contact?.name ?? "");
    setContactRole(merchant.contact?.role ?? "");
    setContactMobile(merchant.contact?.mobile ?? "");
    setOpinionState(toOpinionState(merchant.opinions));
    const existingCustom = (merchant.opinions ?? []).find(
      (opinion) => opinion.trait === "custom",
    );
    setCustomLabel(existingCustom?.label ?? "");
    setCustomWeight(existingCustom?.weight || 50);
    setCustomEnabled(Boolean(existingCustom));
    setAgreedCommission(
      merchant.agreedCommission != null ? String(merchant.agreedCommission) : "",
    );
    setFollowUpAt("");
    setFollowUpKind("visit");
    setFollowUpNote("");
    setError("");
  }, [open, merchant, visitCount]);

  const outcomeOptions = useMemo<OutcomeOption[]>(() => {
    return REP_OUTCOME_ORDER.map((state) => ({
      value: state,
      label: OUTCOME_LABELS[state].label,
      description: OUTCOME_LABELS[state].description,
      advanced: ADVANCED_OUTCOMES.includes(state),
    })).filter((option) => !option.advanced || canUseAdvanced);
  }, [canUseAdvanced]);

  if (!merchant) return null;
  const target = merchant;
  const activeOpinions = Object.values(opinionState).filter(
    (state) => state.enabled,
  );

  function patchOpinion(trait: string, patch: Partial<OpinionState>) {
    setOpinionState((current) => ({
      ...current,
      [trait]: { ...current[trait], ...patch },
    }));
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
        "«اتفاق نهائي» متاح فقط للتجار الذين لديهم زيارة سابقة مسجلة في سجلهم.",
      );
      return;
    }

    const commission = Number(agreedCommission);
    if (
      needsCommission &&
      (!agreedCommission.trim() ||
        !Number.isFinite(commission) ||
        commission <= 0 ||
        commission > 100)
    ) {
      setError("أدخل النسبة المتفق عليها بين 1% و100%.");
      return;
    }

    if (customEnabled) {
      if (!customLabel.trim()) {
        setError("اكتب وصف الرأي المخصص أو ألغِ تفعيله.");
        return;
      }
      if (customWeight <= 0) {
        setError("وزن الرأي المخصص يجب أن يكون أكبر من صفر.");
        return;
      }
    }

    if (followUpAt && new Date(followUpAt).getTime() < Date.now() - 60_000) {
      setError("موعد المتابعة يجب أن يكون في المستقبل.");
      return;
    }
    if (followUpAt && !target.team) {
      setError("لا يمكن جدولة مهمة متابعة قبل إسناد التاجر لفريق.");
      return;
    }

    const opinions: RepOpinion[] = activeOpinions
      .filter((state) => state.weight > 0)
      .map((state) => ({
        trait: state.trait,
        weight: state.weight,
        label: state.label,
      }));
    if (customEnabled && customLabel.trim() && customWeight > 0) {
      opinions.push({
        trait: "custom",
        label: customLabel.trim(),
        weight: customWeight,
      });
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
      agreedCommission: needsCommission ? commission : null,
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
                ? "أول زيارة — خيار الاتفاق النهائي مخفي"
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

          <p className="inline-note">
            اعتماد توقيع العقد يتم حصرياً من كارت التاجر بواسطة مدير الحالات.
          </p>

          {ADVANCED_OUTCOMES.includes(outcome) && canUseAdvanced ? (
            <p className="visit-advanced-note">
              هذا الخيار يفترض وجود اتفاق سابق. تأكد من مطابقة الحالة الحالية
              ({CONTRACT_STATE_META[merchant.contractState].label}) قبل الحفظ.
            </p>
          ) : null}

          {needsCommission ? (
            <label className="field field-commission">
              <span>النسبة المتفق عليها (%)</span>
              <input
                type="number"
                min={1}
                max={100}
                step={0.5}
                inputMode="decimal"
                value={agreedCommission}
                onChange={(event) => setAgreedCommission(event.target.value)}
                placeholder="مثال: 12"
                required
              />
              <span className="field-hint">
                إلزامية عند الاتفاق المبدئي أو النهائي. تُحفظ في كارت التاجر
                وتُقفل نهائياً عند اعتماد التوقيع.
              </span>
            </label>
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
            <span className="badge">{activeOpinions.length + (customEnabled ? 1 : 0)} وسم مفعّل</span>
          </div>
          <p className="field-hint opinion-hint">
            فعّل ما ينطبق واضبط الوزن من 0% إلى 100%. الوزن يعبّر عن شدة
            الملاحظة، ويُجمع في كارت التاجر بأعلى قيمة مسجلة لكل وسم.
          </p>
          <div className="opinion-slider-grid">
            {REP_OPINIONS.map((trait) => {
              const state = opinionState[trait];
              const meta = REP_OPINION_META[trait];
              return (
                <div
                  key={trait}
                  className={`opinion-slider${state.enabled ? " is-active" : ""}`}
                >
                  <div className="opinion-slider-head">
                    <label className="opinion-slider-toggle">
                      <input
                        type="checkbox"
                        checked={state.enabled}
                        onChange={(event) =>
                          patchOpinion(trait, { enabled: event.target.checked })
                        }
                      />
                      <span className={`badge ${meta.tone}`}>{meta.label}</span>
                    </label>
                    <strong className="opinion-weight">{state.weight}%</strong>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={state.weight}
                    disabled={!state.enabled}
                    onChange={(event) =>
                      patchOpinion(trait, { weight: Number(event.target.value) })
                    }
                    aria-label={`وزن ${meta.label}`}
                  />
                </div>
              );
            })}
          </div>

          <div className={`opinion-slider opinion-custom${customEnabled ? " is-active" : ""}`}>
            <div className="opinion-slider-head">
              <label className="opinion-slider-toggle">
                <input
                  type="checkbox"
                  checked={customEnabled}
                  onChange={(event) => setCustomEnabled(event.target.checked)}
                />
                <span className="badge badge-purple">أخرى / مخصص</span>
              </label>
              <strong className="opinion-weight">
                {customEnabled ? `${customWeight}%` : "غير مفعّل"}
              </strong>
            </div>
            <input
              type="text"
              value={customLabel}
              disabled={!customEnabled}
              onChange={(event) => setCustomLabel(event.target.value)}
              placeholder="صف الملاحظة بكلماتك، مثال: يطلب حصرية التوزيع"
              maxLength={60}
            />
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={customWeight}
              disabled={!customEnabled}
              onChange={(event) => setCustomWeight(Number(event.target.value))}
              aria-label="وزن الرأي المخصص"
            />
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
                  setFollowUpKind(event.target.value as FollowUpKind)
                }
              >
                {FOLLOW_UP_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {FOLLOW_UP_KIND_META[kind].label}
                  </option>
                ))}
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
              {followUpKind === "whatsapp" && !contactMobile.trim()
                ? " أضف رقم موبايل ليظهر زر واتساب المباشر."
                : ""}
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
