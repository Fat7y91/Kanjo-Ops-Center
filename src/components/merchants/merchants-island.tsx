"use client";

import type { ComponentProps } from "react";

import { useEndpointData } from "@/components/data/use-endpoint-data";
import { AddMerchantButton } from "@/components/merchants/add-merchant-button";
import { MerchantsDirectory } from "@/components/merchants/merchants-directory";
import { ErrorPanel } from "@/components/ui/error-panel";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeletons";
import {
  merchantRowsPayloadSchema,
  type MerchantRowsPayload,
} from "@/lib/field-ops/payload";

/** Module-level so the hook's dependency list stays stable. */
const parseRows = (input: unknown): MerchantRowsPayload =>
  merchantRowsPayloadSchema.parse(input);

type AddMerchantProps = ComponentProps<typeof AddMerchantButton>;

type MerchantsIslandProps = {
  /**
   * The query is part of the URL, so it is resolved by the page and handed
   * down: the directory keeps its search state without re-reading location.
   */
  initialQuery: string;
  /**
   * The creation affordance needs the city list and taxonomy, which the server
   * already holds and which never change while the screen is open. Only the
   * table waits for the endpoint.
   */
  canCreate: boolean;
  cities: AddMerchantProps["cities"];
  taxonomy: AddMerchantProps["taxonomy"];
  defaultCityId: AddMerchantProps["defaultCityId"];
};

/**
 * Merchant directory island.
 *
 * Rows arrive from `/api/merchants`; the add button and the search field are
 * mounted immediately, so the screen is usable before the directory resolves.
 * The count in the header comes from the payload — a placeholder number would be
 * worse than none.
 */
export function MerchantsIsland({
  initialQuery,
  canCreate,
  cities,
  taxonomy,
  defaultCityId,
}: MerchantsIslandProps) {
  const { status, data, error, reload } = useEndpointData(
    "/api/merchants",
    parseRows,
  );

  return (
    <>
      <PageHeader
        eyebrow="عمليات التجار"
        title="دليل التجار"
        description="الملكية وحالة دورة الحياة والبيانات التجارية لكل تاجر على الشبكة. افتح الملف لإدارة المستندات والنتائج وعمليات النقل."
        actions={
          <div className="row-actions">
            {data ? <span className="badge">{data.rows.length} تاجر</span> : null}
            {canCreate ? (
              <AddMerchantButton
                cities={cities}
                taxonomy={taxonomy}
                defaultCityId={defaultCityId}
              />
            ) : null}
          </div>
        }
      />

      {status === "loading" ? (
        <div aria-busy="true">
          <TableSkeleton rows={8} columns={6} />
        </div>
      ) : null}

      {status === "failed" ? (
        <ErrorPanel
          error={error}
          reset={reload}
          title="تعذر تحميل دليل التجار"
          description="لم تكتمل قراءة بيانات التجار. أعد المحاولة دون مغادرة الصفحة."
        />
      ) : null}

      {status === "ready" ? (
        <MerchantsDirectory rows={data.rows} initialQuery={initialQuery} />
      ) : null}
    </>
  );
}
