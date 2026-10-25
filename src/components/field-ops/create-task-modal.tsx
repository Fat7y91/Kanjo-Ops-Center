"use client";

import { useEffect, useState } from "react";

import { Modal } from "@/components/field-ops/modal";
import { FIELD_TEAMS, type City, type FieldTeam } from "@/lib/field-ops/types";

type CreateTaskModalProps = {
  open: boolean;
  cities: City[];
  defaultTeam: string;
  onClose: () => void;
  onDone: (message: string) => void;
};

type FormState = {
  merchantName: string;
  cityId: string;
  team: FieldTeam;
  visitDate: string;
  targetCommission: string;
  estimatedMonthlyValue: string;
  strategicNotes: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CreateTaskModal({
  open,
  cities,
  defaultTeam,
  onClose,
  onDone,
}: CreateTaskModalProps) {
  const fallbackTeam: FieldTeam = FIELD_TEAMS.includes(
    defaultTeam as FieldTeam,
  )
    ? (defaultTeam as FieldTeam)
    : FIELD_TEAMS[0];

  const [form, setForm] = useState<FormState>({
    merchantName: "",
    cityId: cities[0]?.id ?? "",
    team: fallbackTeam,
    visitDate: todayIso(),
    targetCommission: "8",
    estimatedMonthlyValue: "100000",
    strategicNotes: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      merchantName: "",
      cityId: cities[0]?.id ?? "",
      team: fallbackTeam,
      visitDate: todayIso(),
      targetCommission: "8",
      estimatedMonthlyValue: "100000",
      strategicNotes: "",
    });
    setError("");
    setSaving(false);
  }, [open, cities, fallbackTeam]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await fetch("/api/field-ops/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          targetCommission: Number(form.targetCommission),
          estimatedMonthlyValue: Number(form.estimatedMonthlyValue),
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        merchantCreated?: boolean;
        merchant?: { name: string };
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not create the task.");
      }
      const name = payload.merchant?.name ?? form.merchantName;
      onDone(
        payload.merchantCreated
          ? `Task created and ${name} initialized as a merchant.`
          : `Task created for ${name}.`,
      );
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not create the task.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Create a field task"
      eyebrow="City operations"
      description="Creating a task also initializes the merchant when it does not exist yet. Only capability holders with task management can do this."
      onClose={onClose}
      wide
    >
      <form className="form-stack" onSubmit={submit}>
        <div className="form-grid">
          <label className="field">
            <span>Merchant name</span>
            <input
              value={form.merchantName}
              onChange={(event) =>
                update("merchantName", event.target.value)
              }
              placeholder="كافيار or Kaffyar Market"
              required
            />
          </label>
          <label className="field">
            <span>City</span>
            <select
              value={form.cityId}
              onChange={(event) => update("cityId", event.target.value)}
              required
            >
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Assigned team</span>
            <select
              value={form.team}
              onChange={(event) =>
                update("team", event.target.value as FieldTeam)
              }
            >
              {FIELD_TEAMS.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Visit date</span>
            <input
              type="date"
              value={form.visitDate}
              onChange={(event) => update("visitDate", event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Target commission (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step="0.5"
              value={form.targetCommission}
              onChange={(event) =>
                update("targetCommission", event.target.value)
              }
              required
            />
          </label>
          <label className="field">
            <span>Estimated monthly value</span>
            <input
              type="number"
              min={0}
              step="1000"
              value={form.estimatedMonthlyValue}
              onChange={(event) =>
                update("estimatedMonthlyValue", event.target.value)
              }
              required
            />
          </label>
        </div>

        <label className="field">
          <span>Strategic notes</span>
          <textarea
            rows={3}
            value={form.strategicNotes}
            onChange={(event) => update("strategicNotes", event.target.value)}
            placeholder="Key contacts, competitive pressure, negotiation position."
          />
        </label>

        <p className="inline-note">
          Reps see only their own team's tasks for the current day. Managers see
          the full board.
        </p>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="form-actions">
          <button type="button" className="button button-quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="button button-primary"
            disabled={saving}
          >
            {saving ? "Creating..." : "Create task"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
