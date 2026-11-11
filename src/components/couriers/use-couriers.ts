"use client";

import { useCallback, useMemo, useState } from "react";

import type { Courier, CourierStatus } from "@/lib/couriers/types";

export type CourierFilters = {
  query: string;
  status: CourierStatus | "all";
};

const EMPTY_FILTERS: CourierFilters = {
  query: "",
  status: "all",
};

/** View state for the couriers roster: filters, selection and modal flags. */
export function useCouriers(initialCouriers: Courier[]) {
  const [couriers, setCouriers] = useState<Courier[]>(
    Array.isArray(initialCouriers) ? initialCouriers : [],
  );
  const [filters, setFilters] = useState<CourierFilters>(EMPTY_FILTERS);
  const [editing, setEditing] = useState<Courier | null>(null);
  const [viewing, setViewing] = useState<Courier | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  function setFilter<K extends keyof CourierFilters>(
    key: K,
    value: CourierFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const visible = useMemo(() => {
    const query = filters.query.trim().toLocaleLowerCase("ar");
    return couriers.filter((courier) => {
      if (filters.status === "active" && !courier.active) return false;
      if (filters.status === "inactive" && courier.active) return false;
      if (!query) return true;
      return [courier.displayName, courier.phone].some((value) =>
        value.toLocaleLowerCase("ar").includes(query),
      );
    });
  }, [couriers, filters]);

  function notify(message: string) {
    setError("");
    setToast(message);
  }

  const dismissToast = useCallback(() => setToast(""), []);

  const applySaved = useCallback((courier: Courier, message: string) => {
    setCouriers((current) => {
      const exists = current.some((row) => row.id === courier.id);
      return exists
        ? current.map((row) => (row.id === courier.id ? courier : row))
        : [courier, ...current];
    });
    setError("");
    setToast(message);
  }, []);

  async function remove(courier: Courier) {
    setError("");
    try {
      const response = await fetch(`/api/couriers/${courier.id}`, {
        method: "DELETE",
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? "تعذر حذف مندوب التوصيل.");
        return;
      }
      setCouriers((current) => current.filter((row) => row.id !== courier.id));
      notify("تم حذف مندوب التوصيل.");
    } catch {
      setError("تعذر الاتصال بالخادم.");
    }
  }

  return {
    couriers,
    visible,
    filters,
    setFilter,
    editing,
    setEditing,
    viewing,
    setViewing,
    creating,
    setCreating,
    toast,
    error,
    dismissToast,
    applySaved,
    remove,
  };
}
