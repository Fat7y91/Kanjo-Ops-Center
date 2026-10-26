"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import {
  CONTRACT_STATE_META,
  type AssignableMerchant,
} from "@/lib/field-ops/types";
import { smartTextScore } from "@/lib/search/normalize";

type MerchantComboboxProps = {
  value: string;
  onChange: (merchant: AssignableMerchant | null) => void;
  excludeMerchantId?: string;
  disabled?: boolean;
};

type LoadState = "idle" | "loading" | "ready" | "error";

export function MerchantCombobox({
  value,
  onChange,
  excludeMerchantId,
  disabled = false,
}: MerchantComboboxProps) {
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [merchants, setMerchants] = useState<AssignableMerchant[]>([]);
  const [state, setState] = useState<LoadState>("idle");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const selected = useMemo(
    () => merchants.find((merchant) => merchant.id === value) ?? null,
    [merchants, value],
  );

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    fetch("/api/field-ops/merchants", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("load failed");
        const payload = (await response.json()) as {
          merchants?: AssignableMerchant[];
        };
        if (cancelled) return;
        setMerchants(payload.merchants ?? []);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
    const pool = merchants.filter(
      (merchant) => merchant.id !== excludeMerchantId,
    );
    if (!normalized) {
      return pool.sort((left, right) => {
        const leftAssigned = left.team ? 1 : 0;
        const rightAssigned = right.team ? 1 : 0;
        if (leftAssigned !== rightAssigned) return leftAssigned - rightAssigned;
        return left.name.localeCompare(right.name, "ar");
      });
    }

    return pool
      .map((merchant) => ({
        merchant,
        score: Math.max(
          smartTextScore(normalized, merchant.name).score,
          Math.round(
            smartTextScore(normalized, merchant.category).score * 0.6,
          ),
          Math.round(smartTextScore(normalized, merchant.cityName).score * 0.5),
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .map((entry) => entry.merchant);
  }, [merchants, query, excludeMerchantId]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  function choose(merchant: AssignableMerchant) {
    if (merchant.cityStage === "preparation") return;
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
      return;
    }
  }

  const statusMessage =
    state === "loading"
      ? "جارٍ تحميل التجار…"
      : state === "error"
        ? "تعذر تحميل التجار. أعد فتح النافذة للمحاولة."
        : options.length === 0 && query.trim()
          ? "لا يوجد تاجر مطابق. أضف التاجر أولاً من دليل التجار."
          : options.length === 0
            ? "لا يوجد تجار متاحون في نطاق مدنك. أضف تاجراً من دليل التجار."
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
          disabled={disabled || state === "loading"}
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
              {selected.cityName} · {selected.category} · هدف{" "}
              {selected.targetCommission}%
            </span>
          </div>
          <span className={`badge ${CONTRACT_STATE_META[selected.contractState].tone}`}>
            {CONTRACT_STATE_META[selected.contractState].label}
          </span>
          {selected.team ? (
            <span className="chip chip-team">{selected.team}</span>
          ) : (
            <span className="badge badge-green">غير مسند</span>
          )}
        </div>
      ) : null}

      {open && !disabled ? (
        <div className="combo-menu">
          {statusMessage ? (
            <p className="combo-empty">{statusMessage}</p>
          ) : (
            <ul className="combo-list" role="listbox" id={listId}>
              {options.map((merchant, index) => {
                const inPreparation = merchant.cityStage === "preparation";
                return (
                  <li key={merchant.id} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === highlight}
                      className={`combo-option${
                        index === highlight ? " is-active" : ""
                      }${inPreparation ? " is-disabled" : ""}`}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => choose(merchant)}
                      disabled={inPreparation}
                    >
                      <span className="combo-option-main">
                        <strong>{merchant.name}</strong>
                        <span>
                          {merchant.cityName} · {merchant.category}
                        </span>
                      </span>
                      <span className="combo-option-side">
                        {inPreparation ? (
                          <span className="badge badge-blue">مرحلة الإعداد</span>
                        ) : merchant.team ? (
                          <span className="chip chip-team">{merchant.team}</span>
                        ) : (
                          <span className="badge badge-green">متاح</span>
                        )}
                        <span className="badge">
                          {merchant.targetCommission}%
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
