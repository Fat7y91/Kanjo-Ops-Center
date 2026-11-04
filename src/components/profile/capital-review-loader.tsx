"use client";

import { useEndpointData } from "@/components/data/use-endpoint-data";
import { CapitalReviewBoard } from "@/components/profile/capital-review-board";
import { ErrorPanel } from "@/components/ui/error-panel";
import { PageHeader } from "@/components/ui/page-header";
import { TableSkeleton } from "@/components/ui/skeletons";
import { capitalReviewPayloadSchema } from "@/lib/profile/reviews-payload";

import type { CapitalReviewPayload } from "@/lib/profile/reviews-payload";

/** Module-level so the hook's dependency list stays stable. */
const parsePayload = (input: unknown): CapitalReviewPayload =>
  capitalReviewPayloadSchema.parse(input);

/**
 * Treasury review island.
 *
 * The page shell authorizes with the treasury capabilities; the queue, approval
 * targets and receipt URLs are fetched here so the Edge render does not resolve
 * them during SSR. The pending count rides in the header once the payload
 * lands — a placeholder number would be worse than none.
 */
export function CapitalReviewLoader({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const { status, data, error, reload } = useEndpointData(
    "/api/admin/finance/reviews",
    parsePayload,
  );

  const pending = data
    ? data.deposits.filter((deposit) => deposit.status === "pending").length +
      data.payouts.filter((payout) => payout.status === "pending").length
    : 0;

  return (
    <>
      <PageHeader
        eyebrow="المالية"
        title="اعتماد رأس المال وبيانات الصرف"
        description="مراجعة الإيداعات الرأسمالية للمؤسسين واعتماد وجهات الصرف. الاعتماد يقيّد الحركة في الخزينة مباشرة."
        actions={
          data ? (
            <span className="badge badge-gold">
              {pending} بند بانتظار القرار
            </span>
          ) : null
        }
      />

      {status === "loading" ? (
        <div aria-busy="true">
          <TableSkeleton rows={6} columns={5} />
        </div>
      ) : null}

      {status === "failed" ? (
        <ErrorPanel
          error={error}
          reset={reload}
          title="تعذر تحميل الاعتمادات"
          description="لم تكتمل قراءة الإيداعات الرأسمالية ووجهات الصرف. أعد المحاولة دون مغادرة الصفحة."
        />
      ) : null}

      {status === "ready" ? (
        <CapitalReviewBoard
          initialDeposits={data.deposits}
          initialPayouts={data.payouts}
          accounts={data.accounts}
          receiptUrls={data.receiptUrls}
          currentUserId={currentUserId}
        />
      ) : null}
    </>
  );
}
