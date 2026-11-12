import type { ModuleDefinition } from "./modules";

/**
 * Navigation catalogue, second half: capital approvals, commission rates,
 * orders, couriers, coupons, clearinghouse, users, audit log and profile.
 *
 * Data only, kept beside the core list so neither file drifts toward the size
 * limit. `module-catalog.ts` concatenates the two in navigation order.
 */
export const FINANCE_MODULES: readonly ModuleDefinition[] = [
  {
    href: "/admin/finance/reviews",
    label: "اعتماد رأس المال",
    shortLabel: "الاعتمادات",
    description:
      "مراجعة إيداعات المؤسسين الرأسمالية ووجهات الصرف واعتمادها في الخزينة.",
    permission: "view_bank_balances",
    alsoGrantedBy: ["add_bank_account"],
    icon: "finance",
  },
  {
    href: "/admin/finance/rates",
    label: "أسعار العمولات",
    shortLabel: "العمولات",
    description:
      "رسوم تفعيل التاجر ورسم الصور والرسم الأساسي للتعاقد، بجدول افتراضي عام وتجاوزات لكل مدينة.",
    permission: "manage_commission_rates",
    minClearance: 4,
    icon: "finance",
  },
  {
    href: "/operations/log",
    label: "الطلبات",
    shortLabel: "الطلبات",
    description: "تسجيل الطلبات المنفذة واستيرادها وتوجيه مستحقات التجار والمناديب.",
    permission: "log_operations",
    alsoGrantedBy: ["import_orders"],
    icon: "operations",
  },
  {
    // Delivery roster: the same partners that appear in the operations logger,
    // managed as records rather than selected inside a form. Managing and
    // viewing are separate grants so a logger can see the roster without being
    // able to edit a partner's login or deactivate them.
    href: "/couriers",
    label: "مناديب التوصيل",
    shortLabel: "التوصيل",
    description: "شركاء التوصيل وربحهم الثابت وبيانات صرفهم وأرصدتهم.",
    permission: "view_couriers",
    alsoGrantedBy: ["manage_couriers"],
    icon: "operations",
  },
  {
    // Discount catalogue. Managing and viewing are separate grants so a
    // logger can pick a coupon without being able to edit funding rules.
    href: "/coupons",
    label: "الكوبونات",
    shortLabel: "الكوبونات",
    description: "كوبونات الخصم وقيمها وقواعد تمويلها ورفع ملف CSV.",
    permission: "view_coupons",
    alsoGrantedBy: ["manage_coupons"],
    icon: "coupons",
  },
  {
    href: "/finance/clearinghouse",
    label: "تسديد وتحصيل",
    shortLabel: "التسديد",
    description: "مستحقات التجار والمناديب ومديونياتهم وتسويتها كاملة أو جزئية.",
    permission: "view_clearinghouse",
    alsoGrantedBy: ["settle_clearinghouse", "settle_clearinghouse_partial"],
    icon: "clearinghouse",
  },
  {
    href: "/admin/permissions",
    label: "مستخدمين النظام",
    shortLabel: "المستخدمون",
    description: "إنشاء المستخدمين وإدارة رتبهم وصلاحياتهم ونطاق مدنهم.",
    permission: "manage_system_users",
    icon: "permissions",
  },
  {
    // The append-only black box: every write to a governed table leaves an
    // immutable row here. Read-only by construction — the database rejects any
    // update or delete — so one capability is the whole surface.
    href: "/admin/audit",
    label: "سجل التدقيق",
    shortLabel: "التدقيق",
    description: "سجل التغييرات غير القابل للتعديل: من عدّل أي سجل ومتى ولماذا.",
    permission: "view_audit_logs",
    icon: "audit",
  },
  {
    // Last on purpose: `firstPermittedPath` lands a fresh session on the first
    // permitted module, and the landing page should stay the overview.
    href: "/profile",
    label: "ملفي الشخصي",
    shortLabel: "ملفي",
    description: "بياناتي وكلمة المرور ووجهة الصرف ورأس مالي.",
    permission: "view_overview_contracts",
    sessionOnly: true,
    icon: "profile",
  },
];
