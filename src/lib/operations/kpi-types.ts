/**
 * Per-employee operations report types.
 *
 * The report is an aggregation of `app.operation_logs` grouped by `logged_by`:
 * it answers "how many operations did each operator log, and what did they
 * bill", which is the input the payroll/KPI desk needs. Kept apart from the
 * logger types so both files stay small and each has a single concern.
 */

export type EmployeeOperationRow = {
  userId: string;
  name: string;
  title: string;
  operationCount: number;
  orderValueTotal: number;
  commissionTotal: number;
  courierCutTotal: number;
  lastLoggedAt: string | null;
};

export type OperationsKpiReport = {
  month: string;
  rows: EmployeeOperationRow[];
  totals: {
    operationCount: number;
    orderValueTotal: number;
    commissionTotal: number;
    courierCutTotal: number;
  };
};

export type OperationFact = {
  loggedBy: string | null;
  userId: string;
  name: string;
  title: string;
  orderValue: number;
  commission: number;
  courierCut: number;
  occurredAt: string;
};
