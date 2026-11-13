"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { usePermission } from "@/components/auth/use-permission";
import { ModuleIcon } from "@/components/shell/module-icon";
import {
  SidebarGroups,
  type SidebarGroup,
} from "@/components/shell/sidebar-groups";
import { Button } from "@/components/ui/button";
import { NAV_GROUPS, NAV_ROOT_HREF, type NavGroup } from "@/lib/rbac/nav-groups";
import {
  firstPermittedPath,
  moduleAllows,
  moduleForPath,
  moduleInSidebar,
  MODULES,
  type ModuleDefinition,
} from "@/lib/rbac/modules";
import { PERMISSION_KEYS } from "@/lib/rbac/permissions";

type SidebarProps = {
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
  onToggleCollapsed: () => void;
};

const MODULE_BY_HREF = new Map<string, ModuleDefinition>(
  MODULES.map((module) => [module.href, module]),
);

function resolveGroup(
  group: NavGroup,
  allowed: ReadonlySet<string>,
): SidebarGroup | null {
  const modules = (group.hrefs ?? [])
    .map((href) => MODULE_BY_HREF.get(href))
    .filter((module): module is ModuleDefinition => module !== undefined)
    .filter((module) => allowed.has(module.href));

  const children = (group.children ?? [])
    .map((child) => resolveGroup(child, allowed))
    .filter((child): child is SidebarGroup => child !== null);

  if (modules.length === 0 && children.length === 0) return null;
  return { id: group.id, label: group.label, modules, children };
}

export function Sidebar({
  open,
  collapsed,
  onClose,
  onToggleCollapsed,
}: SidebarProps) {
  const pathname = usePathname() ?? "";
  const { permissions, clearanceLevel, revision } = usePermission();
  const granted = Array.from(permissions);

  const visibleModules = MODULES.filter(
    (module) => moduleInSidebar(module) && moduleAllows(module, granted, clearanceLevel),
  );
  const allowed = new Set(visibleModules.map((module) => module.href));
  const groups = NAV_GROUPS.map((group) => resolveGroup(group, allowed)).filter(
    (group): group is SidebarGroup => group !== null,
  );

  const rootModule = MODULE_BY_HREF.get(NAV_ROOT_HREF);
  const showRoot = rootModule !== undefined && allowed.has(rootModule.href);
  const activeHref = moduleForPath(pathname)?.href ?? "";
  const homeHref = firstPermittedPath(granted, clearanceLevel);
  const rootActive =
    activeHref === NAV_ROOT_HREF || pathname === "/";

  return (
    <aside
      id="app-sidebar"
      className={`sidebar${open ? " is-open" : ""}${collapsed ? " is-collapsed" : ""}`}
      aria-label="القائمة الجانبية"
    >
      <div className="sidebar-head">
        <Link className="brand" href={homeHref} onClick={onClose}>
          <span className="brand-mark">K</span>
          <span className="brand-copy">
            <strong>كانجو</strong>
            <span>منصة المؤسسات V2</span>
          </span>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="sidebar-close"
          aria-label="إغلاق القائمة"
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Button>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="nav-collapse-toggle"
        aria-label={collapsed ? "توسيع القائمة" : "تصغير القائمة"}
        aria-pressed={collapsed}
        title={collapsed ? "توسيع القائمة" : "تصغير القائمة"}
        onClick={onToggleCollapsed}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        <span>تصغير القائمة</span>
      </Button>

      {showRoot && rootModule ? (
        <Link
          href={rootModule.href}
          title={collapsed ? rootModule.label : undefined}
          aria-label={collapsed ? rootModule.label : undefined}
          className={`nav-link nav-root-link${rootActive ? " is-active" : ""}`}
          aria-current={rootActive ? "page" : undefined}
          onClick={onClose}
        >
          <ModuleIcon name={rootModule.icon} />
          <span className="nav-link-label">{rootModule.label}</span>
        </Link>
      ) : null}

      {groups.length > 0 ? (
        <SidebarGroups
          groups={groups}
          activeHref={activeHref}
          collapsed={collapsed}
          onNavigate={onClose}
        />
      ) : (
        <p className="nav-empty">لا توجد وحدات ممنوحة لهذا الحساب حالياً.</p>
      )}

      <div className="sidebar-foot">
        <div className="capability-meter">
          <span className="live-dot" />
          <div>
            <strong>
              {permissions.size} / {PERMISSION_KEYS.length} صلاحية
            </strong>
            <span>إصدار الصلاحيات {revision}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
