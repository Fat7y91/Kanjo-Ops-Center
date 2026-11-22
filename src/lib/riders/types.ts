export const RIDER_STATUSES = ["active", "suspended", "offboarded"] as const;
export type RiderStatus = (typeof RIDER_STATUSES)[number];

export const RIDER_STATUS_LABEL: Record<RiderStatus, string> = {
  active: "نشط",
  suspended: "موقوف",
  offboarded: "منتهي",
};

export const CUSTODY_ITEM_KEYS = ["HB", "HP", "TSH", "CAP", "OTHER"] as const;
export type CustodyItemKey = (typeof CUSTODY_ITEM_KEYS)[number];

export const CUSTODY_ITEM_LABEL: Record<CustodyItemKey, string> = {
  HB: "صندوق توصيل حراري",
  HP: "شنطة توصيل حرارية",
  TSH: "تيشيرت أو زي العمل",
  CAP: "كاب كانجو",
  OTHER: "أخرى",
};

export const CUSTODY_ITEM_SHORT_LABEL: Record<CustodyItemKey, string> = {
  HB: "صندوق حراري",
  HP: "شنطة حرارية",
  TSH: "تيشيرت",
  CAP: "كاب",
  OTHER: "أخرى",
};

export const ASSET_ITEM_KEYS = ["HB", "HP", "TSH", "CAP"] as const;
export type AssetItemKey = (typeof ASSET_ITEM_KEYS)[number];
export type AssetSequences = Record<AssetItemKey, number>;

export type CustodyItemDraft = {
  key: CustodyItemKey;
  label: string;
  codePrefix: string | null;
  quantity: number;
  condition: string;
  unitPrice: number;
  serial: string | null;
};

export type CustodyItem = CustodyItemDraft & {
  lineTotal: number;
};

export type RiderReceiptSummary = {
  id: string;
  custodyNumber: string;
  deliveryDate: string;
  totalAmount: number;
  status: "active" | "returned" | "replaced";
};

export type Rider = {
  id: string;
  riderCode: string;
  governorateCode: string;
  cityCode: string;
  sequenceNumber: number;
  fullName: string;
  nationalId: string;
  phone: string;
  workArea: string;
  status: RiderStatus;
  createdAt: string;
  activeCustody: RiderReceiptSummary | null;
  latestCustody: RiderReceiptSummary | null;
};

export type RiderDetail = {
  rider: Rider;
  receipts: RiderReceiptSummary[];
};

export type RiderCustodyReceipt = {
  id: string;
  riderId: string;
  custodyNumber: string;
  deliveryDate: string;
  handoverOfficer: string;
  items: CustodyItem[];
  cashCustody: number;
  totalAmount: number;
  totalAmountWords: string;
  status: "active" | "returned" | "replaced";
  notes: string;
  createdAt: string;
  rider: {
    id: string;
    riderCode: string;
    fullName: string;
    nationalId: string;
    phone: string;
    workArea: string;
    governorateCode: string;
    cityCode: string;
    sequenceNumber: number;
    status: RiderStatus;
  };
};

export type LocationGovernorate = {
  name: string;
  alphaCode: string;
  numericCode: string;
};

export type LocationCity = {
  governorateName: string;
  name: string;
  alphaCode: string;
  numericCode: string;
  startingSequence: number;
};

export type LocationCatalog = {
  governorates: LocationGovernorate[];
  cities: LocationCity[];
};

export type NextSequences = {
  governorate: string;
  city: string;
  governorateAlpha: string;
  governorateNum: string;
  cityAlpha: string;
  cityNum: string;
  startingSequence: number;
  maxRiderSequence: number;
  nextRiderSequence: number;
  maxReceiptSequence: number;
  nextReceiptSequence: number;
  nextAssetSequences: AssetSequences;
};

export type RiderLookup = {
  id: string;
  riderCode: string;
  governorateCode: string;
  cityCode: string;
  sequenceNumber: number;
  fullName: string;
  phone: string;
  workArea: string;
  status: RiderStatus;
  hasCustody: boolean;
  custodyId: string | null;
};

export type CustodyIssueResult = {
  riderId: string;
  receiptId: string;
  riderCode: string;
  custodyNumber: string;
};
