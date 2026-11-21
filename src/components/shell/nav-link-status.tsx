"use client";

import { useLinkStatus } from "next/link";

/**
 * Renders a subtle spinner inside a <Link> while its route is being fetched.
 * Must be a descendant of the Link it reports on.
 */
export function NavLinkStatus() {
  const { pending } = useLinkStatus();

  if (!pending) return null;

  return <span className="nav-link-spinner" aria-hidden="true" />;
}
