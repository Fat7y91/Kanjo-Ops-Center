import { z } from "zod";

import { PERMISSION_KEYS, type Permission } from "@/lib/rbac/permissions";

const permissionSchema = z.enum(
  PERMISSION_KEYS as unknown as [Permission, ...Permission[]],
);

export const userCreateSchema = z.object({
  name: z.string().trim().min(2, "اسم المشغّل مطلوب.").max(80),
  email: z.string().trim().email("أدخل بريداً إلكترونياً صالحاً.").max(120),
  title: z.string().trim().min(2, "المسمى الوظيفي مطلوب.").max(80),
  /** Mandatory only for a field courier; see `provisionAccountSchema`. */
  team: z.string().trim().max(60).optional(),
  clearanceLevel: z.coerce
    .number()
    .int("مستوى التصريح يجب أن يكون رقماً صحيحاً.")
    .min(1, "أدنى مستوى تصريح هو 1.")
    .max(4, "أعلى مستوى تصريح هو 4."),
  permissions: z.array(permissionSchema).default([]),
  accessibleCities: z.array(z.string().trim().min(1)).default([]),
});

export type UserCreateSchemaInput = z.infer<typeof userCreateSchema>;

export const userPatchSchema = z
  .object({
    permission: permissionSchema.optional(),
    enabled: z.boolean().optional(),
    permissions: z.array(permissionSchema).optional(),
    clearanceLevel: z.coerce.number().int().min(1).max(4).optional(),
    accessibleCities: z.array(z.string().trim().min(1)).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.permissions !== undefined ||
      (value.permission !== undefined && value.enabled !== undefined) ||
      value.clearanceLevel !== undefined ||
      value.accessibleCities !== undefined ||
      value.active !== undefined,
    { message: "لا يوجد تغيير مطلوب." },
  );

export type UserPatchSchemaInput = z.infer<typeof userPatchSchema>;
