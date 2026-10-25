import type { ModuleIcon as ModuleIconName } from "@/lib/rbac/modules";

const paths: Record<ModuleIconName, string> = {
  overview:
    "M4 4h7v7H4V4Zm9 0h7v4h-7V4ZM4 13h7v7H4v-7Zm9-3h7v10h-7V10Z",
  cities:
    "M3 20h18M5 20V9l5-3 5 3v11M15 20v-7l4-2 4 2v7M8 12v2M8 16v2M12 12v2M12 16v2M18 15v2M18 18v2",
  merchants:
    "M4 10v9h16v-9M3 10l2-6h14l2 6M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M9 19v-4h6v4",
  catalog:
    "M4 7.5 12 3l8 4.5-8 4.5-8-4.5ZM4 7.5V16l8 5 8-5V7.5M12 12v9",
  "field-ops":
    "M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  contracts:
    "M6 3h9l4 4v14H6V3Zm9 0v5h4M9 12h6M9 16h6",
  permissions:
    "M12 3 5 6v5c0 4.4 2.9 8.4 7 10 4.1-1.6 7-5.6 7-10V6l-7-3Zm-2.5 9 1.8 1.8 3.8-4",
};

export function ModuleIcon({ name }: { name: ModuleIconName }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="module-icon"
    >
      <path d={paths[name]} />
    </svg>
  );
}
