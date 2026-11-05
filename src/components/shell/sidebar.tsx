"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { usePermission } from "@/components/auth/use-permission";
import { ModuleIcon } from "@/components/shell/module-icon";
import { NavLinkStatus } from "@/components/shell/nav-link-status";
import {
  firstPermittedPath,
  moduleAllows,
  moduleInSidebar,
  MODULES,
} from "@/lib/rbac/modules";
import { PERMISSION_KEYS } from "@/lib/rbac/permissions";

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname() ?? "";
  const { permissions, clearanceLevel, revision } = usePermission();

  const visibleModules = MODULES.filter(
    (module) =>
      moduleInSidebar(module) &&
      moduleAllows(module, Array.from(permissions), clearanceLevel),
  );
  const homeHref = firstPermittedPath(
    Array.from(permissions),
    clearanceLevel,
  );

  return (
    <aside
      id="app-sidebar"
      className={`sidebar${open ? " is-open" : ""}`}
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
        <button
          type="button"
          className="sidebar-close"
          aria-label="إغلاق القائمة"
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {/*
        No `prefetch` on these links. Every module route is dynamic, so an
        explicit prefetch flag makes the sidebar render and stream all 19 module
        pages on mount — 19 Worker invocations per session for pages the user
        may never open. Default navigation is on-demand.
      */}
      <nav className="nav" aria-label="وحدات مساحة العمل">
        <p className="nav-section">مساحة العمل</p>
        {visibleModules.map((module) => {
          const active =
            pathname === module.href ||
            pathname.startsWith(`${module.href}/`);

          return (
            <Link
              key={module.href}
              href={module.href}
              className={`nav-link${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={onClose}
            >
              <ModuleIcon name={module.icon} />
              <span>{module.label}</span>
              <NavLinkStatus />
            </Link>
          );
        })}

        {visibleModules.length === 0 && (
          <p className="nav-empty">
            لا توجد وحدات ممنوحة لهذا الحساب حالياً.
          </p>
        )}
      </nav>

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
