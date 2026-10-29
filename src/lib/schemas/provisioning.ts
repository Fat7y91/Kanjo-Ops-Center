import { z } from "zod";

import { PERMISSION_KEYS, type Permission } from "@/lib/rbac/permissions";

/**
 * Top-down provisioning input. There is no public signup: an authorised
 * operator supplies the phone and initial password on the new account's behalf.
 *
 * `email` is optional profile data and is never a login identity.
 */
const permissionSchema = z.enum(
  PERMISSION_KEYS as unknown as [Permission, ...Permission[]],
);

export const provisionAccountSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(
      /^\+[1-9][0-9]{7,14}$/,
      "رقم الهاتف يجب أن يكون بصيغة E.164، مثل +201012345678.",
    ),
  password: z
    .string()
    .min(8, "كلمة المرور يجب ألا تقل عن 8 أحرف.")
    // bcrypt silently truncates past 72 bytes; reject instead of truncating.
    .max(72, "كلمة المرور يجب ألا تتجاوز 72 حرفاً."),
  fullName: z.string().trim().min(2, "اسم المشغّل مطلوب.").max(80),
  email: z.string().trim().email("أدخل بريداً إلكترونياً صالحاً.").max(120).optional(),
  title: z.string().trim().min(2, "المسمى الوظيفي مطلوب.").max(80),
  team: z.string().trim().min(2, "الفريق مطلوب.").max(60),
  clearanceLevel: z.coerce
    .number()
    .int("مستوى التصريح يجب أن يكون رقماً صحيحاً.")
    .min(1, "أدنى مستوى تصريح هو 1.")
    .max(4, "أعلى مستوى تصريح هو 4."),
  permissions: z.array(permissionSchema).default([]),
  accessibleCities: z.array(z.string().trim().min(1)).default([]),
});

export type ProvisionAccountInput = z.infer<typeof provisionAccountSchema>;
