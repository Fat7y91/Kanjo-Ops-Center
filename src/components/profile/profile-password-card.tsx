"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-inputs";

import { usePasswordChange } from "./use-profile";

export function ProfilePasswordCard() {
  const { saving, error, notice, change } = usePasswordChange();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mismatch =
    confirmPassword !== "" && newPassword !== confirmPassword;
  const ready =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword;

  async function submit() {
    const ok = await change({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (!ok) return;
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>كلمة المرور</h2>
          <p>يلزم إدخال كلمة المرور الحالية قبل تعيين كلمة جديدة.</p>
        </div>
      </header>

      <div className="form-grid">
        <TextField
          label="كلمة المرور الحالية"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
        <TextField
          label="كلمة المرور الجديدة"
          type="password"
          autoComplete="new-password"
          hint="8 أحرف على الأقل."
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <TextField
          label="تأكيد كلمة المرور"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </div>

      {mismatch ? (
        <p className="form-error">كلمتا المرور غير متطابقتين.</p>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-notice">{notice}</p> : null}

      <div className="form-actions">
        <Button variant="primary" disabled={!ready || saving} onClick={submit}>
          {saving ? "جارٍ التحديث…" : "تحديث كلمة المرور"}
        </Button>
      </div>
    </section>
  );
}
