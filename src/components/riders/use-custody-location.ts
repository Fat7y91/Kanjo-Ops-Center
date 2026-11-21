"use client";

import { useEffect, useMemo, useState } from "react";

import {
  buildCustodyNumber,
  buildRiderCode,
  type LocationCodeParts,
} from "@/lib/riders/codes";
import type { LocationCatalog, Rider, RiderLookup } from "@/lib/riders/types";

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
    return { governorate, city, sequence: initialRider.sequenceNumber };
  }
  const governorate =
    locations.governorates.length === 1
      ? locations.governorates[0].name
      : null;
  const cities = governorate
    ? locations.cities.filter((item) => item.governorateName === governorate)
    : [];
  return {
    governorate,
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
  const [sequenceLocked, setSequenceLocked] = useState(initialRider !== null);
  const [nextLoading, setNextLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!governorate || city) return;
    const options = locations.cities.filter(
      (item) => item.governorateName === governorate,
    );
    if (options.length === 1) setCity(options[0].name);
  }, [governorate, city, locations]);

  useEffect(() => {
    if (!governorate || !city || sequenceLocked) return;
    const controller = new AbortController();
    setNextLoading(true);
    const query = new URLSearchParams({ governorate, city });
    fetch(`/api/riders/next-sequence?${query.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((body: { next?: { sequence: number } }) => {
        if (body.next) {
          setSequence(body.next.sequence);
          setError("");
        }
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        setError("تعذر حساب رقم التسلسل التالي.");
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
  const parts: LocationCodeParts | null =
    selectedGovernorate && selectedCity
      ? {
          govAlpha: selectedGovernorate.alphaCode,
          cityAlpha: selectedCity.alphaCode,
          govNum: selectedGovernorate.numericCode,
          cityNum: selectedCity.numericCode,
        }
      : null;

  function changeGovernorate(value: string) {
    setGovernorate(value);
    setCity(null);
    setSequence(null);
    setSequenceLocked(false);
    setError("");
  }

  function changeCity(value: string) {
    setCity(value);
    setSequence(null);
    setSequenceLocked(false);
    setError("");
  }

  function applyRider(rider: RiderLookup) {
    const location = riderLocation(locations, rider);
    if (location.governorate) setGovernorate(location.governorate);
    if (location.city) setCity(location.city);
    setSequence(rider.sequenceNumber);
    setSequenceLocked(true);
    setError("");
  }

  function unlock() {
    setSequenceLocked(false);
  }

  return {
    governorate,
    city,
    sequence,
    nextLoading,
    cityOptions,
    parts,
    riderCode: parts && sequence ? buildRiderCode(parts, sequence) : "",
    custodyNumber:
      parts && sequence ? buildCustodyNumber(parts, sequence) : "",
    error,
    changeGovernorate,
    changeCity,
    applyRider,
    unlock,
  };
}
