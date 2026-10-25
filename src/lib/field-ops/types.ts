export const CONTRACT_STATES = [
  "no_agreement",
  "provisional",
  "final_contract",
  "signed_contract",
] as const;

export type ContractState = (typeof CONTRACT_STATES)[number];

export const CONTRACT_STATE_META: Record<
  ContractState,
  {
    label: string;
    labelAr: string;
    tone: string;
    description: string;
    repEditable: boolean;
  }
> = {
  no_agreement: {
    label: "No agreement",
    labelAr: "بدون تعاقد",
    tone: "badge-red",
    description: "Open for future visits and free outcome changes.",
    repEditable: true,
  },
  provisional: {
    label: "Provisional agreement",
    labelAr: "اتفاق مبدئي",
    tone: "badge-gold",
    description: "Open for future visits and free outcome changes.",
    repEditable: true,
  },
  final_contract: {
    label: "Final contract",
    labelAr: "اتفاق نهائي",
    tone: "badge-green",
    description:
      "Locked for representatives. Changes require an approved edit request.",
    repEditable: false,
  },
  signed_contract: {
    label: "Signed contract",
    labelAr: "توقيع العقد",
    tone: "badge-signed",
    description:
      "Strictly locked. Commission is calculated. Only city operations can change it.",
    repEditable: false,
  },
};

export const CITY_STATUSES = ["planning", "launching", "active"] as const;
export type CityStatus = (typeof CITY_STATUSES)[number];

export const CITY_STATUS_META: Record<
  CityStatus,
  { label: string; tone: string }
> = {
  planning: { label: "Planning", tone: "badge-gold" },
  launching: { label: "Launching", tone: "badge-purple" },
  active: { label: "Active", tone: "badge-green" },
};

export const FIELD_TEAMS = ["Fox Team", "Power Team"] as const;
export type FieldTeam = (typeof FIELD_TEAMS)[number];

export type MarketStrength = "low" | "medium" | "high";

export type Competitor = {
  name: string;
  page: string;
  marketStrength: MarketStrength;
};

export type ZonePoint = {
  lat: number;
  lng: number;
};

export type City = {
  id: string;
  name: string;
  country: string;
  population: number;
  status: CityStatus;
  competitors: Competitor[];
  strategicNotes: string;
  zone: ZonePoint[];
  createdAt: string;
  createdBy: string;
  createdByName: string;
};

export type MerchantDocument = {
  id: string;
  name: string;
  type: "contract" | "tax" | "license" | "other";
  url: string;
  uploadedAt: string;
  uploadedBy: string;
};

export type Merchant = {
  id: string;
  name: string;
  normalizedName: string;
  team: string;
  cityId: string;
  targetCommission: number;
  monthlyValue: number;
  strategicNotes: string;
  contractState: ContractState;
  commissionAmount: number;
  editUnlocked: boolean;
  documents: MerchantDocument[];
  createdAt: string;
  updatedAt: string;
  lastVisitAt: string | null;
};

export type TaskStatus = "scheduled" | "completed";

export type FieldTask = {
  id: string;
  merchantId: string;
  merchantName: string;
  team: string;
  cityId: string;
  visitDate: string;
  targetCommission: number;
  strategicNotes: string;
  status: TaskStatus;
  createdBy: string;
  createdByName: string;
  createdAt: string;
};

export type VisitReport = {
  id: string;
  merchantId: string;
  merchantName: string;
  taskId: string | null;
  repId: string;
  repName: string;
  team: string;
  outcome: ContractState;
  previousState: ContractState;
  notes: string;
  commissionAmount: number;
  createdAt: string;
};

export type TransferRequestStatus = "pending" | "approved" | "rejected";

export type TransferRequest = {
  id: string;
  merchantId: string;
  merchantName: string;
  fromTeam: string;
  toTeam: string;
  requestedBy: string;
  requestedByName: string;
  justification: string;
  status: TransferRequestStatus;
  createdAt: string;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string;
};

export type EditRequest = {
  id: string;
  merchantId: string;
  merchantName: string;
  requestedBy: string;
  requestedByName: string;
  reason: string;
  status: TransferRequestStatus;
  createdAt: string;
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string;
};

export type StateOverride = {
  id: string;
  merchantId: string;
  merchantName: string;
  fromState: ContractState;
  toState: ContractState;
  actorId: string;
  actorName: string;
  note: string;
  createdAt: string;
};

export type MerchantSearchResult = {
  merchant: Merchant;
  cityName: string;
  isOwnTeam: boolean;
  score: number;
  matchType: string;
};
