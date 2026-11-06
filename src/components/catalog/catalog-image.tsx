"use client";

import { useEffect, useState, type ComponentProps } from "react";

import { proxyImageUrl, resolveDisplayImageUrl } from "@/lib/catalog/format";

type CatalogImageProps = Omit<ComponentProps<"img">, "src"> & {
  src: string | null | undefined;
};

/**
 * Product / merchant image with a same-origin first hop.
 *
 * Drive bytes are streamed through `/api/image` so the `<img>` only ever talks
 * to the app origin: operator networks that block Google, and preview tunnels
 * that refuse cross-origin `/_next` assets, can still render the photo. The
 * direct Google host is the fallback when the proxy itself fails. Non-Drive
 * sources (data URLs, Storage) render as-is.
 */
export function CatalogImage({ src, onError, ...rest }: CatalogImageProps) {
  const direct = resolveDisplayImageUrl(src);
  const proxied = proxyImageUrl(src);
  const [preferDirect, setPreferDirect] = useState(false);

  useEffect(() => {
    setPreferDirect(false);
  }, [src]);

  if (!direct) return null;

  const usingDirect = preferDirect || proxied === null;
  const current = usingDirect ? direct : proxied;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...rest}
      src={current}
      onError={(event) => {
        if (!usingDirect) {
          setPreferDirect(true);
          return;
        }
        onError?.(event);
      }}
    />
  );
}
