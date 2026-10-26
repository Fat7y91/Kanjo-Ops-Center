export type PermissionDefinition = {
  key: string;
  label: string;
  description: string;
  group: string;
};

/**
 * The single source of truth for every capability in V2.
 *
 * UI components, route middleware, server guards, and API handlers all consume
 * these keys. No surface should ever branch on a job title or role name.
 */
export const PERMISSIONS = [
  {
    key: "view_overview",
    label: "عرض النظرة العامة",
    description: "فتح النظرة العامة للمؤسسة والمؤشرات الرئيسية.",
    group: "مساحة العمل",
  },
  {
    key: "view_finance",
    label: "عرض الملخص المالي",
    description: "الاطلاع على اللقطة المالية في النظرة العامة.",
    group: "مساحة العمل",
  },
  {
    key: "view_cities",
    label: "عرض المدن",
    description: "فتح دورة حياة المدن وسجل النطاقات التشغيلية.",
    group: "المدن",
  },
  {
    key: "create_city",
    label: "إنشاء مدينة",
    description: "إنشاء مدينة جديدة عبر معالج ذكاء الأعمال الجغرافي.",
    group: "المدن",
  },
  {
    key: "update_city_zone",
    label: "تحديث النطاق الجغرافي",
    description: "تعديل حدود المدينة ونطاقها التشغيلي وبياناتها الميدانية.",
    group: "المدن",
  },
  {
    key: "view_city_analytics",
    label: "عرض تحليلات المدينة",
    description: "الاطلاع على تقديرات السكان والتجار ومؤشر المنافسة داخل النطاق.",
    group: "المدن",
  },
  {
    key: "assign_city_managers",
    label: "إسناد مديري التشغيل",
    description:
      "تعيين أو إلغاء مديري التشغيل للمدينة وتوسيع نطاق مدنهم المتاحة.",
    group: "المدن",
  },
  {
    key: "view_merchants",
    label: "عرض التجار",
    description: "فتح دليل التجار.",
    group: "التجار",
  },
  {
    key: "create_merchants",
    label: "إضافة التجار",
    description: "إضافة سجلات تجار جديدة.",
    group: "التجار",
  },
  {
    key: "edit_merchants",
    label: "تعديل التجار",
    description: "تغيير ملف التاجر وبياناته التجارية.",
    group: "التجار",
  },
  {
    key: "delete_merchants",
    label: "حذف التجار",
    description: "أرشفة أو حذف سجلات التجار.",
    group: "التجار",
  },
  {
    key: "transfer_merchants",
    label: "نقل ملكية التجار",
    description: "نقل ملكية التاجر بين الفرق.",
    group: "التجار",
  },
  {
    key: "view_catalog",
    label: "عرض الكتالوج",
    description: "فتح كتالوج المنتجات.",
    group: "الكتالوج",
  },
  {
    key: "manage_catalog",
    label: "إدارة الكتالوج",
    description:
      "صلاحية شاملة لإدارة منتجات الكتالوج، تشمل الإضافة والتعديل والحذف.",
    group: "الكتالوج",
  },
  {
    key: "create_products",
    label: "إضافة المنتجات",
    description: "إضافة منتجات إلى الكتالوج.",
    group: "الكتالوج",
  },
  {
    key: "edit_products",
    label: "تعديل المنتجات",
    description: "تغيير تفاصيل المنتجات والأسعار.",
    group: "الكتالوج",
  },
  {
    key: "delete_products",
    label: "حذف المنتجات",
    description: "إزالة المنتجات من الكتالوج.",
    group: "الكتالوج",
  },
  {
    key: "view_taxonomy",
    label: "عرض التصنيف المركزي",
    description:
      "الاطلاع على أنواع التجار والتصنيفات والمتغيرات المرتبطة بمعرّفات لوحة المستهلك.",
    group: "الكتالوج",
  },
  {
    key: "request_taxonomy",
    label: "طلب إضافة تصنيف",
    description:
      "إرسال طلب إضافة نوع تاجر أو تصنيف أو متغير إلى قائمة المراجعة المركزية.",
    group: "الكتالوج",
  },
  {
    key: "manage_taxonomy",
    label: "إدارة التصنيف المركزي",
    description:
      "اعتماد طلبات التصنيف وربطها بمعرّفات لوحة المستهلك الرسمية.",
    group: "الحوكمة",
  },
  {
    key: "view_field_ops",
    label: "عرض العمليات الميدانية",
    description: "فتح لوحة العمليات الميدانية ومسار الزيارات.",
    group: "العمليات الميدانية",
  },
  {
    key: "manage_tasks",
    label: "إدارة المهام",
    description:
      "إدارة المهام الميدانية ومراجعة لوحة التشغيل.",
    group: "العمليات الميدانية",
  },
  {
    key: "assign_tasks",
    label: "إسناد المهام",
    description: "إسناد المهام للمندوبين والفرق.",
    group: "العمليات الميدانية",
  },
  {
    key: "approve_tasks",
    label: "اعتماد المهام",
    description: "اعتماد العمل الميداني المكتمل.",
    group: "العمليات الميدانية",
  },
  {
    key: "request_transfers",
    label: "طلب نقل التجار",
    description: "طلب نقل تاجر إلى فريق المندوب.",
    group: "العمليات الميدانية",
  },
  {
    key: "approve_transfers",
    label: "اعتماد النقل",
    description: "اعتماد أو رفض طلبات نقل التجار بين الفرق.",
    group: "العمليات الميدانية",
  },
  {
    key: "approve_edit_requests",
    label: "اعتماد تعديل التقارير",
    description: "اعتماد أو رفض طلبات تعديل تقارير الزيارات المقفلة.",
    group: "العمليات الميدانية",
  },
  {
    key: "manage_merchant_state",
    label: "إدارة حالة التاجر",
    description:
      "تجاوز حالات الاتفاق النهائي والتوقيع وتعديل السجلات المقفلة.",
    group: "العمليات الميدانية",
  },
  {
    key: "view_contracts",
    label: "عرض العقود",
    description: "فتح سجل العقود.",
    group: "العقود",
  },
  {
    key: "create_contracts",
    label: "إنشاء العقود",
    description: "صياغة عقود تجار جديدة.",
    group: "العقود",
  },
  {
    key: "edit_contracts",
    label: "تعديل العقود",
    description: "تحديث شروط العقود وبياناتها الوصفية.",
    group: "العقود",
  },
  {
    key: "sign_contracts",
    label: "توقيع العقود",
    description: "تطبيق التوقيع المعتمد على العقد.",
    group: "العقود",
  },
  {
    key: "delete_contracts",
    label: "حذف العقود",
    description: "إلغاء أو حذف سجلات العقود.",
    group: "العقود",
  },
  {
    key: "manage_permissions",
    label: "إدارة الصلاحيات",
    description: "فتح مصفوفة الصلاحيات ومنح القدرات أو سحبها.",
    group: "الحوكمة",
  },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];

export const PERMISSION_KEYS: readonly Permission[] = PERMISSIONS.map(
  (permission) => permission.key,
);

const PERMISSION_KEY_SET: ReadonlySet<string> = new Set(PERMISSION_KEYS);

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && PERMISSION_KEY_SET.has(value);
}

export function permissionDefinition(
  permission: Permission,
): PermissionDefinition {
  return (
    PERMISSIONS.find((candidate) => candidate.key === permission) ??
    PERMISSIONS[0]
  );
}

export type PermissionGroup = {
  name: string;
  items: readonly PermissionDefinition[];
};

export const PERMISSION_GROUPS: readonly PermissionGroup[] = Array.from(
  new Set(PERMISSIONS.map((permission) => permission.group)),
).map((group) => ({
  name: group,
  items: PERMISSIONS.filter((permission) => permission.group === group),
}));
