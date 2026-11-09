"use client";

import { Button } from "@/components/ui/button";
import { currencyMoney, shortDate } from "@/lib/accounts/format";
import {
  CONTRACT_STATUS_META,
  type Contract,
} from "@/lib/contracts/types";

type ContractTableProps = {
  contracts: Contract[];
  busyId: string | null;
  canEdit: boolean;
  canSign: boolean;
  canCancel: boolean;
  onEdit: (contract: Contract) => void;
  onAction: (contract: Contract, action: "send" | "sign" | "cancel") => void;
};

export function ContractTable({
  contracts,
  busyId,
  canEdit,
  canSign,
  canCancel,
  onEdit,
  onAction,
}: ContractTableProps) {
  if (contracts.length === 0) {
    return (
      <section className="panel">
        <p className="panel-note">
          لا توجد عقود مسجّلة بعد. ابدأ بصياغة عقد جديد.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="table-wrap w-full overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>العقد</th>
              <th>التاجر</th>
              <th>القيمة</th>
              <th>الحالة</th>
              <th>الموقّع</th>
              <th>آخر تحديث</th>
              <th className="align-right">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((contract) => {
              const meta = CONTRACT_STATUS_META[contract.status];
              const busy = busyId === contract.id;
              const open =
                contract.status === "draft" ||
                contract.status === "pending_signature";

              return (
                <tr key={contract.id}>
                  <td>
                    <strong>{contract.reference}</strong>
                  </td>
                  <td>{contract.merchantName || contract.merchantId}</td>
                  <td dir="ltr">
                    {currencyMoney(contract.value, contract.currency)}
                  </td>
                  <td>
                    <span className={`badge ${meta.tone}`}>{meta.label}</span>
                  </td>
                  <td className="muted">{contract.signatory || "—"}</td>
                  <td className="muted">{shortDate(contract.updatedAt)}</td>
                  <td>
                    <div className="row-actions">
                      <Button
                        as="a"
                        href={`/api/contracts/${contract.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        size="sm"
                        variant={
                          contract.status === "pending_signature" ||
                          contract.status === "signed"
                            ? "primary"
                            : "quiet"
                        }
                        disabled={busy}
                      >
                        معاينة العقد
                      </Button>

                      {canEdit && open ? (
                        <Button
                          as="a"
                          href={`/contracts/draft-editor?contract=${contract.id}`}
                          size="sm"
                          variant="quiet"
                          disabled={busy}
                        >
                          تحرير المسودة
                        </Button>
                      ) : null}

                      {canEdit && open ? (
                        <Button
                          size="sm"
                          variant="quiet"
                          disabled={busy}
                          onClick={() => onEdit(contract)}
                        >
                          تعديل
                        </Button>
                      ) : null}

                      {contract.status === "draft" ? (
                        <Button
                          size="sm"
                          variant="quiet"
                          disabled={busy}
                          onClick={() => onAction(contract, "send")}
                        >
                          إرسال للتوقيع
                        </Button>
                      ) : null}

                      {canSign && contract.status === "pending_signature" ? (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => onAction(contract, "sign")}
                        >
                          توقيع
                        </Button>
                      ) : null}

                      {canCancel && open ? (
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busy}
                          onClick={() => onAction(contract, "cancel")}
                        >
                          إلغاء
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
