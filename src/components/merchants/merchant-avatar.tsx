"use client";

import { useState } from "react";

import { CatalogImage } from "@/components/catalog/catalog-image";
import { merchantInitials } from "@/lib/merchants/format";

type MerchantAvatarSize = "sm" | "md" | "lg";

type MerchantAvatarProps = {
  name: string;
  logoUrl?: string | null;
  size?: MerchantAvatarSize;
  className?: string;
};

/**
 * Merchant identity mark.
 *
 * Real logos stream through `CatalogImage`, inheriting the same-origin proxy so
 * a globe-blocked operator network still renders them. A merchant without a
 * logo — or whose logo fails to load — gets a brand-purple monogram rather than
 * a broken image or an empty box.
 */
export function MerchantAvatar({
  name,
  logoUrl,
  size = "md",
  className,
}: MerchantAvatarProps) {
  const [failed, setFailed] = useState(false);
  const classes = ["merchant-avatar", `merchant-avatar-${size}`, className]
    .filter(Boolean)
    .join(" ");
  const showLogo = Boolean(logoUrl) && !failed;

  return (
    <span className={classes} aria-hidden="true">
      {showLogo ? (
        <CatalogImage
          src={logoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="merchant-avatar-initial">
          {merchantInitials(name)}
        </span>
      )}
    </span>
  );
}
