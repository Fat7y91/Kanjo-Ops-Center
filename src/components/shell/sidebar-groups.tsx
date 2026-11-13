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
  collapsed: boolean;
  onNavigate: () => void;
};

function NavItem({
  module,
  active,
  collapsed,
  onNavigate,
}: {
  module: ModuleDefinition;
  active: boolean;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={module.href}
      title={collapsed ? module.label : undefined}
      aria-label={collapsed ? module.label : undefined}
      className={`nav-link${active ? " is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
    >
      <ModuleIcon name={module.icon} />
      <span className="nav-link-label">{module.label}</span>
      {collapsed ? null : <NavLinkStatus />}
    </Link>
  );
}

function GroupBlock({
  group,
  activeHref,
  collapsed,
  onNavigate,
}: {
  group: SidebarGroup;
  activeHref: string;
  collapsed: boolean;
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
              collapsed={collapsed}
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
                  collapsed={collapsed}
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
 * Collapsed mode flattens the hierarchy to one icon strip: the group headers
 * would consume more vertical space than the rows they label, and the icon plus
 * tooltip is still a complete affordance.
 */
export function SidebarGroups({
  groups,
  activeHref,
  collapsed,
  onNavigate,
}: SidebarGroupsProps) {
  if (collapsed) {
    const modules = groups.flatMap(function flatten(group): ModuleDefinition[] {
      return [...group.modules, ...group.children.flatMap(flatten)];
    });

    return (
      <nav className="nav" aria-label="وحدات مساحة العمل">
        {modules.map((module) => (
          <NavItem
            key={module.href}
            module={module}
            active={module.href === activeHref}
            collapsed
            onNavigate={onNavigate}
          />
        ))}
      </nav>
    );
  }

  return (
    <nav className="nav" aria-label="وحدات مساحة العمل">
      {groups.map((group) => (
        <GroupBlock
          key={group.id}
          group={group}
          activeHref={activeHref}
          collapsed={false}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}
