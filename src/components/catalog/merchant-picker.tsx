"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { CONTRACT_STATE_META } from "@/lib/field-ops/types";
import { smartTextScore } from "@/lib/search/normalize";

export type CatalogMerchantOption = {
  id: string;
  name: string;
  vendorTypeId: number;
  vendorType: string;
  contractState: string;
  cityName: string;
};

type MerchantPickerProps = {
  merchants: CatalogMerchantOption[];
  value: string;
  onChange: (merchant: CatalogMerchantOption | null) => void;
  disabled?: boolean;
};

/**
 * Fuzzy merchant picker for catalog entry.
 *
 * The server only sends merchants whose contract is final or signed, so this
 * component never has to re-implement eligibility. Search scores name, vendor
 * type and city with the shared Arabic-normalising matcher.
 */
export function MerchantPicker({
  merchants,
  value,
  onChange,
  disabled = false,
}: MerchantPickerProps) {
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const selected = useMemo(
    () => merchants.find((merchant) => merchant.id === value) ?? null,
    [merchants, value],
  );

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const options = useMemo(() => {
    const normalized = query.trim();
    if (!normalized) {
      return [...merchants].sort((left, right) =>
        left.name.localeCompare(right.name, "ar"),
      );
    }

    return merchants
      .map((merchant) => ({
        merchant,
        score: Math.max(
          smartTextScore(normalized, merchant.name).score,
          Math.round(
            smartTextScore(normalized, merchant.vendorType).score * 0.6,
          ),
          Math.round(smartTextScore(normalized, merchant.cityName).score * 0.5),
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.merchant);
  }, [merchants, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  function choose(merchant: CatalogMerchantOption) {
    onChange(merchant);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setHighlight((current) =>
        options.length === 0 ? 0 : (current + 1) % options.length,
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setHighlight((current) =>
        options.length === 0
          ? 0
          : (current - 1 + options.length) % options.length,
      );
      return;
    }
    if (event.key === "Enter" && open && options[highlight]) {
      event.preventDefault();
      choose(options[highlight]);
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }

  const emptyMessage =
    merchants.length === 0
      ? "لا يوجد تجار بعقد نهائي أو موقّع في نطاقك."
      : query.trim()
        ? "لا يوجد تاجر مطابق لبحثك."
        : "";

  return (
    <div className="combo" ref={wrapperRef}>
      <div
        className={`combo-control${open ? " is-open" : ""}${
          disabled ? " is-disabled" : ""
        }`}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="التاجر"
          autoComplete="off"
          className="combo-input"
          value={query}
          placeholder={
            selected ? selected.name : "ابحث باسم التاجر أو التصنيف أو المدينة…"
          }
          disabled={disabled || merchants.length === 0}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        {selected ? (
          <button
            type="button"
            tabIndex={-1}
            className="combo-clear"
            onClick={() => {
              onChange(null);
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="إلغاء اختيار التاجر"
          >
            ×
          </button>
        ) : null}
      </div>

      {selected ? (
        <div className="combo-selected">
          <div>
            <strong>{selected.name}</strong>
            <span className="combo-selected-meta">
              {selected.cityName} · {selected.vendorType}
            </span>
          </div>
          <span
            className={`badge ${
              CONTRACT_STATE_META[
                selected.contractState as keyof typeof CONTRACT_STATE_META
              ]?.tone ?? "badge"
            }`}
          >
            {CONTRACT_STATE_META[
              selected.contractState as keyof typeof CONTRACT_STATE_META
            ]?.label ?? selected.contractState}
          </span>
        </div>
      ) : null}

      {open && !disabled && merchants.length > 0 ? (
        <div className="combo-menu">
          {options.length === 0 ? (
            <p className="combo-empty">{emptyMessage}</p>
          ) : (
            <ul className="combo-list" role="listbox" id={listId}>
              {options.map((merchant, index) => (
                <li key={merchant.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === highlight}
                    className={`combo-option${
                      index === highlight ? " is-active" : ""
                    }`}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => choose(merchant)}
                  >
                    <span className="combo-option-main">
                      <strong>{merchant.name}</strong>
                      <span>
                        {merchant.cityName} · {merchant.vendorType}
                      </span>
                    </span>
                    <span className="combo-option-side">
                      <span
                        className={`badge ${
                          CONTRACT_STATE_META[
                            merchant.contractState as keyof typeof CONTRACT_STATE_META
                          ]?.tone ?? "badge"
                        }`}
                      >
                        {CONTRACT_STATE_META[
                          merchant.contractState as keyof typeof CONTRACT_STATE_META
                        ]?.label ?? merchant.contractState}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
