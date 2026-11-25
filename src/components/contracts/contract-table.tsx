"use client";

import { Button } from "@/components/ui/button";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { shortDate } from "@/lib/accounts/format";
import { commissionRateLabel } from "@/lib/field-ops/merchant-balance-format";
import {
  contractGovernanceItems,
  type ContractGovernanceAction,
} from "@/lib/contracts/governance";
import {
  CONTRACT_STATUS_META,
  type Contract,
} from "@/lib/contracts/types";

const percent = new Intl.NumberFormat("ar-EG-u-nu-latn", {
  maximumFractionDigits: 2,
});

type ContractTableProps = {
  contracts: Contract[];
  cityNameById: Map<string, string>;
  busyId: string | null;
  canEdit: boolean;
  canSend: boolean;
  canSign: boolean;
  canCancel: boolean;
  canForceEdit: boolean;
  canManageSigned: boolean;
  canDelete: boolean;
  orderCounts: Record<string, number>;
  onEdit: (contract: Contract) => void;
  onAction: (contract: Contract, action: "send" | "sign" | "cancel") => void;
  onGovernance: (
    contract: Contract,
    action: ContractGovernanceAction,
  ) => void;
};

export function ContractTable({
  contracts,
  cityNameById,
  busyId,
  canEdit,
  canSend,
  canSign,
  canCancel,
  canForceEdit,
  canManageSigned,
  canDelete,
  orderCounts,
  onEdit,
  onAction,
  onGovernance,
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
              <th>المدينة</th>
              <th className="align-right">العمولة</th>
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
              const cityName = contract.cityId
                ? (cityNameById.get(contract.cityId) ?? contract.cityId)
                : "—";
              const governance = contractGovernanceItems({
                status: contract.status,
                orderCount: orderCounts[contract.id] ?? 0,
                caps: {
                  manageSigned: canManageSigned,
                  deleteContracts: canDelete,
                  editFinalized: canForceEdit,
                },
              });

              return (
                <tr key={contract.id}>
                  <td>
                    <strong>{contract.reference}</strong>
                  </td>
                  <td>{contract.merchantName || contract.merchantId}</td>
                  <td className="muted">{cityName}</td>
                  <td className="align-right">
                    {commissionRateLabel(contract.commissionRate, (value) =>
                      percent.format(value),
                    )}
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

                      {(canEdit && open) || canForceEdit ? (
                        <Button
                          as="a"
                          href={`/contracts/draft-editor?contract=${contract.id}`}
                          size="sm"
                          variant="quiet"
                          disabled={busy}
                        >
                          {open ? "تحرير المسودة" : "تعديل بنود العقد"}
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

                      {canSend && contract.status === "draft" ? (
                        <Button
                          size="sm"
                          variant="quiet"
                          disabled={busy}
                          onClick={() => onAction(contract, "send")}
                        >
                          إرسال للتوقيع
                        </Button>
                      ) : null}

                      {canSign && open ? (
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

                      {governance.length > 0 ? (
                        <DropdownMenu
                          label="إدارة العقد"
                          items={governance.map((item) => ({
                            id: item.action,
                            label: item.label,
                            tone: item.tone,
                            disabled: busy || !item.enabled,
                            hint: item.hint,
                            onSelect: () => onGovernance(contract, item.action),
                          }))}
                        />
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
