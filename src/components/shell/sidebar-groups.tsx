"use client";

import Link from "next/link";
import { useState } from "react";

import { ModuleIcon } from "@/components/shell/module-icon";
import { NavLinkStatus } from "@/components/shell/nav-link-status";
import { Button } from "@/components/ui/button";
import type { ModuleDefinition } from "@/lib/rbac/modules";

export type SidebarGroup = {
  id: string;
  label: string;
  modules: ModuleDefinition[];
  children: SidebarGroup[];
};

type SidebarGroupsProps = {
  groups: SidebarGroup[];
  activeHref: string;
  onNavigate: () => void;
};

function NavItem({
  module,
  active,
  onNavigate,
}: {
  module: ModuleDefinition;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={module.href}
      title={module.label}
      className={`nav-link${active ? " is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
    >
      <ModuleIcon name={module.icon} />
      <span className="nav-link-label">{module.label}</span>
      <NavLinkStatus />
    </Link>
  );
}

function GroupBlock({
  group,
  activeHref,
  onNavigate,
}: {
  group: SidebarGroup;
  activeHref: string;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className={`nav-group${open ? " is-open" : ""}`}>
      <Button
        variant="ghost"
        size="sm"
        className="nav-group-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{group.label}</span>
        <svg className="nav-chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </Button>

      {open ? (
        <div className="nav-group-body">
          {group.modules.map((module) => (
            <NavItem
              key={module.href}
              module={module}
              active={module.href === activeHref}
              onNavigate={onNavigate}
            />
          ))}

          {group.children.map((child) => (
            <div className="nav-subgroup" key={child.id}>
              <span className="nav-subgroup-label">{child.label}</span>
              {child.modules.map((module) => (
                <NavItem
                  key={module.href}
                  module={module}
                  active={module.href === activeHref}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Grouped navigation list.
 *
 * The full hierarchy stays in the DOM on every breakpoint. Collapsed mode is a
 * visual contract owned by CSS: labels and group headers disappear until the
 * rail is hovered or focused, so hover-to-expand needs no second render pass.
 */
export function SidebarGroups({
  groups,
  activeHref,
  onNavigate,
}: SidebarGroupsProps) {
  return (
    <nav className="nav" aria-label="وحدات مساحة العمل">
      {groups.map((group) => (
        <GroupBlock
          key={group.id}
          group={group}
          activeHref={activeHref}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}
