"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { usePermission } from "@/components/auth/use-permission";
import { ModuleIcon } from "@/components/shell/module-icon";
import { firstPermittedPath, MODULES } from "@/lib/rbac/modules";

export function Sidebar() {
  const pathname = usePathname();
  const { hasPermission, permissions, revision } = usePermission();

  const visibleModules = MODULES.filter((module) =>
    hasPermission(module.permission),
  );
  const homeHref = firstPermittedPath(Array.from(permissions));

  return (
    <aside className="sidebar">
      <Link className="brand" href={homeHref}>
        <span className="brand-mark">K</span>
        <span className="brand-copy">
          <strong>كانجو</strong>
          <span>منصة المؤسسات V2</span>
        </span>
      </Link>

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
            >
              <ModuleIcon name={module.icon} />
              <span>{module.label}</span>
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
            <strong>{permissions.size} صلاحية</strong>
            <span>إصدار الصلاحيات {revision}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
