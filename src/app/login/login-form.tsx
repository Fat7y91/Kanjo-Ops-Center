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
  "login-disabled":
    "لم يُضبط الاتصال بـ Supabase. يجب تعيين SUPABASE_URL و SUPABASE_ANON_KEY.",
  "unknown-user": "هذا الحساب غير متاح.",
};

/**
 * Phone + password sign-in. There is no signup path and no account picker:
 * accounts are provisioned top-down by an authorised operator.
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
          hint="بصيغة دولية تبدأ بعلامة +، مثل +201000000000."
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
