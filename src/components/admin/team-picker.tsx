"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-inputs";
import { SelectMenu } from "@/components/ui/select-menus";
import type { CityTeam } from "@/lib/rbac/types";
import type { CityOption } from "@/components/admin/user-form-types";

const NEW_TEAM = "__new_team__";

type TeamPickerProps = {
  cities: CityOption[];
  cityIds: string[];
  teams: CityTeam[];
  teamId: string;
  teamCityId: string;
  onChange: (next: { teamId: string; teamCityId: string }) => void;
  onTeamCreated: (team: CityTeam) => void;
};

/**
 * City-dependent team picker.
 *
 * A team belongs to exactly one city, so the option list is filtered by the
 * city the operator belongs to. When the courier is scoped to several cities
 * the owning city is chosen first; with a single city it is implied. Creating a
 * team posts to `/api/admin/teams` and selects it immediately, so the operator
 * never has to leave the dialog.
 */
export function TeamPicker({
  cities,
  cityIds,
  teams,
  teamId,
  teamCityId,
  onChange,
  onTeamCreated,
}: TeamPickerProps) {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cityOptions = useMemo(
    () => cities.filter((city) => cityIds.includes(city.id)),
    [cities, cityIds],
  );
  const activeCityId =
    cityIds.length === 1
      ? cityIds[0]
      : cityOptions.some((city) => city.id === teamCityId)
        ? teamCityId
        : "";

  const cityTeams = useMemo(
    () => teams.filter((team) => team.cityId === activeCityId),
    [teams, activeCityId],
  );

  if (cityIds.length === 0) {
    return (
      <SelectMenu
        label="الفريق"
        hint="اختر مدينة أولاً؛ الفرق تتبع المدينة."
        value={null}
        onChange={() => undefined}
        disabled
        options={[]}
      />
    );
  }

  async function createTeam() {
    const name = draftName.trim();
    if (!activeCityId || name.length < 2) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cityId: activeCityId, name }),
      });
      const payload = (await response.json()) as {
        team?: CityTeam;
        error?: string;
      };
      if (!response.ok || !payload.team) {
        setError(payload.error ?? "تعذر إنشاء الفريق.");
        return;
      }
      onTeamCreated(payload.team);
      onChange({ teamId: payload.team.id, teamCityId: payload.team.cityId });
      setDraftName("");
      setCreating(false);
    } catch {
      setError("تعذر إنشاء الفريق.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="form-grid">
      {cityIds.length > 1 ? (
        <SelectMenu
          label="مدينة الفريق"
          value={activeCityId || null}
          onChange={(next) => onChange({ teamId: "", teamCityId: next })}
          options={cityOptions.map((city) => ({
            value: city.id,
            label: city.name,
          }))}
        />
      ) : null}

      <SelectMenu
        label="الفريق"
        hint="إلزامي للمندوب الميداني."
        value={creating ? NEW_TEAM : teamId || null}
        onChange={(next) => {
          if (next === NEW_TEAM) {
            setCreating(true);
            setError(null);
            return;
          }
          setCreating(false);
          onChange({ teamId: next, teamCityId: activeCityId });
        }}
        options={[
          ...cityTeams.map((team) => ({ value: team.id, label: team.name })),
          { value: NEW_TEAM, label: "فريق جديد…" },
        ]}
        disabled={!activeCityId}
        required
      />

      {creating ? (
        <>
          <TextField
            label="اسم الفريق الجديد"
            hint="يُنشأ داخل المدينة المحددة."
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            required
          />
          <div className="form-actions">
            <Button
              variant="quiet"
              size="sm"
              onClick={() => {
                setCreating(false);
                setDraftName("");
                setError(null);
              }}
            >
              تراجع
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={saving || draftName.trim().length < 2}
              onClick={() => void createTeam()}
            >
              {saving ? "جارٍ الإنشاء..." : "إنشاء الفريق"}
            </Button>
          </div>
        </>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
