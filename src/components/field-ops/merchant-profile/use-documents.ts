"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { MerchantDocument } from "@/lib/field-ops/types";

type UseDocumentsArgs = {
  merchantId: string;
  onAnnounce: (message: string) => void;
};

export function useDocuments({ merchantId, onAnnounce }: UseDocumentsArgs) {
  const router = useRouter();
  const [docName, setDocName] = useState("");
  const [docType, setDocType] =
    useState<MerchantDocument["type"]>("contract");
  const [docUrl, setDocUrl] = useState("");
  const [docError, setDocError] = useState("");
  const [docSaving, setDocSaving] = useState(false);

  async function addDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDocError("");
    setDocSaving(true);
    try {
      const response = await fetch(
        `/api/field-ops/merchants/${merchantId}/documents`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: docName,
            type: docType,
            url: docUrl,
          }),
        },
      );
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "تعذر حفظ المستند.");
      }
      setDocName("");
      setDocUrl("");
      onAnnounce("تم إرفاق المستند بملف التاجر.");
      router.refresh();
    } catch (error) {
      setDocError(
        error instanceof Error ? error.message : "تعذر حفظ المستند.",
      );
    } finally {
      setDocSaving(false);
    }
  }

  return {
    docName,
    setDocName,
    docType,
    setDocType,
    docUrl,
    setDocUrl,
    docError,
    docSaving,
    addDocument,
  };
}
