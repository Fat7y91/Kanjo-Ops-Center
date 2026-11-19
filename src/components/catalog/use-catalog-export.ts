"use client";

import { useCallback, useState } from "react";

import { PRODUCT_STATE_META, type CatalogProduct } from "@/lib/catalog/types";
import { resolveDisplayImageUrl } from "@/lib/catalog/format";
import type { TaxonomyCategory } from "@/lib/taxonomy/types";

type ExportInput = {
  products: CatalogProduct[];
  categories: TaxonomyCategory[];
  merchantName: string;
};

function imageLink(value: string | null): string {
  const direct = resolveDisplayImageUrl(value);
  if (!direct || direct.startsWith("data:")) return "";
  if (direct.startsWith("/")) return `${window.location.origin}${direct}`;
  return /^https?:\/\//i.test(direct) ? direct : "";
}

function fileName(merchantName: string): string {
  const safe = merchantName.replace(/[\\/:*?"<>|]+/g, "-").trim() || "catalog";
  return `catalog_${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`;
}

/** Client-only export of the merchant catalog, barcode-safe for Excel. */
export function useCatalogExport() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const exportCatalog = useCallback(async (input: ExportInput) => {
    if (input.products.length === 0) return;
    setBusy(true);
    setError("");

    try {
      const XLSX = await import("xlsx");
      const names = new Map(
        input.categories.map((category) => [category.key, category.name_ar]),
      );
      const rows = input.products.map((product) => ({
        "اسم الصنف": product.name,
        "الباركود / SKU": product.barcode || product.sku || "",
        السعر: Math.round(product.price * 100) / 100,
        القسم: product.categoryKey
          ? names.get(product.categoryKey) ?? product.categoryKey
          : "",
        "رابط الصورة": imageLink(product.imageDataUrl),
        الحالة: PRODUCT_STATE_META[product.state].label,
      }));

      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet["!cols"] = [
        { wch: 42 },
        { wch: 22 },
        { wch: 12 },
        { wch: 24 },
        { wch: 48 },
        { wch: 16 },
      ];

      // Force the barcode/SKU column to text so Excel cannot switch to
      // scientific notation or strip leading zeros.
      const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1");
      for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
        const address = XLSX.utils.encode_cell({ r: row, c: 1 });
        const cell = sheet[address] as import("xlsx").CellObject | undefined;
        if (cell) {
          cell.t = "s";
          cell.z = "@";
          cell.v = String(cell.v ?? "");
        }
      }

      const workbook = XLSX.utils.book_new();
      workbook.Workbook = { Views: [{ RTL: true }] };
      XLSX.utils.book_append_sheet(workbook, sheet, "الكتالوج");
      XLSX.writeFile(workbook, fileName(input.merchantName), {
        bookType: "xlsx",
      });
    } catch {
      setError("تعذر تصدير ملف Excel. أعد المحاولة.");
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, exportCatalog };
}
