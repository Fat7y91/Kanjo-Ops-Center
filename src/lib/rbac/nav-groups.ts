/**
 * Sidebar hierarchy.
 *
 * The module catalogue stays the single source of truth for routes,
 * capabilities and icons. This file only says how those routes are grouped for
 * the operator. `hrefs` are matched against `MODULES`, and any item the
 * operator cannot open is dropped with its group, so a group never renders
 * empty.
 *
 * `children` exists for the operations group, whose three sub-groups would
 * otherwise produce one very long flat list.
 */

export type NavGroup = {
  id: string;
  label: string;
  hrefs?: readonly string[];
  children?: readonly NavGroup[];
};

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: "admin",
    label: "الإدارة",
    hrefs: ["/cities", "/admin/permissions", "/admin/audit", "/profile"],
  },
  {
    id: "operations",
    label: "التشغيل",
    children: [
      {
        id: "operations-contracts",
        label: "التعاقدات",
        hrefs: [
          "/merchants/applications",
          "/field-ops",
          "/field-ops/archived",
          "/contracts",
        ],
      },
      {
        id: "operations-data",
        label: "إدخال البيانات",
        hrefs: ["/catalog", "/catalog/qa", "/catalog/taxonomy"],
      },
      {
        id: "operations-sales",
        label: "المبيعات",
        hrefs: ["/merchants", "/couriers", "/operations/log"],
      },
    ],
  },
  {
    id: "finance",
    label: "المالية",
    hrefs: [
      "/agent-kpi",
      "/accounts",
      "/payroll",
      "/admin/finance/reviews",
      "/admin/finance/rates",
      "/finance/clearinghouse",
    ],
  },
  {
    id: "marketing",
    label: "التسويق",
    hrefs: ["/marketing", "/marketing/leads", "/coupons"],
  },
];

/** Root item pinned above the groups. */
export const NAV_ROOT_HREF = "/overview";
