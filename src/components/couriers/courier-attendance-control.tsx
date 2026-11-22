"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import {
  toKanjoBusinessDay,
  type AttendanceStatus,
} from "@/lib/couriers/tiered-pay";
import type { Courier } from "@/lib/couriers/types";

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "حاضر" },
  { value: "absent", label: "غائب" },
  { value: "excused", label: "بعذر" },
];

/**
 * Manual attendance override for one courier.
 *
 * A day with any delivered order is auto-attended and needs no row here. This
 * control exists for the exceptions: marking a zero-order day present (pays the
 * 165 EGP base) or an attended day absent/excused (withholds it). Saving
 * refreshes the board so the pay summary reflects the new day.
 */
export function CourierAttendanceControl({
  courier,
  canManage,
  onChanged,
}: {
  courier: Courier;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [day, setDay] = useState(() => toKanjoBusinessDay(new Date()));
  const [status, setStatus] = useState<AttendanceStatus>("present");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (!canManage) return null;

  function selectDay(nextDay: string) {
    setDay(nextDay);
    /* Reflect the day's derived status so an existing override is visible
     * before the manager decides to change it. */
    const existing = courier.pay.days.find((row) => row.day === nextDay);
    if (existing) setStatus(existing.status);
  }

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/couriers/${courier.id}/attendance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, status, note }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? "تعذر حفظ الحضور.");
        return;
      }
      setNote("");
      setMessage("تم تسجيل الحضور.");
      onChanged();
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-stack">
      <div className="form-grid">
        <TextField
          label="تاريخ اليوم"
          type="date"
          dir="ltr"
          value={day}
          disabled={busy}
          onChange={(event) => selectDay(event.target.value)}
        />
        <SelectMenu
          label="حالة الحضور"
          value={status}
          options={STATUS_OPTIONS}
          disabled={busy}
          onChange={(value) => setStatus(value)}
        />
        <TextField
          label="ملاحظة (اختياري)"
          value={note}
          disabled={busy}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="inline-note" role="status">
          {message}
        </p>
      ) : null}
      <div className="form-actions">
        <Button variant="primary" onClick={save} disabled={busy}>
          {busy ? "جارٍ الحفظ…" : "تسجيل الحضور"}
        </Button>
      </div>
    </div>
  );
}
