"use client";

import { useEffect, useMemo, useState } from "react";

import { buildItemSerial, type LocationCodeParts } from "@/lib/riders/codes";
import {
  DEFAULT_CASH_CUSTODY,
  buildDefaultItems,
} from "@/lib/riders/defaults";
import { tafqeetEGP } from "@/lib/riders/tafqeet";
import {
  custodyTotal,
  normalizeItems,
  totalItemCount,
} from "@/lib/riders/totals";
import type {
  AssetSequences,
  CustodyItemDraft,
  CustodyItemKey,
} from "@/lib/riders/types";

type UseCustodyItemsArgs = {
  parts: LocationCodeParts | null;
  assetSequences: AssetSequences | null;
};

export function useCustodyItems({
  parts,
  assetSequences,
}: UseCustodyItemsArgs) {
  const [items, setItems] = useState<CustodyItemDraft[]>(buildDefaultItems);
  const [cashCustody, setCashCustody] = useState(DEFAULT_CASH_CUSTODY);

  useEffect(() => {
    if (!parts || !assetSequences) return;
    setItems((current) => {
      let changed = false;
      const next = current.map((item) => {
        if (item.quantity <= 0) {
          if (!item.serial) return item;
          changed = true;
          return { ...item, serial: null };
        }
        if (item.serial || item.key === "OTHER") return item;
        const sequence = assetSequences[item.key];
        if (!sequence) return item;
        changed = true;
        return {
          ...item,
          serial: buildItemSerial(
            item.key,
            parts,
            sequence,
            item.quantity,
            item.codePrefix,
          ),
        };
      });
      return changed ? next : current;
    });
  }, [parts, assetSequences]);

  const normalizedItems = useMemo(() => normalizeItems(items), [items]);
  const total = custodyTotal(normalizedItems, cashCustody);
  const words = tafqeetEGP(total);
  const itemCount = totalItemCount(normalizedItems);

  function clearSerials() {
    setItems((current) =>
      current.map((item) => (item.serial ? { ...item, serial: null } : item)),
    );
  }

  function updateItem(key: CustodyItemKey, patch: Partial<CustodyItemDraft>) {
    setItems((current) =>
      current.map((item) => {
        if (item.key !== key) return item;
        const next = { ...item, ...patch };
        if (patch.quantity !== undefined) {
          if (next.quantity <= 0) {
            next.serial = null;
          } else if (!item.serial && next.key !== "OTHER") {
            const sequence = assetSequences?.[next.key];
            if (sequence && parts) {
              next.serial = buildItemSerial(
                next.key,
                parts,
                sequence,
                next.quantity,
                next.codePrefix,
              );
            }
          }
        }
        return next;
      }),
    );
  }

  return {
    items,
    cashCustody,
    setCashCustody,
    normalizedItems,
    total,
    words,
    itemCount,
    clearSerials,
    updateItem,
  };
}
