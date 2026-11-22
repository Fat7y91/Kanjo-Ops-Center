import { cairoDay, toKanjoBusinessDay } from "@/lib/couriers/tiered-pay";

import type { BiFilters, BiRange } from "./types";

/**
 * Dashboard time window.
 *
 * Presets resolve against the Kanjo operating day (14:00 → 14:00 Africa/Cairo),
 * while a custom window is entered as Cairo wall-clock date and hour. The UI
 * never sends UTC; the conversion happens here so every widget shares one
 * boundary definition.
 */

const TIME_ZONE = "Africa/Cairo";
const DAY_MS = 24 * 60 * 60 * 1000;

const wallClock = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

type TimeWindow = { from: Date | null; to: Date | null };

function cairoOffsetMs(instant: Date): number {
  const parts = wallClock.formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const wallClockUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );
  return wallClockUtc - instant.getTime();
}

/** UTC instant for a Cairo wall-clock day/hour/minute. */
export function cairoWallToUtc(
  day: string,
  hour = 0,
  minute = 0,
): Date {
  const [year, month, date] = day.split("-").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, date, hour, minute, 0));
  return new Date(guess.getTime() - cairoOffsetMs(guess));
}

function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function parseCustom(value: string, endOfDay: boolean): Date | null {
  if (!value) return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(value);
  if (!match) return null;
  const day = match[1];
  const hasTime = match[2] !== undefined;
  const hour = hasTime ? Number(match[2]) : 0;
  const minute = hasTime ? Number(match[3]) : 0;
  const start = cairoWallToUtc(day, hour, minute);
  return endOfDay && !hasTime ? new Date(start.getTime() + DAY_MS - 1) : start;
}

/** Resolves the filter bar selection into an inclusive instant window. */
export function resolveBiWindow(
  filters: Pick<BiFilters, "range" | "from" | "to">,
  now: Date = new Date(),
): TimeWindow {
  const today = cairoDay(now.toISOString());

  switch (filters.range) {
    case "business_day":
      return {
        from: cairoWallToUtc(toKanjoBusinessDay(now), 14),
        to: now,
      };
    case "7d":
      return { from: cairoWallToUtc(addDays(today, -6), 0), to: now };
    case "30d":
      return { from: cairoWallToUtc(addDays(today, -30), 0), to: now };
    case "90d":
      return { from: cairoWallToUtc(addDays(today, -90), 0), to: now };
    case "month":
      return {
        from: cairoWallToUtc(`${today.slice(0, 7)}-01`, 0),
        to: now,
      };
    case "ytd":
      return {
        from: cairoWallToUtc(`${today.slice(0, 4)}-01-01`, 0),
        to: now,
      };
    case "custom":
      return {
        from: parseCustom(filters.from, false),
        to: parseCustom(filters.to, true),
      };
    default:
      return { from: null, to: null };
  }
}

/** Inclusive window membership for an ISO timestamp. */
export function withinBiWindow(
  iso: string | null | undefined,
  window: TimeWindow,
): boolean {
  if (!window.from && !window.to) return true;
  if (!iso) return false;
  const value = new Date(iso).getTime();
  if (Number.isNaN(value)) return false;
  if (window.from && value < window.from.getTime()) return false;
  if (window.to && value > window.to.getTime()) return false;
  return true;
}

/**
 * Lower bound for a preset, kept for widgets that only need a start date.
 * `custom` has no standalone start, so it falls back to `null`.
 */
export function rangeStart(range: BiRange): Date | null {
  return resolveBiWindow({ range, from: "", to: "" }).from;
}
