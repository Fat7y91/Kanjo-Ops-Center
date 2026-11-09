import { z } from "zod";

/**
 * Delivery-partner (courier) domain types.
 *
 * A courier is a level-1 operator with a roster row on `app.couriers`. Identity
 * fields (name, phone, email) live on `app.users`; roster facts (vehicle, plate,
 * availability, cut rate) live on the courier row. The list view joins the two
 * and derives earnings, deliveries and balance from the operations ledger.
 */

export const AVAILABILITIES = ["available", "busy", "offline"] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  available: "متاح",
  busy: "مشغول",
  offline: "غير متصل",
};

export const COURIER_STATUSES = ["active", "inactive"] as const;
export type CourierStatus = (typeof COURIER_STATUSES)[number];

export const COURIER_STATUS_LABEL: Record<CourierStatus, string> = {
  active: "نشط",
  inactive: "موقوف",
};

export type Courier = {
  id: string;
  userId: string;
  displayName: string;
  phone: string;
  email: string;
  cutPercent: number;
  active: boolean;
  vehicleType: string;
  vehiclePlate: string;
  availability: Availability;
  appliedAt: string;
  /** Total courier cut earned across logged operations (major units). */
  earnings: number;
  /** Number of logged deliveries assigned to this courier. */
  deliveries: number;
  /** Pending clearinghouse balance owed to the courier (major units). */
  balance: number;
};

export type CourierInput = {
  fullName: string;
  phone: string;
  email: string;
  password: string;
  cutPercent: number;
  vehicleType: string;
  vehiclePlate: string;
  availability: Availability;
  active: boolean;
};

const availabilitySchema = z.enum(AVAILABILITIES);

const emailField = z
  .string()
  .trim()
  .max(120)
  .refine(
    (value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "أدخل بريداً إلكترونياً صالحاً.",
  )
  .default("");

const plateField = z.string().trim().max(40).default("");

/**
 * Couriers are provisioned top-down, so the create form carries the initial
 * password exactly like system-user provisioning. On update the password is
 * optional: an empty string means "leave the login unchanged".
 */
export const courierCreateSchema = z.object({
  fullName: z.string().trim().min(2, "اسم المندوب مطلوب.").max(80),
  phone: z
    .string()
    .trim()
    .regex(
      /^\+[1-9][0-9]{7,14}$/,
      "رقم الهاتف يجب أن يكون بصيغة E.164، مثل +201012345678.",
    ),
  email: emailField,
  password: z
    .string()
    .min(8, "كلمة المرور يجب ألا تقل عن 8 أحرف.")
    .max(72, "كلمة المرور يجب ألا تتجاوز 72 حرفاً."),
  cutPercent: z.coerce
    .number()
    .min(0, "نسبة الربح لا تكون سالبة.")
    .max(100, "نسبة الربح لا تتجاوز 100%.")
    .default(0),
  vehicleType: z.string().trim().max(60).default(""),
  vehiclePlate: plateField,
  availability: availabilitySchema.default("available"),
  active: z.boolean().default(true),
});

export const courierUpdateSchema = z.object({
  fullName: z.string().trim().min(2, "اسم المندوب مطلوب.").max(80),
  email: emailField,
  password: z
    .string()
    .max(72, "كلمة المرور يجب ألا تتجاوز 72 حرفاً.")
    .default(""),
  cutPercent: z.coerce
    .number()
    .min(0, "نسبة الربح لا تكون سالبة.")
    .max(100, "نسبة الربح لا تتجاوز 100%.")
    .default(0),
  vehicleType: z.string().trim().max(60).default(""),
  vehiclePlate: plateField,
  availability: availabilitySchema.default("available"),
  active: z.boolean().default(true),
});

export type CourierCreateInput = z.infer<typeof courierCreateSchema>;
export type CourierUpdateInput = z.infer<typeof courierUpdateSchema>;
