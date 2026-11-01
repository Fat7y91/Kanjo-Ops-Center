"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-inputs";
import {
  useProfileDetails,
  uploadProfileFile,
  type ProfileView,
} from "./use-profile";

/** Initials fallback: a profile without an avatar still renders a face. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}

export function ProfileIdentityCard({
  initial,
}: {
  initial: ProfileView | null;
}) {
  const { profile, saving, error, notice, save } = useProfileDetails(initial);
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initial?.avatarUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // The form follows the saved profile, so a successful save cannot leave the
  // fields showing the previous values.
  useEffect(() => {
    if (!profile) return;
    setFullName(profile.fullName);
    setEmail(profile.email ?? "");
    setAvatarUrl(profile.avatarUrl ?? "");
  }, [profile]);

  async function onPickAvatar(file: File | null) {
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const stored = await uploadProfileFile("avatars", file);
      if (stored.url) setAvatarUrl(stored.url);
    } catch (uploadFailure) {
      setUploadError(
        uploadFailure instanceof Error
          ? uploadFailure.message
          : "تعذر رفع الصورة.",
      );
    } finally {
      setUploading(false);
    }
  }

  const displayName = fullName.trim() !== "" ? fullName : "ملفي الشخصي";

  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>الملف الشخصي</h2>
          <p>بياناتك الظاهرة للفريق داخل المنصة.</p>
        </div>
      </header>

      <div className="profile-identity">
        <div className="profile-avatar">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={displayName} />
          ) : (
            <span>{initials(displayName)}</span>
          )}
        </div>

        <div className="profile-avatar-actions">
          <label className="button button-quiet button-small profile-file">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploading}
              onChange={(event) => onPickAvatar(event.target.files?.[0] ?? null)}
            />
            {uploading ? "جارٍ الرفع…" : "تغيير الصورة"}
          </label>
          {avatarUrl ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAvatarUrl("")}
            >
              إزالة الصورة
            </Button>
          ) : null}
          {uploadError ? (
            <span className="form-error">{uploadError}</span>
          ) : null}
        </div>
      </div>

      <div className="form-grid">
        <TextField
          label="الاسم الكامل"
          value={fullName}
          maxLength={80}
          onChange={(event) => setFullName(event.target.value)}
        />
        <TextField
          label="البريد الإلكتروني"
          type="email"
          dir="ltr"
          value={email}
          maxLength={120}
          onChange={(event) => setEmail(event.target.value)}
        />
        <TextField
          label="رقم الهاتف"
          dir="ltr"
          value={profile?.phone ?? initial?.phone ?? ""}
          readOnly
          disabled
          hint="رقم الدخول مُدار من إدارة المستخدمين ولا يُعدَّل من هنا."
        />
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {notice ? <p className="form-notice">{notice}</p> : null}

      <div className="form-actions">
        <Button
          variant="primary"
          disabled={saving || fullName.trim().length < 2}
          onClick={() => save({ fullName, email, avatarUrl })}
        >
          {saving ? "جارٍ الحفظ…" : "حفظ التغييرات"}
        </Button>
      </div>
    </section>
  );
}
