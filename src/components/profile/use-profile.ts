"use client";

import { useCallback, useState } from "react";

import type { ProfileView } from "@/lib/profile/repository";

/* Re-exported so a client component can type its props without importing a
 * `server-only` module. */
export type { ProfileView } from "@/lib/profile/repository";

type ApiError = {
  error?: string;
  code?: string;
  path?: (string | number)[];
};

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as ApiError;
    return payload.error ?? "تعذر إكمال العملية.";
  } catch {
    return "تعذر إكمال العملية.";
  }
}

/** Identity fields, editable in place. */
export function useProfileDetails(initial: ProfileView | null) {
  const [profile, setProfile] = useState<ProfileView | null>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const save = useCallback(
    async (input: {
      fullName: string;
      email: string;
      avatarUrl: string;
    }) => {
      setSaving(true);
      setError("");
      setNotice("");
      try {
        const response = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!response.ok) {
          setError(await readError(response));
          return null;
        }
        const payload = (await response.json()) as { profile: ProfileView };
        setProfile(payload.profile);
        setNotice("تم حفظ بيانات الملف الشخصي.");
        return payload.profile;
      } catch {
        setError("تعذر الاتصال بالخادم.");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  return { profile, saving, error, notice, save };
}

/** Password rotation. The current password is required by the API. */
export function usePasswordChange() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const change = useCallback(
    async (input: {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    }) => {
      setSaving(true);
      setError("");
      setNotice("");
      try {
        const response = await fetch("/api/profile/password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!response.ok) {
          setError(await readError(response));
          return false;
        }
        setNotice("تم تحديث كلمة المرور. استخدم الكلمة الجديدة في الدخول القادم.");
        return true;
      } catch {
        setError("تعذر الاتصال بالخادم.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  return { saving, error, notice, change };
}

/** Uploads one file to a bucket and returns the stored path and public URL. */
export async function uploadProfileFile(
  target: "avatars" | "capital-receipts",
  file: File,
): Promise<{ path: string; url: string | null }> {
  const body = new FormData();
  body.set("target", target);
  body.set("file", file);

  const response = await fetch("/api/profile/upload", {
    method: "POST",
    body,
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return (await response.json()) as { path: string; url: string | null };
}
