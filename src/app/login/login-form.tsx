"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-inputs";

type LoginFormProps = {
  nextPath: string;
  error?: string;
};

const MESSAGES: Record<string, string> = {
  "invalid-credentials": "رقم الهاتف أو كلمة المرور غير صحيحة.",
  "invalid-request": "تعذر قراءة الطلب. حاول مرة أخرى.",
  "login-disabled": "تسجيل الدخول غير متاح حالياً. تواصل مع المسؤول.",
  "unknown-user": "هذا الحساب غير متاح.",
};

/**
 * Phone + password sign-in. Accounts are provisioned top-down; there is no
 * signup path and no account picker. Copy here is user-facing only — technical
 * details belong in code comments or ARCHITECTURE.md.
 */
export function LoginForm({ nextPath, error }: LoginFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const message = error ? MESSAGES[error] ?? "تعذر تسجيل الدخول." : null;

  return (
    <>
      {message && (
        <p className="form-error" role="alert">
          {message}
        </p>
      )}

      <form
        action="/api/auth/login"
        method="post"
        className="login-form"
        onSubmit={() => setSubmitting(true)}
      >
        <input type="hidden" name="next" value={nextPath} />

        <TextField
          id="login-phone"
          name="phone"
          type="tel"
          label="رقم الهاتف"
          placeholder="+201000000000"
          autoComplete="tel"
          inputMode="tel"
          required
          dir="ltr"
        />

        <TextField
          id="login-password"
          name="password"
          type="password"
          label="كلمة المرور"
          autoComplete="current-password"
          required
          dir="ltr"
        />

        <Button type="submit" variant="primary" size="md" disabled={submitting}>
          {submitting ? "جارٍ التحقق…" : "تسجيل الدخول"}
        </Button>
      </form>
    </>
  );
}
