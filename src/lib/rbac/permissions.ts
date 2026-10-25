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
    label: "View overview",
    description: "Open the enterprise overview and headline metrics.",
    group: "Workspace",
  },
  {
    key: "view_finance",
    label: "View finance summary",
    description: "See the financial snapshot on the overview.",
    group: "Workspace",
  },
  {
    key: "view_merchants",
    label: "View merchants",
    description: "Open the merchant directory.",
    group: "Merchants",
  },
  {
    key: "create_merchants",
    label: "Create merchants",
    description: "Add new merchant records.",
    group: "Merchants",
  },
  {
    key: "edit_merchants",
    label: "Edit merchants",
    description: "Change merchant profile and commercial data.",
    group: "Merchants",
  },
  {
    key: "delete_merchants",
    label: "Delete merchants",
    description: "Archive or remove merchant records.",
    group: "Merchants",
  },
  {
    key: "transfer_merchants",
    label: "Transfer merchants",
    description: "Move merchant ownership between teams.",
    group: "Merchants",
  },
  {
    key: "view_catalog",
    label: "View catalog",
    description: "Open the product catalog.",
    group: "Catalog",
  },
  {
    key: "create_products",
    label: "Create products",
    description: "Add products to the catalog.",
    group: "Catalog",
  },
  {
    key: "edit_products",
    label: "Edit products",
    description: "Change product details and pricing.",
    group: "Catalog",
  },
  {
    key: "delete_products",
    label: "Delete products",
    description: "Remove products from the catalog.",
    group: "Catalog",
  },
  {
    key: "view_field_ops",
    label: "View field ops",
    description: "Open the field operations board.",
    group: "Field Ops",
  },
  {
    key: "create_tasks",
    label: "Create tasks",
    description: "Create field tasks and visits.",
    group: "Field Ops",
  },
  {
    key: "assign_tasks",
    label: "Assign tasks",
    description: "Assign tasks to operators and teams.",
    group: "Field Ops",
  },
  {
    key: "approve_tasks",
    label: "Approve tasks",
    description: "Approve completed field work.",
    group: "Field Ops",
  },
  {
    key: "view_contracts",
    label: "View contracts",
    description: "Open the contracts register.",
    group: "Contracts",
  },
  {
    key: "create_contracts",
    label: "Create contracts",
    description: "Draft new merchant contracts.",
    group: "Contracts",
  },
  {
    key: "edit_contracts",
    label: "Edit contracts",
    description: "Update contract terms and metadata.",
    group: "Contracts",
  },
  {
    key: "sign_contracts",
    label: "Sign contracts",
    description: "Apply the authorized signature to a contract.",
    group: "Contracts",
  },
  {
    key: "delete_contracts",
    label: "Delete contracts",
    description: "Void or remove contract records.",
    group: "Contracts",
  },
  {
    key: "manage_permissions",
    label: "Manage permissions",
    description: "Open the permission matrix and grant or revoke capabilities.",
    group: "Governance",
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
