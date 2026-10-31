import { BI_MARKETING_PLATFORM_META, type BiMarketingPlatform } from "@/lib/bi/types";

/**
 * Per-platform credential contract.
 *
 * Each ad network authenticates differently, so the settings form is generated
 * from this spec instead of a generic "API key" field. The verifier below is
 * the single server-side gate: a platform may only be switched to live sync
 * after every required field is present and shaped like the network's own
 * credential. The client renders the same spec, but never decides validity.
 */
export type CredentialField = {
  key: string;
  label: string;
  hint: string;
  secret?: boolean;
  pattern: RegExp;
  patternHint: string;
};

export type PlatformSpec = {
  platform: BiMarketingPlatform;
  label: string;
  /** Where the operator issues the credential. */
  instructions: string;
  /** Offline is manual entry only; it has no sync to switch on. */
  manualOnly: boolean;
  fields: readonly CredentialField[];
};

const TOKEN = (label: string): CredentialField => ({
  key: "accessToken",
  label,
  hint: "رمز الوصول الدائم من لوحة المطوّر.",
  secret: true,
  pattern: /^[A-Za-z0-9._-]{20,}$/,
  patternHint: "20 حرفاً على الأقل، بلا مسافات.",
});

export const PLATFORM_SPECS: readonly PlatformSpec[] = [
  {
    platform: "meta",
    label: BI_MARKETING_PLATFORM_META.meta,
    instructions:
      "أنشئ تطبيقاً في Meta for Developers، ثم ولّد رمز وصول دائم لمدير الأعمال واربطه بحساب الإعلانات.",
    manualOnly: false,
    fields: [
      {
        key: "adAccountId",
        label: "معرّف حساب الإعلانات",
        hint: "يبدأ بـ act_ في Ads Manager.",
        pattern: /^act_\d{6,}$/,
        patternHint: "بصيغة act_ ثم أرقام، مثل act_1234567890.",
      },
      TOKEN("رمز وصول مدير الأعمال"),
    ],
  },
  {
    platform: "tiktok",
    label: BI_MARKETING_PLATFORM_META.tiktok,
    instructions:
      "من TikTok for Business Developers أنشئ تطبيقاً، واطلب صلاحية Ads Management، ثم انسخ معرّف المعلن ورمز الوصول.",
    manualOnly: false,
    fields: [
      {
        key: "advertiserId",
        label: "معرّف المعلن",
        hint: "Advertiser ID من مركز أعمال تيك توك.",
        pattern: /^\d{6,}$/,
        patternHint: "أرقام فقط، 6 خانات على الأقل.",
      },
      TOKEN("رمز الوصول"),
    ],
  },
  {
    platform: "google",
    label: BI_MARKETING_PLATFORM_META.google,
    instructions:
      "من Google Ads API Center احصل على رمز المطوّر، ثم اربط حساب الإعلان عبر OAuth لتحصل على رمز التجديد.",
    manualOnly: false,
    fields: [
      {
        key: "customerId",
        label: "معرّف حساب العميل",
        hint: "يظهر أعلى يمين لوحة Google Ads.",
        pattern: /^\d{3}-\d{3}-\d{4}$/,
        patternHint: "بصيغة 123-456-7890.",
      },
      {
        key: "developerToken",
        label: "رمز المطوّر",
        hint: "من مركز API في حساب المدير.",
        pattern: /^[A-Za-z0-9_-]{10,}$/,
        patternHint: "10 أحرف على الأقل.",
      },
      TOKEN("رمز التجديد (OAuth)"),
    ],
  },
  {
    platform: "snapchat",
    label: BI_MARKETING_PLATFORM_META.snapchat,
    instructions:
      "من Snapchat Ads Manager أنشئ تطبيق Marketing API، ثم انسخ معرّف الحساب الإعلاني ورمز الوصول.",
    manualOnly: false,
    fields: [
      {
        key: "adAccountId",
        label: "معرّف الحساب الإعلاني",
        hint: "من صفحة الحساب في Snapchat Ads.",
        pattern: /^[A-Za-z0-9-]{6,}$/,
        patternHint: "6 أحرف على الأقل.",
      },
      TOKEN("رمز الوصول"),
    ],
  },
  {
    platform: "offline",
    label: BI_MARKETING_PLATFORM_META.offline,
    instructions:
      "القنوات المباشرة تُدخل يدوياً كل يوم، ولا تحتاج إلى ربط تقني.",
    manualOnly: true,
    fields: [],
  },
];

export function platformSpec(platform: BiMarketingPlatform): PlatformSpec {
  return (
    PLATFORM_SPECS.find((spec) => spec.platform === platform) ??
    PLATFORM_SPECS[PLATFORM_SPECS.length - 1]
  );
}

export type VerificationResult = { ok: true } | { ok: false; error: string };

/**
 * Server-side credential gate.
 *
 * Runs before any settings row is written: missing or malformed credentials
 * fail here, which is why the sync switch cannot be flipped on a guess. The
 * error names the offending field so the operator can fix it in one pass.
 */
export function verifyPlatformCredentials(
  platform: BiMarketingPlatform,
  values: Readonly<Record<string, string>>,
): VerificationResult {
  const spec = platformSpec(platform);

  if (spec.manualOnly) {
    return {
      ok: false,
      error: "هذه القناة تُدخل يدوياً ولا تدعم المزامنة الآلية.",
    };
  }

  for (const field of spec.fields) {
    const value = (values[field.key] ?? "").trim();
    if (value === "") {
      return { ok: false, error: `حقل «${field.label}» مطلوب.` };
    }
    if (!field.pattern.test(value)) {
      return {
        ok: false,
        error: `حقل «${field.label}» غير صالح. ${field.patternHint}`,
      };
    }
  }

  return { ok: true };
}

export function missingFields(
  platform: BiMarketingPlatform,
  values: Readonly<Record<string, string>>,
): string[] {
  return platformSpec(platform)
    .fields.filter((field) => (values[field.key] ?? "").trim() === "")
    .map((field) => field.key);
}
