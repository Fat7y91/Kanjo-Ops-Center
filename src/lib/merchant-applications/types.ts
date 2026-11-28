/**
 * Domain types for inbound merchant applications.
 *
 * The application is the intake record from the public landing page. It is not
 * a merchant: promotion into `app.merchants` stays a reviewed action inside the
 * CRM. Keeping the two vocabularies apart is why the status list below says
 * nothing about contract states.
 */

/** Review lifecycle, mirroring `merchant_applications_status_allowed` in SQL. */
export const APPLICATION_STATUSES = [
  "pending",
  "contacted",
  "approved",
  "rejected",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type MerchantApplication = {
  id: string;
  storeName: string;
  contactPerson: string;
  /** International digits only, e.g. `201012345678`. */
  phoneNumber: string;
  businessType: string;
  status: ApplicationStatus;
  createdAt: string;
};

/** What the landing page may send: the four answers, never a status. */
export type MerchantApplicationInput = Pick<
  MerchantApplication,
  "storeName" | "contactPerson" | "phoneNumber" | "businessType"
>;

/**
 * Label and badge tone per status. `tone` is one of the badge classes in
 * `src/styles/ui.css`, so a call site never hand-rolls a colour.
 */
export const APPLICATION_STATUS_META: Record<
  ApplicationStatus,
  { label: string; tone: string }
> = {
  pending: { label: "بانتظار المراجعة", tone: "badge-gold" },
  contacted: { label: "تم التواصل", tone: "" },
  approved: { label: "معتمد", tone: "badge-green" },
  rejected: { label: "مرفوض", tone: "badge-red" },
};

export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return (
    typeof value === "string" &&
    (APPLICATION_STATUSES as readonly string[]).includes(value)
  );
}

/** Metadata for a status read back from the database, with a safe fallback. */
export function applicationStatusMeta(status: string): {
  label: string;
  tone: string;
} {
  return isApplicationStatus(status)
    ? APPLICATION_STATUS_META[status]
    : { label: status, tone: "" };
}
