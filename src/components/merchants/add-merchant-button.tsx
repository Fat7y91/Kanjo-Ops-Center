"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  CreateMerchantModal,
  type MerchantCityOption,
  type MerchantTaxonomyOptions,
} from "@/components/merchants/create-merchant-modal";

type AddMerchantButtonProps = {
  cities: MerchantCityOption[];
  taxonomy: MerchantTaxonomyOptions;
  defaultCityId?: string;
};

export function AddMerchantButton({
  cities,
  taxonomy,
  defaultCityId,
}: AddMerchantButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <>
      <button
        type="button"
        className="button button-primary"
        onClick={() => setOpen(true)}
        disabled={cities.length === 0}
        title={
          cities.length === 0
            ? "لا توجد مدن داخل نطاقك. أضف مدينة أولاً."
            : undefined
        }
      >
        إضافة تاجر
      </button>

      <CreateMerchantModal
        open={open}
        cities={cities}
        taxonomy={taxonomy}
        defaultCityId={defaultCityId}
        onClose={() => setOpen(false)}
        onDone={(message) => {
          setToast(message);
          router.refresh();
        }}
      />

      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </>
  );
}
