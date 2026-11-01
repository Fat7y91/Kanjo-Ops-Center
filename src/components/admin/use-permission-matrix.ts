"use client";

import { useCallback, useState } from "react";

import type { AppUser, CityTeam } from "@/lib/rbac/types";
import { useUserCapabilities } from "@/components/admin/use-user-capabilities";
import { maxAssignableLevel } from "@/lib/rbac/hierarchy";
import {
  COURIER_LEVEL,
  emptyForm,
  type CityOption,
  type CreateForm,
  type LevelOption,
} from "@/components/admin/user-form-types";

type Args = {
  initialUsers: AppUser[];
  initialRevision: number;
  viewerId: string;
  viewerLevel: number;
  viewerGlobalScope: boolean;
  assignableLevels: LevelOption[];
  assignableCities: CityOption[];
  teams: CityTeam[];
};

/**
 * Matrix orchestration: combines capability mutations with the create/scope
 * dialogs. Split from `use-user-capabilities` so each file stays small and the
 * dialog state does not re-create the per-row callbacks.
 */
export function usePermissionMatrix(args: Args) {
  const caps = useUserCapabilities(args);
  const [createOpen, setCreateOpen] = useState(false);
  const [teams, setTeams] = useState<CityTeam[]>(args.teams);
  const [createForm, setCreateFormState] = useState<CreateForm>(() =>
    emptyForm(args.assignableLevels, args.assignableCities),
  );
  const [savingCreate, setSavingCreate] = useState(false);
  const [scopeTarget, setScopeTarget] = useState<AppUser | null>(null);
  const [scopeCities, setScopeCities] = useState<string[]>([]);
  const [savingScope, setSavingScope] = useState(false);

  /**
   * A team is city-bound, so dropping its city from the courier scope must also
   * drop the team: otherwise the dialog would submit a team the rep cannot own.
   */
  const setCreateForm = useCallback((next: CreateForm) => {
    const team = next.teamId
      ? teams.find((candidate) => candidate.id === next.teamId)
      : undefined;
    if (team && !next.cityIds.includes(team.cityId)) {
      setCreateFormState({ ...next, teamId: "", teamCityId: "" });
      return;
    }
    setCreateFormState(next);
  }, [teams]);

  const addTeam = useCallback((team: CityTeam) => {
    setTeams((current) =>
      current.some((candidate) => candidate.id === team.id)
        ? current
        : [...current, team],
    );
  }, []);

  const openCreate = useCallback(() => {
    setCreateFormState(emptyForm(args.assignableLevels, args.assignableCities));
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
        const response = await fetch("/api/admin/users/provision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: createForm.phone,
            password: createForm.password,
            fullName: createForm.name,
            email: createForm.email.trim() || undefined,
            title: createForm.title,
            teamId:
              Number(createForm.clearanceLevel) === COURIER_LEVEL
                ? createForm.teamId || undefined
                : undefined,
            clearanceLevel: Number(createForm.clearanceLevel),
            accessibleCities: createForm.cityIds,
            permissions: createForm.permissions,
          }),
        });
        const payload = (await response.json()) as {
          account?: { id: string };
          error?: string;
        };
        if (!response.ok || !payload.account) {
          caps.setError(payload.error ?? "تعذر إنشاء المستخدم.");
          return;
        }
        setCreateOpen(false);
        setCreateFormState(
          emptyForm(args.assignableLevels, args.assignableCities),
        );
        caps.reloadUsers();
      } catch {
        caps.setError("تعذر إنشاء المستخدم.");
      } finally {
        setSavingCreate(false);
      }
    },
    [
      args.assignableCities,
      args.assignableLevels,
      caps.setError,
      caps.reloadUsers,
      createForm,
    ],
  );

  return {
    ...caps,
    // Same helper the server guard uses, so the badge and the accepted ranks
    // cannot disagree (executives may assign up to their own level).
    maxAssignable: maxAssignableLevel({
      clearanceLevel: args.viewerLevel,
      globalScope: args.viewerGlobalScope,
    }),
    createForm,
    createOpen,
    savingCreate,
    scopeTarget,
    scopeCities,
    savingScope,
    teams,
    setCreateForm,
    setCreateOpen,
    setScopeCities,
    setScopeTarget,
    openCreate,
    openScope,
    saveScope,
    submitCreate,
    addTeam,
  };
}

export type { CreateForm, LevelOption, CityOption };
