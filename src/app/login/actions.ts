"use server";

import { redirect } from "next/navigation";

import {
  clearSessionCookie,
  writeSessionCookie,
} from "@/lib/auth/server-session";
import { firstPermittedPath } from "@/lib/rbac/modules";
import { getUserById } from "@/lib/rbac/users";

function safeNext(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export async function loginAction(formData: FormData): Promise<void> {
  const userId = String(formData.get("userId") ?? "");
  const user = getUserById(userId);

  if (!user || !user.active) {
    redirect("/login?error=unknown-user");
  }

  await writeSessionCookie(user.id);
  redirect(
    safeNext(formData.get("next")) ?? firstPermittedPath(user.permissions),
  );
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
