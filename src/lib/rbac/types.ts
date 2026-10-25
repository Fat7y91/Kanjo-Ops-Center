import type { Permission } from "./permissions";

/**
 * Application identity. There is deliberately no `role` field: authorization
 * decisions are made exclusively from the `permissions` capability set.
 *
 * `title` is presentation-only and must never be used to gate UI or routes.
 */
export type AppUser = {
  id: string;
  name: string;
  email: string;
  title: string;
  permissions: Permission[];
  active: boolean;
  updatedAt: string;
};

export type SessionUser = Pick<AppUser, "id" | "name" | "email" | "title">;

export type ActiveSession = {
  user: SessionUser;
  permissions: Permission[];
  revision: number;
};
