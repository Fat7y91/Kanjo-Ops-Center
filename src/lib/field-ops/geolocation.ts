"use client";

import type { GeoCapture } from "@/lib/field-ops/types";

export type GeoResult =
  | { ok: true; capture: GeoCapture }
  | { ok: false; reason: "unsupported" | "denied" | "unavailable" | "timeout" };

/**
 * One-shot high-accuracy GPS capture.
 *
 * Field reps often have a weak or missing fix, so this resolves with an
 * explicit failure reason instead of throwing. The Visit Engine records
 * "no fix" honestly rather than fabricating coordinates.
 */
export function captureLocation(options?: {
  timeout?: number;
  maximumAge?: number;
}): Promise<GeoResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ ok: false, reason: "unsupported" });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          ok: true,
          capture: {
            latitude: Number(position.coords.latitude.toFixed(6)),
            longitude: Number(position.coords.longitude.toFixed(6)),
            accuracy:
              typeof position.coords.accuracy === "number"
                ? Math.round(position.coords.accuracy)
                : null,
            capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
          },
        });
      },
      (error) => {
        const reason =
          error.code === error.PERMISSION_DENIED
            ? "denied"
            : error.code === error.POSITION_UNAVAILABLE
              ? "unavailable"
              : "timeout";
        resolve({ ok: false, reason });
      },
      {
        enableHighAccuracy: true,
        timeout: options?.timeout ?? 12_000,
        maximumAge: options?.maximumAge ?? 0,
      },
    );
  });
}

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

export function formatCoordinates(capture: GeoCapture | null | undefined): string {
  if (!capture) return "بدون إحداثيات";
  return `${capture.latitude.toFixed(5)}, ${capture.longitude.toFixed(5)}`;
}
