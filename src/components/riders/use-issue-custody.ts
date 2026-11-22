"use client";

import { useMemo, useState } from "react";

import { DEFAULT_HANDOVER_OFFICER } from "@/lib/riders/defaults";
import { isoToday, riderStatusLabel } from "@/lib/riders/format";
import type {
  CustodyIssueResult,
  LocationCatalog,
  Rider,
} from "@/lib/riders/types";

import { useCustodyItems } from "./use-custody-items";
import { useCustodyLocation } from "./use-custody-location";
import { useRiderLookup } from "./use-rider-lookup";

type RiderMode = "new" | "existing";

type UseIssueCustodyArgs = {
  locations: LocationCatalog;
  riders: Rider[];
  initialRider: Rider | null;
  onIssued: (result: CustodyIssueResult) => void;
};

export function useIssueCustody({
  locations,
  riders,
  initialRider,
  onIssued,
}: UseIssueCustodyArgs) {
  const location = useCustodyLocation({ locations, initialRider });
  const items = useCustodyItems({
    parts: location.parts,
    assetSequences: location.assetSequences,
  });
  const [riderMode, setRiderMode] = useState<RiderMode>(
    initialRider ? "existing" : "new",
  );
  const [existingRiderId, setExistingRiderId] = useState<string | null>(
    initialRider?.id ?? null,
  );
  const [fullName, setFullName] = useState(initialRider?.fullName ?? "");
  const [nationalId, setNationalId] = useState(initialRider?.nationalId ?? "");
  const [phone, setPhone] = useState(initialRider?.phone ?? "");
  const [workArea, setWorkArea] = useState(initialRider?.workArea ?? "");
  const [deliveryDate, setDeliveryDate] = useState(isoToday());
  const [handoverOfficer, setHandoverOfficer] = useState(
    DEFAULT_HANDOVER_OFFICER,
  );
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

  const existingRider = useMemo(() => {
    if (!existingRiderId) return null;
    const found = riders.find((rider) => rider.id === existingRiderId);
    if (found) return found;
    return initialRider?.id === existingRiderId ? initialRider : null;
  }, [riders, existingRiderId, initialRider]);

  const locked =
    riderMode === "existing"
      ? existingRider !== null
      : lookup.lookup !== null;

  const hasBlockingLookup =
    riderMode === "existing"
      ? existingRider !== null && existingRider.status !== "active"
      : lookup.lookup !== null;

  const riderOptions = useMemo(() => {
    const gov = location.parts?.govAlpha;
    const city = location.parts?.cityAlpha;
    const options = riders
      .filter(
        (rider) =>
          (!gov || rider.governorateCode === gov) &&
          (!city || rider.cityCode === city),
      )
      .map((rider) => ({
        value: rider.id,
        label: `${rider.fullName} · ${rider.riderCode}`,
        hint: `${rider.workArea || "بدون منطقة"} · ${riderStatusLabel(rider.status)}`,
      }));
    if (existingRider && !options.some((item) => item.value === existingRider.id)) {
      options.unshift({
        value: existingRider.id,
        label: `${existingRider.fullName} · ${existingRider.riderCode}`,
        hint: existingRider.workArea || "بدون منطقة",
      });
    }
    return options;
  }, [riders, location.parts, existingRider]);

  function changeGovernorate(value: string) {
    location.changeGovernorate(value);
    items.clearSerials();
  }

  function changeCity(value: string) {
    location.changeCity(value);
    items.clearSerials();
  }

  function changeMode(index: number) {
    const next: RiderMode = index === 0 ? "new" : "existing";
    setRiderMode(next);
    setError("");
    lookup.reset();
    if (next === "new") {
      setExistingRiderId(null);
      setFullName("");
      setNationalId("");
      setPhone("");
      setWorkArea("");
      location.unlock();
      return;
    }
    if (existingRider) {
      selectExistingRider(existingRider.id);
    } else {
      location.unlock();
    }
  }

  function selectExistingRider(id: string) {
    const rider = riders.find((item) => item.id === id) ?? null;
    setExistingRiderId(id);
    if (!rider) return;
    setFullName(rider.fullName);
    setNationalId(rider.nationalId);
    setPhone(rider.phone);
    setWorkArea(rider.workArea);
    location.applyRider(rider);
    items.clearSerials();
    setError("");
  }

  function changeNationalId(value: string) {
    setNationalId(value.replace(/\D/g, "").slice(0, 14));
    lookup.reset();
    location.unlock();
  }

  async function submit() {
    setError("");
    if (hasBlockingLookup) return;
    if (!location.governorate || !location.city || !location.parts) {
      setError("اختر المحافظة والمدينة أولاً.");
      return;
    }
    if (!location.receiptSequence) {
      setError("أدخل رقم تسلسل الإيصال.");
      return;
    }
    if (riderMode === "existing") {
      if (!existingRider) {
        setError("اختر مندوباً مسجلاً.");
        return;
      }
    } else {
      if (!location.sequence) {
        setError("أدخل رقم تسلسل المندوب.");
        return;
      }
      if (!fullName.trim()) {
        setError("اسم المندوب مطلوب.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/riders/custody", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          riderMode,
          riderId: riderMode === "existing" ? existingRiderId : null,
          governorate: location.governorate,
          city: location.city,
          sequence: riderMode === "new" ? location.sequence : null,
          receiptSequence: location.receiptSequence,
          fullName,
          nationalId,
          phone,
          workArea,
          deliveryDate,
          handoverOfficer,
          items: items.normalizedItems.map((item) => ({
            key: item.key,
            label: item.label,
            codePrefix: item.codePrefix,
            quantity: item.quantity,
            condition: item.condition,
            unitPrice: item.unitPrice,
            serial: item.serial,
          })),
          cashCustody: items.cashCustody,
          totalAmount: items.total,
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
    riderMode,
    modeIndex: riderMode === "new" ? 0 : 1,
    existingRider,
    existingRiderId,
    riderOptions,
    governorate: location.governorate,
    city: location.city,
    sequence: location.sequence,
    receiptSequence: location.receiptSequence,
    nextLoading: location.nextLoading,
    cityOptions: location.cityOptions,
    riderCode:
      existingRider?.riderCode ??
      (riderMode === "new" ? location.riderCode : ""),
    custodyNumber: location.custodyNumber,
    fullName,
    nationalId,
    phone,
    workArea,
    deliveryDate,
    handoverOfficer,
    items: items.items,
    cashCustody: items.cashCustody,
    notes,
    lookup: lookup.lookup,
    lookupState: lookup.state,
    locked,
    hasBlockingLookup,
    normalizedItems: items.normalizedItems,
    total: items.total,
    words: items.words,
    itemCount: items.itemCount,
    formError:
      error ||
      location.error ||
      lookup.error ||
      (existingRider && existingRider.status !== "active"
        ? "المندوب غير نشط ولا يمكن إصدار عهدة له."
        : ""),
    submitting,
    setFullName,
    setPhone,
    setWorkArea,
    setDeliveryDate,
    setHandoverOfficer,
    setCashCustody: items.setCashCustody,
    setNotes,
    changeGovernorate,
    changeCity,
    changeRiderSequence: location.changeRiderSequence,
    changeReceiptSequence: location.changeReceiptSequence,
    changeMode,
    selectExistingRider,
    changeNationalId,
    checkRider: () => lookup.check(nationalId),
    updateItem: items.updateItem,
    submit,
  };
}
