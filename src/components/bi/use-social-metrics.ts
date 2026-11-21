"use client";

import { useEffect, useState } from "react";
import { z } from "zod";

import {
  socialSummarySchema,
  type SocialSummary,
} from "@/lib/marketing/social/types";

const responseSchema = z.object({ summary: socialSummarySchema });

export function useSocialMetrics(enabled: boolean): SocialSummary | null {
  const [summary, setSummary] = useState<SocialSummary | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSummary(null);
      return;
    }

    const controller = new AbortController();
    let active = true;

    fetch("/api/marketing/social", {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return responseSchema.safeParse(await response.json());
      })
      .then((result) => {
        if (active && result?.success) setSummary(result.data.summary);
      })
      .catch(() => {
        // A failed read leaves the last snapshot on screen.
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [enabled]);

  return summary;
}
