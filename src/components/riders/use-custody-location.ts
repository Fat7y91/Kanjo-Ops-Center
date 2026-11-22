"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildCustodyNumber,
  buildRiderCode,
  type LocationCodeParts,
} from "@/lib/riders/codes";
import type {
  AssetSequences,
  LocationCatalog,
  NextSequences,
  Rider,
} from "@/lib/riders/types";

type UseCustodyLocationArgs = {
  locations: LocationCatalog;
  initialRider: Rider | null;
};

type InitialState = {
  governorate: string | null;
  city: string | null;
  sequence: number | null;
};

function riderLocation(
  locations: LocationCatalog,
  rider: Pick<Rider, "governorateCode" | "cityCode">,
): { governorate: string | null; city: string | null } {
  const governorate =
    locations.governorates.find(
      (item) => item.alphaCode === rider.governorateCode,
    )?.name ?? null;
  const city =
    locations.cities.find(
      (item) =>
        item.alphaCode === rider.cityCode &&
        (!governorate || item.governorateName === governorate),
    )?.name ?? null;
  return { governorate, city };
}

function initialState(
  locations: LocationCatalog,
  initialRider: Rider | null,
): InitialState {
  if (initialRider) {
    const { governorate, city } = riderLocation(locations, initialRider);
    if (governorate && city) {
      return {
        governorate,
        city,
        sequence:
          initialRider.sequenceNumber > 0 ? initialRider.sequenceNumber : null,
      };
    }
  }
  const defaultGovernorate =
    locations.governorates.length === 1
      ? locations.governorates[0].name
      : null;
  const cities = defaultGovernorate
    ? locations.cities.filter(
        (item) => item.governorateName === defaultGovernorate,
      )
    : [];
  return {
    governorate: defaultGovernorate,
    city: cities.length === 1 ? cities[0].name : null,
    sequence: null,
  };
}

export function useCustodyLocation({
  locations,
  initialRider,
}: UseCustodyLocationArgs) {
  const initial = useMemo(
    () => initialState(locations, initialRider),
    [locations, initialRider],
  );
  const [governorate, setGovernorate] = useState<string | null>(
    initial.governorate,
  );
  const [city, setCity] = useState<string | null>(initial.city);
  const [sequence, setSequence] = useState<number | null>(initial.sequence);
  const [receiptSequence, setReceiptSequence] = useState<number | null>(null);
  const [assetSequences, setAssetSequences] =
    useState<AssetSequences | null>(null);
  const [sequenceLocked, setSequenceLocked] = useState(
    initialRider !== null && Boolean(initialRider.riderCode),
  );
  const [nextLoading, setNextLoading] = useState(false);
  const [error, setError] = useState("");
  const riderTouched = useRef(false);
  const receiptTouched = useRef(false);

  useEffect(() => {
    if (!governorate || city) return;
    const options = locations.cities.filter(
      (item) => item.governorateName === governorate,
    );
    if (options.length === 1) setCity(options[0].name);
  }, [governorate, city, locations]);

  useEffect(() => {
    if (!governorate || !city) return;
    const controller = new AbortController();
    setNextLoading(true);
    const query = new URLSearchParams({ governorate, city });
    fetch(`/api/riders/next-sequence?${query.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((body: { next?: NextSequences }) => {
        const next = body.next;
        if (!next) return;
        if (!sequenceLocked && !riderTouched.current) {
          setSequence(next.nextRiderSequence);
        }
        if (!receiptTouched.current) {
          setReceiptSequence(next.nextReceiptSequence);
        }
        setAssetSequences(next.nextAssetSequences);
        setError("");
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        setError("تعذر حساب أرقام التسلسل التالية.");
      })
      .finally(() => setNextLoading(false));
    return () => controller.abort();
  }, [governorate, city, sequenceLocked]);

  const selectedGovernorate = locations.governorates.find(
    (item) => item.name === governorate,
  );
  const selectedCity = locations.cities.find(
    (item) => item.name === city && item.governorateName === governorate,
  );
  const cityOptions = locations.cities.filter(
    (item) => item.governorateName === governorate,
  );
  const parts: LocationCodeParts | null = useMemo(
    () =>
      selectedGovernorate && selectedCity
        ? {
            govAlpha: selectedGovernorate.alphaCode,
            cityAlpha: selectedCity.alphaCode,
            govNum: selectedGovernorate.numericCode,
            cityNum: selectedCity.numericCode,
          }
        : null,
    [selectedGovernorate, selectedCity],
  );

  function resetSequences() {
    setSequence(null);
    setReceiptSequence(null);
    setAssetSequences(null);
    riderTouched.current = false;
    receiptTouched.current = false;
  }

  function changeGovernorate(value: string) {
    setGovernorate(value);
    setCity(null);
    setSequenceLocked(false);
    resetSequences();
    setError("");
  }

  function changeCity(value: string) {
    setCity(value);
    setSequenceLocked(false);
    resetSequences();
    setError("");
  }

  function changeRiderSequence(value: number | null) {
    riderTouched.current = true;
    setSequence(value);
  }

  function changeReceiptSequence(value: number | null) {
    receiptTouched.current = true;
    setReceiptSequence(value);
  }

  function applyRider(
    rider: Pick<Rider, "governorateCode" | "cityCode" | "sequenceNumber">,
  ) {
    applyRiderLocation(rider);
    if (rider.sequenceNumber > 0) setRiderSequence(rider.sequenceNumber);
  }

  function applyRiderLocation(
    rider: Pick<Rider, "governorateCode" | "cityCode">,
  ) {
    const location = riderLocation(locations, rider);
    if (location.governorate) setGovernorate(location.governorate);
    if (location.city) setCity(location.city);
    setSequenceLocked(false);
    riderTouched.current = false;
    receiptTouched.current = false;
    setError("");
  }

  function setRiderSequence(value: number) {
    riderTouched.current = true;
    setSequence(value);
    setSequenceLocked(true);
  }

  function unlock() {
    riderTouched.current = false;
    setSequenceLocked(false);
  }

  return {
    governorate,
    city,
    sequence,
    receiptSequence,
    assetSequences,
    nextLoading,
    cityOptions,
    parts,
    riderCode: parts && sequence ? buildRiderCode(parts, sequence) : "",
    custodyNumber:
      parts && receiptSequence
        ? buildCustodyNumber(parts, receiptSequence)
        : "",
    error,
    changeGovernorate,
    changeCity,
    changeRiderSequence,
    changeReceiptSequence,
    applyRider,
    applyRiderLocation,
    setRiderSequence,
    unlock,
  };
}
