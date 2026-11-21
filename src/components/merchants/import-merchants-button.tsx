"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { MerchantImportModal } from "@/components/merchants/merchant-import-modal";
import { Button } from "@/components/ui/button";

type ImportMerchantsButtonProps = {
  cities: { id: string; name: string }[];
  vendorTypes: { id: number; name_ar: string; name_en?: string }[];
  defaultCityId?: string;
};

export function ImportMerchantsButton({
  cities,
  vendorTypes,
  defaultCityId,
}: ImportMerchantsButtonProps) {
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
      <Button
        variant="quiet"
        onClick={() => setOpen(true)}
        disabled={cities.length === 0}
      >
        استيراد التجار
      </Button>

      <MerchantImportModal
        open={open}
        cities={cities}
        vendorTypes={vendorTypes}
        defaultCityId={defaultCityId}
        onClose={() => setOpen(false)}
        onImported={(message) => {
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
