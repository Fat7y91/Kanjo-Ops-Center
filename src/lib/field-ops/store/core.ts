import type {
  City,
  EditRequest,
  FieldTask,
  FollowUpTask,
  Merchant,
  StateOverride,
  TransferRequest,
  VisitReport,
  ZonePoint,
} from "@/lib/field-ops/types";

import { seedStore } from "./seed";

export class FieldOpsError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "FieldOpsError";
    this.code = code;
    this.status = status;
  }
}

export type FieldOpsStore = {
  cities: City[];
  merchants: Merchant[];
  tasks: FieldTask[];
  reports: VisitReport[];
  followUps: FollowUpTask[];
  transferRequests: TransferRequest[];
  editRequests: EditRequest[];
  overrides: StateOverride[];
  revision: number;
};

export type Actor = {
  id: string;
  name: string;
  team: string;
};

const globalStore = globalThis as typeof globalThis & {
  __kanjoV2FieldOpsStore?: FieldOpsStore;
};

export function todayIso(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function isoNow(offsetMinutes = 0): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
}

export function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function zone(points: Array<[number, number]>): ZonePoint[] {
  return points.map(([lat, lng]) => ({ lat, lng }));
}

export function getStore(): FieldOpsStore {
  if (!globalStore.__kanjoV2FieldOpsStore) {
    globalStore.__kanjoV2FieldOpsStore = seedStore();
  }
  return globalStore.__kanjoV2FieldOpsStore;
}

export function bump(): void {
  getStore().revision += 1;
}

export function getFieldOpsRevision(): number {
  return getStore().revision;
}
