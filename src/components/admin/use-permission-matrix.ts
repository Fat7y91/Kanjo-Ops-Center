"use client";

import { useCallback, useState } from "react";

import type { AppUser } from "@/lib/rbac/types";
import { useUserCapabilities } from "@/components/admin/use-user-capabilities";
import type { CityOption, LevelOption } from "@/components/admin/user-form-types";
import {
  emptyForm,
  type CreateForm,
} from "@/components/admin/user-form-types";

type Args = {
  initialUsers: AppUser[];
  initialRevision: number;
  viewerId: string;
  viewerLevel: number;
  viewerGlobalScope: boolean;
  assignableLevels: LevelOption[];
  assignableCities: CityOption[];
};

/**
 * Matrix orchestration: combines capability mutations with the create/scope
 * dialogs. Split from `use-user-capabilities` so each file stays small and the
 * dialog state does not re-create the per-row callbacks.
 */
export function usePermissionMatrix(args: Args) {
  const caps = useUserCapabilities(args);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(() =>
    emptyForm(args.assignableLevels, args.assignableCities),
  );
  const [savingCreate, setSavingCreate] = useState(false);
  const [scopeTarget, setScopeTarget] = useState<AppUser | null>(null);
  const [scopeCities, setScopeCities] = useState<string[]>([]);
  const [savingScope, setSavingScope] = useState(false);

  const openCreate = useCallback(() => {
    setCreateForm(emptyForm(args.assignableLevels, args.assignableCities));
    caps.setError(null);
    setCreateOpen(true);
  }, [args.assignableCities, args.assignableLevels, caps.setError]);

  const openScope = useCallback(
    (user: AppUser) => {
      setScopeTarget(user);
      setScopeCities(
        user.accessibleCities.filter((cityId) =>
          args.assignableCities.some((city) => city.id === cityId),
        ),
      );
      caps.setError(null);
    },
    [args.assignableCities, caps.setError],
  );

  const saveScope = useCallback(async () => {
    if (!scopeTarget) return;
    setSavingScope(true);
    const ok = await caps.patchUser(
      `scope:${scopeTarget.id}`,
      scopeTarget.id,
      { accessibleCities: scopeCities },
    );
    setSavingScope(false);
    if (ok) setScopeTarget(null);
  }, [caps.patchUser, scopeCities, scopeTarget]);

  const submitCreate = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSavingCreate(true);
      caps.setError(null);
      try {
        const response = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: createForm.name,
            email: createForm.email,
            title: createForm.title,
            team: createForm.team,
            clearanceLevel: Number(createForm.clearanceLevel),
            accessibleCities: createForm.cityIds,
            permissions: [],
          }),
        });
        const payload = (await response.json()) as {
          user?: AppUser;
          revision?: number;
          error?: string;
        };
        if (!response.ok || !payload.user) {
          caps.setError(payload.error ?? "تعذر إنشاء المشغّل.");
          return;
        }
        if (caps.withinViewer(payload.user)) {
          caps.insertCreatedUser(payload.user, payload.revision);
        }
        setCreateOpen(false);
        setCreateForm(emptyForm(args.assignableLevels, args.assignableCities));
      } catch {
        caps.setError("تعذر إنشاء المشغّل.");
      } finally {
        setSavingCreate(false);
      }
    },
    [
      args.assignableCities,
      args.assignableLevels,
      caps.setError,
      caps.withinViewer,
      caps.insertCreatedUser,
      createForm,
    ],
  );

  return {
    ...caps,
    maxAssignable: Math.max(0, args.viewerLevel - 1),
    createForm,
    createOpen,
    savingCreate,
    scopeTarget,
    scopeCities,
    savingScope,
    setCreateForm,
    setCreateOpen,
    setScopeCities,
    setScopeTarget,
    openCreate,
    openScope,
    saveScope,
    submitCreate,
  };
}

export type { CreateForm, LevelOption, CityOption };
