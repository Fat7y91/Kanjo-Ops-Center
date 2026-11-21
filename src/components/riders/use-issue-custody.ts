"use client";

import { useMemo, useState } from "react";

import { buildItemSerial } from "@/lib/riders/codes";
import {
  DEFAULT_CASH_CUSTODY,
  DEFAULT_HANDOVER_OFFICER,
  buildDefaultItems,
} from "@/lib/riders/defaults";
import { isoToday } from "@/lib/riders/format";
import { tafqeetEGP } from "@/lib/riders/tafqeet";
import {
  custodyTotal,
  normalizeItems,
  totalItemCount,
} from "@/lib/riders/totals";
import type {
  CustodyIssueResult,
  CustodyItemDraft,
  CustodyItemKey,
  LocationCatalog,
  Rider,
} from "@/lib/riders/types";

import { useCustodyLocation } from "./use-custody-location";
import { useRiderLookup } from "./use-rider-lookup";

type UseIssueCustodyArgs = {
  locations: LocationCatalog;
  initialRider: Rider | null;
  onIssued: (result: CustodyIssueResult) => void;
};

export function useIssueCustody({
  locations,
  initialRider,
  onIssued,
}: UseIssueCustodyArgs) {
  const location = useCustodyLocation({ locations, initialRider });
  const [fullName, setFullName] = useState(initialRider?.fullName ?? "");
  const [nationalId, setNationalId] = useState(initialRider?.nationalId ?? "");
  const [phone, setPhone] = useState(initialRider?.phone ?? "");
  const [workArea, setWorkArea] = useState(initialRider?.workArea ?? "");
  const [deliveryDate, setDeliveryDate] = useState(isoToday());
  const [handoverOfficer, setHandoverOfficer] = useState(
    DEFAULT_HANDOVER_OFFICER,
  );
  const [items, setItems] = useState<CustodyItemDraft[]>(buildDefaultItems);
  const [cashCustody, setCashCustody] = useState(DEFAULT_CASH_CUSTODY);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const lookup = useRiderLookup({
    onFound: (rider) => {
      setFullName(rider.fullName);
      setPhone(rider.phone);
      setWorkArea(rider.workArea || rider.fullName);
      location.applyRider(rider);
    },
  });

  const initialLocked =
    initialRider !== null && nationalId === initialRider.nationalId;
  const locked = lookup.lookup !== null || initialLocked;
  const hasBlockingLookup = lookup.hasBlockingLookup;

  const normalizedItems = useMemo(() => normalizeItems(items), [items]);
  const total = custodyTotal(normalizedItems, cashCustody);
  const words = tafqeetEGP(total);
  const itemCount = totalItemCount(normalizedItems);

  const serials = useMemo(() => {
    const map = new Map<CustodyItemKey, string | null>();
    for (const item of items) {
      map.set(
        item.key,
        location.parts && location.sequence
          ? buildItemSerial(
              item.key,
              location.parts,
              location.sequence,
              item.quantity,
              item.codePrefix,
            )
          : null,
      );
    }
    return map;
  }, [items, location.parts, location.sequence]);

  function updateItem(key: CustodyItemKey, patch: Partial<CustodyItemDraft>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function changeNationalId(value: string) {
    setNationalId(value.replace(/\D/g, "").slice(0, 14));
    lookup.reset();
    location.unlock();
  }

  async function submit() {
    setError("");
    if (hasBlockingLookup) return;
    if (!location.governorate || !location.city || !location.sequence) {
      setError("اختر المحافظة والمدينة أولاً.");
      return;
    }
    if (!location.parts) {
      setError("بيانات الموقع غير مكتملة.");
      return;
    }
    if (!fullName.trim()) {
      setError("اسم المندوب مطلوب.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/riders/custody", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          governorate: location.governorate,
          city: location.city,
          sequence: location.sequence,
          fullName,
          nationalId,
          phone,
          workArea,
          deliveryDate,
          handoverOfficer,
          items: items.map((item) => ({
            key: item.key,
            label: item.label,
            codePrefix: item.codePrefix,
            quantity: item.quantity,
            condition: item.condition,
            unitPrice: item.unitPrice,
          })),
          cashCustody,
          totalAmount: total,
          notes,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        custody?: CustodyIssueResult;
        error?: string;
      };
      if (!response.ok || !body.custody) {
        setError(body.error ?? "تعذر إصدار إيصال العهدة.");
        return;
      }
      onIssued(body.custody);
    } catch {
      setError("تعذر الاتصال بالخادم.");
    } finally {
      setSubmitting(false);
    }
  }

  return {
    governorate: location.governorate,
    city: location.city,
    sequence: location.sequence,
    nextLoading: location.nextLoading,
    cityOptions: location.cityOptions,
    riderCode: location.riderCode,
    custodyNumber: location.custodyNumber,
    fullName,
    nationalId,
    phone,
    workArea,
    deliveryDate,
    handoverOfficer,
    items,
    cashCustody,
    notes,
    lookup: lookup.lookup,
    lookupState: lookup.state,
    locked,
    hasBlockingLookup,
    normalizedItems,
    total,
    words,
    itemCount,
    serials,
    formError: error || location.error || lookup.error,
    submitting,
    setFullName,
    setPhone,
    setWorkArea,
    setDeliveryDate,
    setHandoverOfficer,
    setCashCustody,
    setNotes,
    changeGovernorate: location.changeGovernorate,
    changeCity: location.changeCity,
    changeNationalId,
    checkRider: () => lookup.check(nationalId),
    updateItem,
    submit,
  };
}
