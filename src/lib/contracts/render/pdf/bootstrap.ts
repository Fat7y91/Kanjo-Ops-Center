/**
 * Edge bootstrap for `@react-pdf/renderer`.
 *
 * Cloudflare's edge runtime resolves `react` to the react-server build, which
 * does not expose the client internals symbol that react-pdf's reconciler reads
 * at module load. We borrow that symbol from the client build (aliased in
 * `next.config.ts` as `#react-client-internals`) and attach it before the
 * renderer is imported. `setImmediate` (used by the scheduler) is provided by a
 * webpack `ProvidePlugin` shim for the same reason.
 *
 * The renderer and document component are loaded through this dynamic boundary
 * so their module evaluation (which touches the React internals) always runs
 * after the injection above.
 */

import React from "react";
// @ts-expect-error private alias resolved by the webpack config for the edge bundle
import * as clientReact from "#react-client-internals";

import { CAIRO_REGULAR_BASE64, CAIRO_BOLD_BASE64 } from "../data/pdf-assets";

const CLIENT_KEY = "__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE";

export type PdfModule = typeof import("@react-pdf/renderer");

type Loaded = {
  pdf: PdfModule;
  render: typeof import("./document");
};

let cached: Promise<Loaded> | null = null;

function ensureInternals(): void {
  const target = React as unknown as Record<string, unknown>;
  const source = clientReact as unknown as Record<string, unknown>;
  if (!target[CLIENT_KEY] && source[CLIENT_KEY]) {
    target[CLIENT_KEY] = source[CLIENT_KEY];
  }
}

async function load(): Promise<Loaded> {
  ensureInternals();
  const pdf = (await import("@react-pdf/renderer")) as unknown as PdfModule;
  pdf.Font.register({
    family: "Cairo",
    fonts: [
      { src: `data:font/ttf;base64,${CAIRO_REGULAR_BASE64}`, fontWeight: 400 },
      { src: `data:font/ttf;base64,${CAIRO_BOLD_BASE64}`, fontWeight: 700 },
    ],
  });
  pdf.Font.registerHyphenationCallback((word) => [word]);
  const render = await import("./document");
  return { pdf, render };
}

/** Loads the renderer + document component after applying the edge patches. */
export function loadContractPdf(): Promise<Loaded> {
  if (!cached) cached = load();
  return cached;
}
