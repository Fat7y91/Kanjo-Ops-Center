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
    label: "بدون تعاقد",
    labelAr: "بدون تعاقد",
    tone: "badge-red",
    description: "مفتوح للزيارات القادمة وتغيير النتيجة بحرية.",
    repEditable: true,
  },
  provisional: {
    label: "اتفاق مبدئي",
    labelAr: "اتفاق مبدئي",
    tone: "badge-gold",
    description: "مفتوح للزيارات القادمة وتغيير النتيجة بحرية.",
    repEditable: true,
  },
  final_contract: {
    label: "اتفاق نهائي",
    labelAr: "اتفاق نهائي",
    tone: "badge-green",
    description: "مقفل للمندوبين. أي تغيير يتطلب طلب تعديل معتمد.",
    repEditable: false,
  },
  signed_contract: {
    label: "توقيع العقد",
    labelAr: "توقيع العقد",
    tone: "badge-signed",
    description:
      "مقفل تماماً. يتم احتساب العمولة. فقط عمليات المدن يمكنها تغييره.",
    repEditable: false,
  },
};

export const CITY_STAGES = [
  "contracting",
  "data_entry",
  "live_operations",
] as const;

export type CityStage = (typeof CITY_STAGES)[number];

export const CITY_STAGE_META: Record<
  CityStage,
  { label: string; tone: string; description: string }
> = {
  contracting: {
    label: "مرحلة التعاقدات",
    tone: "badge-gold",
    description: "توقيع الاتفاقيات وتأمين التغطية التجارية قبل الإطلاق.",
  },
  data_entry: {
    label: "مرحلة إدخال البيانات",
    tone: "badge-purple",
    description: "تسجيل التجار والمنتجات وبناء بيانات التشغيل.",
  },
  live_operations: {
    label: "مرحلة التشغيل",
    tone: "badge-green",
    description: "المدينة تعمل بالكامل مع زيارات ميدانية وجدولة يومية.",
  },
};

export const FIELD_TEAMS = ["Fox Team", "Power Team"] as const;
export type FieldTeam = (typeof FIELD_TEAMS)[number];

export const TEAM_LABELS: Record<string, string> = {
  "Fox Team": "فريق فوكس",
  "Power Team": "فريق باور",
  "City Operations": "عمليات المدن",
  Executive: "الإدارة التنفيذية",
  Catalog: "فريق الكتالوج",
  Audit: "فريق المراجعة",
};

export function teamLabel(team: string): string {
  return TEAM_LABELS[team] ?? team;
}

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

/**
 * Firestore-safe GeoJSON polygon. Coordinates are stored as [lng, lat] and the
 * first vertex is repeated at the end to produce a closed linear ring.
 */
export type GeoPolygon = {
  type: "Polygon";
  coordinates: Array<Array<[number, number]>>;
};

export type City = {
  id: string;
  name: string;
  country: string;
  population: number;
  stage: CityStage;
  competitors: Competitor[];
  strategicNotes: string;
  zone: ZonePoint[];
  boundary: GeoPolygon;
  createdAt: string;
  createdBy: string;
  createdByName: string;
};

export function zoneToBoundary(zone: ZonePoint[]): GeoPolygon {
  const ring = zone.map(
    (point) => [point.lng, point.lat] as [number, number],
  );
  if (ring.length > 0) {
    ring.push([ring[0][0], ring[0][1]]);
  }
  return { type: "Polygon", coordinates: [ring] };
}

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
