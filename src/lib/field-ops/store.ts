import { merchantSearchKey } from "@/lib/search/merchant-search";
import {
  normalizeSearchText,
} from "@/lib/search/normalize";
import type {
  City,
  ContractState,
  EditRequest,
  FieldTask,
  Merchant,
  MerchantDocument,
  StateOverride,
  TransferRequest,
  VisitReport,
  ZonePoint,
} from "@/lib/field-ops/types";
import { zoneToBoundary } from "@/lib/field-ops/types";
import type { AppUser } from "@/lib/rbac/types";
import {
  addUserCityScope,
  getUserById,
  listUsers,
  removeUserCityScope,
} from "@/lib/rbac/users";
import type {
  CityCreateInput,
  MerchantCreateInput,
  MerchantDocumentInput,
  TaskAssignInput,
  VisitReportInput,
} from "@/lib/schemas/field-ops";
import { assertVendorTypeExists } from "@/lib/taxonomy/store";

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

type FieldOpsStore = {
  cities: City[];
  merchants: Merchant[];
  tasks: FieldTask[];
  reports: VisitReport[];
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

function todayIso(offsetDays = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function isoNow(offsetMinutes = 0): string {
  return new Date(Date.now() + offsetMinutes * 60_000).toISOString();
}

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function zone(points: Array<[number, number]>): ZonePoint[] {
  return points.map(([lat, lng]) => ({ lat, lng }));
}

function seedStore(): FieldOpsStore {
  const today = todayIso();
  const tomorrow = todayIso(1);
  const yesterday = todayIso(-1);

  const cities: City[] = ([
    {
      id: "city-mansoura",
      name: "المنصورة",
      country: "مصر",
      governorate: "الدقهلية",
      opsManagers: [],
      population: 1_600_000,
      stage: "preparation",
      competitors: [
        {
          name: "El Menus",
          page: "https://www.elmenus.com",
          marketStrength: "medium",
        },
      ],
      strategicNotes:
        "مرحلة الإعداد: حصر التجار المستهدفين في وسط المدينة والكورنيش وتقييم جاهزية السوق قبل بدء التعاقدات.",
      zone: zone([
        [31.092, 31.32],
        [31.104, 31.43],
        [31.012, 31.455],
        [30.998, 31.338],
      ]),
      createdAt: isoNow(-4 * 24 * 60),
      createdBy: "u-ops",
      createdByName: "Mariam Adel",
    },
    {
      id: "city-cairo",
      name: "القاهرة",
      country: "مصر",
      governorate: "القاهرة",
      opsManagers: ["u-ops"],
      population: 10_100_000,
      stage: "live_operations",
      competitors: [
        {
          name: "Talabat",
          page: "https://www.talabat.com/egypt",
          marketStrength: "high",
        },
        {
          name: "Otlob",
          page: "https://www.otlob.com",
          marketStrength: "medium",
        },
      ],
      strategicNotes:
        "الممر المركزي الكثيف. أولوية الزمالك والمعادي ومصر الجديدة لتغطية المأكولات البحرية والصيدليات.",
      zone: zone([
        [30.129, 31.176],
        [30.149, 31.334],
        [30.073, 31.406],
        [29.987, 31.353],
        [29.996, 31.208],
      ]),
      createdAt: isoNow(-60 * 24 * 60),
      createdBy: "u-ops",
      createdByName: "Mariam Adel",
    },
    {
      id: "city-giza",
      name: "الجيزة",
      country: "مصر",
      governorate: "الجيزة",
      opsManagers: [],
      population: 9_200_000,
      stage: "data_entry",
      competitors: [
        {
          name: "Breadfast",
          page: "https://breadfast.com",
          marketStrength: "high",
        },
      ],
      strategicNotes:
        "توسع الضفة الغربية. الصيدليات والبقالة تقود موجة الإدخال قبل التشغيل.",
      zone: zone([
        [30.039, 30.987],
        [30.063, 31.113],
        [29.981, 31.176],
        [29.928, 31.076],
      ]),
      createdAt: isoNow(-42 * 24 * 60),
      createdBy: "u-ops",
      createdByName: "Mariam Adel",
    },
    {
      id: "city-alexandria",
      name: "الإسكندرية",
      country: "مصر",
      governorate: "الإسكندرية",
      opsManagers: [],
      population: 5_500_000,
      stage: "contracting",
      competitors: [
        {
          name: "El Menus",
          page: "https://www.elmenus.com",
          marketStrength: "medium",
        },
      ],
      strategicNotes:
        "جاهزية الممر الصيفي. يجب التحقق من إمدادات المأكولات البحرية قبل فتح العمليات الميدانية.",
      zone: zone([
        [31.292, 29.918],
        [31.31, 30.061],
        [31.176, 30.051],
        [31.16, 29.899],
      ]),
      createdAt: isoNow(-11 * 24 * 60),
      createdBy: "u-ops",
      createdByName: "Mariam Adel",
    },
  ] as Array<Omit<City, "boundary">>).map((city) => ({
    ...city,
    boundary: zoneToBoundary(city.zone),
  }));

  const merchants: Merchant[] = [
    {
      id: "m-kaffyar",
      name: "كافيار",
      normalizedName: merchantSearchKey("كافيار"),
      vendorTypeId: 1,
      vendorType: "مطعم",
      team: "Fox Team",
      cityId: "city-cairo",
      targetCommission: 12,
      monthlyValue: 180_000,
      strategicNotes:
        "VIP seafood account. Famous for caviar platters and private events. Competitor affiliation: Talabat premium collection.",
      contractState: "no_agreement",
      commissionAmount: 0,
      editUnlocked: false,
      documents: [],
      createdAt: isoNow(-20 * 24 * 60),
      updatedAt: isoNow(-2 * 24 * 60),
      lastVisitAt: isoNow(-2 * 24 * 60),
    },
    {
      id: "m-abar-sham",
      name: "عبر الشام",
      normalizedName: merchantSearchKey("عبر الشام"),
      vendorTypeId: 1,
      vendorType: "مطعم",
      team: "Power Team",
      cityId: "city-cairo",
      targetCommission: 10,
      monthlyValue: 220_000,
      strategicNotes:
        "Famous Syrian grills. High dinner throughput and strong delivery loyalty. VIP owner group.",
      contractState: "provisional",
      commissionAmount: 0,
      editUnlocked: false,
      documents: [],
      createdAt: isoNow(-18 * 24 * 60),
      updatedAt: isoNow(-3 * 24 * 60),
      lastVisitAt: isoNow(-3 * 24 * 60),
    },
    {
      id: "m-cairo-fresh",
      name: "Cairo Fresh Market",
      normalizedName: merchantSearchKey("Cairo Fresh Market"),
      vendorTypeId: 4,
      vendorType: "سوبر ماركت",
      team: "Fox Team",
      cityId: "city-cairo",
      targetCommission: 9,
      monthlyValue: 250_000,
      strategicNotes:
        "Grocery anchor. Final contract signed by the commercial desk; awaiting document archive.",
      contractState: "final_contract",
      commissionAmount: 0,
      editUnlocked: false,
      documents: [
        {
          id: "doc-fresh-contract",
          name: "Cairo Fresh - Final Contract.pdf",
          type: "contract",
          url: "",
          uploadedAt: isoNow(-8 * 24 * 60),
          uploadedBy: "u-sales",
        },
        {
          id: "doc-fresh-tax",
          name: "Cairo Fresh - Tax Card.pdf",
          type: "tax",
          url: "",
          uploadedAt: isoNow(-8 * 24 * 60),
          uploadedBy: "u-sales",
        },
      ],
      createdAt: isoNow(-30 * 24 * 60),
      updatedAt: isoNow(-8 * 24 * 60),
      lastVisitAt: isoNow(-8 * 24 * 60),
    },
    {
      id: "m-nile-pharmacy",
      name: "Nile Pharmacy Group",
      normalizedName: merchantSearchKey("Nile Pharmacy Group"),
      vendorTypeId: 3,
      vendorType: "صيدلية",
      team: "Power Team",
      cityId: "city-giza",
      targetCommission: 8,
      monthlyValue: 400_000,
      strategicNotes:
        "Multi-branch pharmacy group. Signed contract and commission accrual active.",
      contractState: "signed_contract",
      commissionAmount: 32_000,
      editUnlocked: false,
      documents: [
        {
          id: "doc-nile-contract",
          name: "Nile Pharmacy - Signed Contract.pdf",
          type: "contract",
          url: "",
          uploadedAt: isoNow(-25 * 24 * 60),
          uploadedBy: "u-sales",
        },
        {
          id: "doc-nile-license",
          name: "Nile Pharmacy - License.pdf",
          type: "license",
          url: "",
          uploadedAt: isoNow(-24 * 24 * 60),
          uploadedBy: "u-sales",
        },
      ],
      createdAt: isoNow(-55 * 24 * 60),
      updatedAt: isoNow(-24 * 24 * 60),
      lastVisitAt: isoNow(-1 * 24 * 60),
    },
    {
      id: "m-zamalek-kitchen",
      name: "Zamalek Kitchen",
      normalizedName: merchantSearchKey("Zamalek Kitchen"),
      vendorTypeId: 1,
      vendorType: "مطعم",
      team: "Fox Team",
      cityId: "city-cairo",
      targetCommission: 11,
      monthlyValue: 140_000,
      strategicNotes:
        "Neighbourhood kitchen with strong lunch demand. Family meal boxes are the hero product.",
      contractState: "no_agreement",
      commissionAmount: 0,
      editUnlocked: false,
      documents: [],
      createdAt: isoNow(-15 * 24 * 60),
      updatedAt: isoNow(-4 * 24 * 60),
      lastVisitAt: isoNow(-4 * 24 * 60),
    },
    {
      id: "m-maadi-home",
      name: "Maadi Home Supplies",
      normalizedName: merchantSearchKey("Maadi Home Supplies"),
      vendorTypeId: 10,
      vendorType: "مكتبات وهدايا",
      team: "Power Team",
      cityId: "city-cairo",
      targetCommission: 7,
      monthlyValue: 95_000,
      strategicNotes:
        "Home essentials and seasonal promotions. Provisional agreement pending final review.",
      contractState: "provisional",
      commissionAmount: 0,
      editUnlocked: false,
      documents: [],
      createdAt: isoNow(-14 * 24 * 60),
      updatedAt: isoNow(-5 * 24 * 60),
      lastVisitAt: isoNow(-5 * 24 * 60),
    },
    {
      id: "m-heliopolis-pets",
      name: "Heliopolis Pet Corner",
      normalizedName: merchantSearchKey("Heliopolis Pet Corner"),
      vendorTypeId: 11,
      vendorType: "ادوية بيطرية",
      team: "Fox Team",
      cityId: "city-cairo",
      targetCommission: 6,
      monthlyValue: 60_000,
      strategicNotes:
        "Pet food and accessories. Recovery visit required after a missed appointment.",
      contractState: "no_agreement",
      commissionAmount: 0,
      editUnlocked: false,
      documents: [],
      createdAt: isoNow(-12 * 24 * 60),
      updatedAt: isoNow(-6 * 24 * 60),
      lastVisitAt: isoNow(-6 * 24 * 60),
    },
    {
      id: "m-seaside-grill",
      name: "Alexandria Seaside Grill",
      normalizedName: merchantSearchKey("Alexandria Seaside Grill"),
      vendorTypeId: 1,
      vendorType: "مطعم",
      team: "Power Team",
      cityId: "city-alexandria",
      targetCommission: 13,
      monthlyValue: 210_000,
      strategicNotes:
        "Summer seafood destination. Provisional agreement signed; final terms under negotiation.",
      contractState: "provisional",
      commissionAmount: 0,
      editUnlocked: false,
      documents: [],
      createdAt: isoNow(-9 * 24 * 60),
      updatedAt: isoNow(-2 * 24 * 60),
      lastVisitAt: isoNow(-2 * 24 * 60),
    },
    {
      id: "m-mansoura-grill",
      name: "Mansoura Nile Grill",
      normalizedName: merchantSearchKey("Mansoura Nile Grill"),
      vendorTypeId: 1,
      vendorType: "مطعم",
      team: null,
      cityId: "city-mansoura",
      targetCommission: 10,
      monthlyValue: 120_000,
      strategicNotes:
        "تاجر مستهدف من مرحلة الإعداد. لم يُسند إلى فريق ولم تُحدد له زيارة بعد.",
      contractState: "no_agreement",
      commissionAmount: 0,
      editUnlocked: false,
      documents: [],
      createdAt: isoNow(-3 * 24 * 60),
      updatedAt: isoNow(-3 * 24 * 60),
      lastVisitAt: null,
    },
  ];

  const tasks: FieldTask[] = [
    {
      id: "task-kaffyar-today",
      merchantId: "m-kaffyar",
      merchantName: "كافيار",
      team: "Fox Team",
      cityId: "city-cairo",
      visitDate: today,
      targetCommission: 12,
      strategicNotes: "Confirm VIP seafood menu and finalise commission ladder.",
      instructions: "Meet the floor manager, taste the VIP seafood set, and secure the signed commission ladder before close of business.",
      status: "scheduled",
      createdBy: "u-ops",
      createdByName: "Mariam Adel",
      createdAt: isoNow(-18 * 60),
    },
    {
      id: "task-fresh-today",
      merchantId: "m-cairo-fresh",
      merchantName: "Cairo Fresh Market",
      team: "Fox Team",
      cityId: "city-cairo",
      visitDate: today,
      targetCommission: 9,
      strategicNotes: "Collect the signed contract pack from the branch manager.",
      instructions: "Bring two contract copies, verify the CR number, and collect the signed pack plus stamp.",
      status: "scheduled",
      createdBy: "u-ops",
      createdByName: "Mariam Adel",
      createdAt: isoNow(-16 * 60),
    },
    {
      id: "task-abar-today",
      merchantId: "m-abar-sham",
      merchantName: "عبر الشام",
      team: "Power Team",
      cityId: "city-cairo",
      visitDate: today,
      targetCommission: 10,
      strategicNotes: "Revisit provisional terms and confirm dinner volumes.",
      instructions: "Confirm the dinner volume cap and photograph the current menu board for the pricing review.",
      status: "scheduled",
      createdBy: "u-ops",
      createdByName: "Mariam Adel",
      createdAt: isoNow(-14 * 60),
    },
    {
      id: "task-nile-today",
      merchantId: "m-nile-pharmacy",
      merchantName: "Nile Pharmacy Group",
      team: "Power Team",
      cityId: "city-giza",
      visitDate: today,
      targetCommission: 8,
      strategicNotes: "Quarterly compliance check and shelf audit.",
      instructions: "Audit the shelf layout, count facings, and log any expired stock before leaving.",
      status: "scheduled",
      createdBy: "u-ops",
      createdByName: "Mariam Adel",
      createdAt: isoNow(-12 * 60),
    },
    {
      id: "task-zamalek-tomorrow",
      merchantId: "m-zamalek-kitchen",
      merchantName: "Zamalek Kitchen",
      team: "Fox Team",
      cityId: "city-cairo",
      visitDate: tomorrow,
      targetCommission: 11,
      strategicNotes: "Introduce the family meal box commission proposal.",
      instructions: "Present the family meal box proposal and agree on a pilot start date with the owner.",
      status: "scheduled",
      createdBy: "u-ops",
      createdByName: "Mariam Adel",
      createdAt: isoNow(-10 * 60),
    },
    {
      id: "task-maadi-tomorrow",
      merchantId: "m-maadi-home",
      merchantName: "Maadi Home Supplies",
      team: "Power Team",
      cityId: "city-cairo",
      visitDate: tomorrow,
      targetCommission: 7,
      strategicNotes: "Move provisional agreement toward final contract.",
      instructions: "Walk the owner through the final contract clauses and book the signing visit.",
      status: "scheduled",
      createdBy: "u-ops",
      createdByName: "Mariam Adel",
      createdAt: isoNow(-8 * 60),
    },
  ];

  const reports: VisitReport[] = [
    {
      id: "report-fresh-final",
      merchantId: "m-cairo-fresh",
      merchantName: "Cairo Fresh Market",
      taskId: null,
      repId: "u-rep-fox",
      repName: "Hassan Mostafa",
      team: "Fox Team",
      outcome: "final_contract",
      previousState: "provisional",
      notes:
        "Final terms accepted by the branch manager. Contract pack moves to documents.",
      commissionAmount: 0,
      createdAt: isoNow(-8 * 24 * 60),
    },
    {
      id: "report-nile-signed",
      merchantId: "m-nile-pharmacy",
      merchantName: "Nile Pharmacy Group",
      taskId: null,
      repId: "u-rep-power",
      repName: "Dina Samir",
      team: "Power Team",
      outcome: "signed_contract",
      previousState: "final_contract",
      notes:
        "Authorized signature applied. Commission calculated at 8% of the monthly value.",
      commissionAmount: 32_000,
      createdAt: isoNow(-25 * 24 * 60),
    },
    {
      id: "report-abar-provisional",
      merchantId: "m-abar-sham",
      merchantName: "عبر الشام",
      taskId: null,
      repId: "u-rep-power",
      repName: "Dina Samir",
      team: "Power Team",
      outcome: "provisional",
      previousState: "no_agreement",
      notes:
        "Owner accepted the provisional commission range. Final negotiation scheduled.",
      commissionAmount: 0,
      createdAt: isoNow(-3 * 24 * 60),
    },
    {
      id: "report-kaffyar",
      merchantId: "m-kaffyar",
      merchantName: "كافيار",
      taskId: null,
      repId: "u-rep-fox",
      repName: "Hassan Mostafa",
      team: "Fox Team",
      outcome: "no_agreement",
      previousState: "no_agreement",
      notes:
        "Initial discovery visit. Owner wants a revised premium seafood commission tier.",
      commissionAmount: 0,
      createdAt: isoNow(-2 * 24 * 60),
    },
  ];

  const transferRequests: TransferRequest[] = [
    {
      id: "transfer-abar",
      merchantId: "m-abar-sham",
      merchantName: "عبر الشام",
      fromTeam: "Power Team",
      toTeam: "Fox Team",
      requestedBy: "u-rep-fox",
      requestedByName: "Hassan Mostafa",
      justification:
        "The merchant owner is a personal contact and has explicitly requested Fox Team coverage for the next expansion branch.",
      status: "pending",
      createdAt: isoNow(-95),
      reviewedBy: null,
      reviewedByName: null,
      reviewedAt: null,
      reviewNote: "",
    },
  ];

  const editRequests: EditRequest[] = [
    {
      id: "edit-fresh",
      merchantId: "m-cairo-fresh",
      merchantName: "Cairo Fresh Market",
      requestedBy: "u-rep-fox",
      requestedByName: "Hassan Mostafa",
      reason:
        "The final report references the wrong branch contact. Please approve a correction to the visit notes.",
      status: "pending",
      createdAt: isoNow(-120),
      reviewedBy: null,
      reviewedByName: null,
      reviewedAt: null,
      reviewNote: "",
    },
  ];

  return {
    cities,
    merchants,
    tasks,
    reports,
    transferRequests,
    editRequests,
    overrides: [],
    revision: 1,
  };
}

function getStore(): FieldOpsStore {
  if (!globalStore.__kanjoV2FieldOpsStore) {
    globalStore.__kanjoV2FieldOpsStore = seedStore();
  }
  return globalStore.__kanjoV2FieldOpsStore;
}

function bump(): void {
  getStore().revision += 1;
}

export function getFieldOpsRevision(): number {
  return getStore().revision;
}

export function listCities(): City[] {
  return clone(getStore().cities).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export function getCityById(cityId: string): City | null {
  const city = getStore().cities.find((candidate) => candidate.id === cityId);
  return city ? clone(city) : null;
}

export function createCity(input: CityCreateInput, actor: Actor): City {
  const store = getStore();
  const normalized = normalizeSearchText(input.name);
  if (
    store.cities.some(
      (city) => normalizeSearchText(city.name) === normalized,
    )
  ) {
    throw new FieldOpsError(
      "CITY_EXISTS",
      "توجد مدينة بهذا الاسم بالفعل.",
      409,
    );
  }

  const zone = input.zone.map((point) => ({
    lat: Number(point.lat.toFixed(6)),
    lng: Number(point.lng.toFixed(6)),
  }));

  const city: City = {
    id: id("city"),
    name: input.name.trim(),
    country: input.country.trim(),
    governorate: input.governorate.trim(),
    population: input.population,
    stage: input.stage,
    competitors: input.competitors.map((competitor) => ({
      name: competitor.name.trim(),
      page: competitor.page.trim(),
      marketStrength: competitor.marketStrength,
    })),
    strategicNotes: input.strategicNotes.trim(),
    zone,
    boundary: zoneToBoundary(zone),
    opsManagers: [],
    createdAt: isoNow(),
    createdBy: actor.id,
    createdByName: actor.name,
  };

  store.cities.push(city);
  addUserCityScope(actor.id, city.id);
  bump();
  return clone(city);
}

export function updateCity(cityId: string, input: CityCreateInput): City {
  const store = getStore();
  const city = store.cities.find((candidate) => candidate.id === cityId);
  if (!city) {
    throw new FieldOpsError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
  }

  const normalized = normalizeSearchText(input.name);
  if (
    store.cities.some(
      (candidate) =>
        candidate.id !== cityId &&
        normalizeSearchText(candidate.name) === normalized,
    )
  ) {
    throw new FieldOpsError(
      "CITY_EXISTS",
      "توجد مدينة أخرى بهذا الاسم.",
      409,
    );
  }

  const zone = input.zone.map((point) => ({
    lat: Number(point.lat.toFixed(6)),
    lng: Number(point.lng.toFixed(6)),
  }));

  city.name = input.name.trim();
  city.country = input.country.trim();
  city.governorate = input.governorate.trim();
  city.population = input.population;
  city.stage = input.stage;
  city.competitors = input.competitors.map((competitor) => ({
    name: competitor.name.trim(),
    page: competitor.page.trim(),
    marketStrength: competitor.marketStrength,
  }));
  city.strategicNotes = input.strategicNotes.trim();
  city.zone = zone;
  city.boundary = zoneToBoundary(zone);

  bump();
  return clone(city);
}

export function listCityManagers(cityId: string): AppUser[] {
  const city = getStore().cities.find((candidate) => candidate.id === cityId);
  if (!city) {
    throw new FieldOpsError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
  }

  return city.opsManagers
    .map((userId) => getUserById(userId))
    .filter((user): user is AppUser => Boolean(user));
}

export function listAssignableManagers(): AppUser[] {
  return listUsers().filter((user) => user.active);
}

export function assignCityManagers(
  cityId: string,
  userIds: readonly string[],
): City {
  const store = getStore();
  const city = store.cities.find((candidate) => candidate.id === cityId);
  if (!city) {
    throw new FieldOpsError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
  }

  const uniqueIds = Array.from(new Set(userIds.map((id) => id.trim()))).filter(
    Boolean,
  );
  if (uniqueIds.length === 0) {
    throw new FieldOpsError(
      "MANAGER_REQUIRED",
      "اختر مديراً واحداً على الأقل.",
      422,
    );
  }

  const users = uniqueIds.map((userId) => {
    const user = getUserById(userId);
    if (!user || !user.active) {
      throw new FieldOpsError(
        "MANAGER_NOT_FOUND",
        "أحد المشغّلين المحددين غير موجود أو غير نشط.",
        422,
      );
    }
    return user;
  });

  const next = new Set(city.opsManagers);
  for (const user of users) {
    next.add(user.id);
    addUserCityScope(user.id, cityId);
  }
  city.opsManagers = Array.from(next);

  bump();
  return clone(city);
}

export function revokeCityManager(cityId: string, userId: string): City {
  const city = getStore().cities.find((candidate) => candidate.id === cityId);
  if (!city) {
    throw new FieldOpsError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
  }

  if (!city.opsManagers.includes(userId)) {
    throw new FieldOpsError(
      "MANAGER_NOT_ASSIGNED",
      "هذا المشغّل ليس مديراً للعمليات في المدينة.",
      404,
    );
  }

  city.opsManagers = city.opsManagers.filter(
    (managerId) => managerId !== userId,
  );
  removeUserCityScope(userId, cityId);
  bump();
  return clone(city);
}

export function listMerchants(): Merchant[] {
  return clone(getStore().merchants).sort((left, right) =>
    left.name.localeCompare(right.name, "ar"),
  );
}

export function getMerchantById(merchantId: string): Merchant | null {
  const merchant = getStore().merchants.find(
    (candidate) => candidate.id === merchantId,
  );
  return merchant ? clone(merchant) : null;
}

export function listTasks(): FieldTask[] {
  return clone(getStore().tasks).sort((left, right) =>
    `${left.visitDate}-${left.merchantName}`.localeCompare(
      `${right.visitDate}-${right.merchantName}`,
      "ar",
    ),
  );
}

export function tasksForViewer(input: {
  team: string;
  canManageTasks: boolean;
  date: string;
}): FieldTask[] {
  const tasks = listTasks();
  if (input.canManageTasks) return tasks;
  return tasks.filter(
    (task) => task.team === input.team && task.visitDate === input.date,
  );
}

export function listVisitReports(merchantId?: string): VisitReport[] {
  const reports = clone(getStore().reports).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  return merchantId
    ? reports.filter((report) => report.merchantId === merchantId)
    : reports;
}

export function listTransferRequests(): TransferRequest[] {
  return clone(getStore().transferRequests).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export function listEditRequests(): EditRequest[] {
  return clone(getStore().editRequests).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export function listStateOverrides(merchantId?: string): StateOverride[] {
  const overrides = clone(getStore().overrides).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  return merchantId
    ? overrides.filter((entry) => entry.merchantId === merchantId)
    : overrides;
}

export function calculateCommission(
  monthlyValue: number,
  targetCommission: number,
): number {
  return Math.round(monthlyValue * targetCommission) / 100;
}

export function createMerchant(
  input: MerchantCreateInput,
  _actor: Actor,
): Merchant {
  const store = getStore();
  const city = store.cities.find((candidate) => candidate.id === input.cityId);
  if (!city) {
    throw new FieldOpsError("CITY_NOT_FOUND", "المدينة غير موجودة.", 404);
  }

  const vendorType = assertVendorTypeExists(input.vendorTypeId);

  const normalizedName = merchantSearchKey(input.name);
  const existing = store.merchants.find(
    (candidate) => candidate.normalizedName === normalizedName,
  );
  if (existing) {
    throw new FieldOpsError(
      "MERCHANT_EXISTS",
      existing.cityId === input.cityId
        ? "يوجد تاجر بهذا الاسم في المدينة بالفعل."
        : "يوجد تاجر بهذا الاسم في مدينة أخرى. استخدم اسماً مميزاً.",
      409,
    );
  }

  const merchant: Merchant = {
    id: id("m"),
    name: input.name.trim(),
    normalizedName,
    vendorTypeId: input.vendorTypeId,
    vendorType: vendorType.name_ar,
    team: null,
    cityId: input.cityId,
    targetCommission: input.targetCommission,
    monthlyValue: input.estimatedMonthlyValue,
    strategicNotes: input.strategicNotes.trim(),
    contractState: "no_agreement",
    commissionAmount: 0,
    editUnlocked: false,
    documents: [],
    createdAt: isoNow(),
    updatedAt: isoNow(),
    lastVisitAt: null,
  };

  store.merchants.push(merchant);
  bump();
  return clone(merchant);
}

export function assignMerchantTask(
  input: TaskAssignInput,
  actor: Actor,
): { task: FieldTask; merchant: Merchant } {
  const store = getStore();
  const merchant = store.merchants.find(
    (candidate) => candidate.id === input.merchantId,
  );
  if (!merchant) {
    throw new FieldOpsError(
      "MERCHANT_NOT_FOUND",
      "التاجر المستهدف غير موجود.",
      404,
    );
  }

  const city = store.cities.find((candidate) => candidate.id === merchant.cityId);
  if (!city) {
    throw new FieldOpsError("CITY_NOT_FOUND", "مدينة التاجر غير موجودة.", 404);
  }
  if (city.stage === "preparation") {
    throw new FieldOpsError(
      "CITY_IN_PREPARATION",
      "المدينة في مرحلة الإعداد. انقلها إلى مرحلة التعاقدات قبل إسناد المهام.",
      409,
    );
  }

  if (merchant.team && merchant.team !== input.team) {
    throw new FieldOpsError(
      "TEAM_LOCKED",
      "ملكية هذا التاجر مثبتة لفريق آخر. استخدم طلب نقل الملكية بدلاً من إعادة الإسناد.",
      409,
    );
  }

  if (!merchant.team) {
    merchant.team = input.team;
  }
  merchant.updatedAt = isoNow();

  const task: FieldTask = {
    id: id("task"),
    merchantId: merchant.id,
    merchantName: merchant.name,
    team: input.team,
    cityId: merchant.cityId,
    visitDate: input.visitDate,
    targetCommission: merchant.targetCommission,
    strategicNotes: merchant.strategicNotes,
    instructions: input.instructions.trim(),
    status: "scheduled",
    createdBy: actor.id,
    createdByName: actor.name,
    createdAt: isoNow(),
  };

  store.tasks.push(task);
  bump();

  return { task: clone(task), merchant: clone(merchant) };
}

export function createVisitReport(
  merchantId: string,
  input: VisitReportInput,
  actor: Actor,
  options: { canManageState: boolean },
): { report: VisitReport; merchant: Merchant } {
  const store = getStore();
  const merchant = store.merchants.find(
    (candidate) => candidate.id === merchantId,
  );
  if (!merchant) {
    throw new FieldOpsError("MERCHANT_NOT_FOUND", "التاجر غير موجود.", 404);
  }

  const current = merchant.contractState;

  if (!options.canManageState) {
    if (current === "signed_contract") {
      throw new FieldOpsError(
        "SIGNED_LOCKED",
        "عقود التوقيع مقفلة تماماً. فقط عمليات المدن يمكنها تغييرها.",
        423,
      );
    }
    if (current === "final_contract" && !merchant.editUnlocked) {
      throw new FieldOpsError(
        "EDIT_REQUEST_REQUIRED",
        "هذا الاتفاق النهائي مقفل. أرسل طلب تعديل مع ذكر السبب لاعتماده من المدير.",
        423,
      );
    }
    if (input.outcome === "signed_contract") {
      throw new FieldOpsError(
        "SIGNED_MANAGER_ONLY",
        "فقط عمليات المدن يمكنها تحويل التاجر إلى موقّع.",
        403,
      );
    }
    if (
      current === "final_contract" &&
      input.outcome !== "final_contract" &&
      !merchant.editUnlocked
    ) {
      throw new FieldOpsError(
        "FINAL_LOCKED",
        "لا يمكن للمندوب التراجع عن حالة الاتفاق النهائي.",
        423,
      );
    }
  }

  const commissionAmount =
    input.outcome === "signed_contract"
      ? calculateCommission(
          merchant.monthlyValue,
          merchant.targetCommission,
        )
      : 0;

  merchant.contractState = input.outcome;
  merchant.commissionAmount = commissionAmount;
  merchant.editUnlocked = false;
  merchant.lastVisitAt = isoNow();
  merchant.updatedAt = isoNow();

  if (input.taskId) {
    const task = store.tasks.find((candidate) => candidate.id === input.taskId);
    if (task) {
      if (task.merchantId !== merchant.id) {
        throw new FieldOpsError(
          "TASK_MISMATCH",
          "هذه المهمة لا تتبع هذا التاجر.",
          400,
        );
      }
      task.status = "completed";
    }
  }

  const report: VisitReport = {
    id: id("report"),
    merchantId: merchant.id,
    merchantName: merchant.name,
    taskId: input.taskId ?? null,
    repId: actor.id,
    repName: actor.name,
    team: actor.team,
    outcome: input.outcome,
    previousState: current,
    notes: input.notes.trim(),
    commissionAmount,
    createdAt: isoNow(),
  };

  store.reports.push(report);
  bump();

  return { report: clone(report), merchant: clone(merchant) };
}

export function createTransferRequest(
  merchantId: string,
  justification: string,
  actor: Actor,
): TransferRequest {
  const store = getStore();
  const merchant = store.merchants.find(
    (candidate) => candidate.id === merchantId,
  );
  if (!merchant) {
    throw new FieldOpsError("MERCHANT_NOT_FOUND", "التاجر غير موجود.", 404);
  }
  if (!merchant.team) {
    throw new FieldOpsError(
      "MERCHANT_UNASSIGNED",
      "هذا التاجر غير مسند لأي فريق بعد. أسنده إلى فريق أولاً.",
      409,
    );
  }
  if (merchant.team === actor.team) {
    throw new FieldOpsError(
      "SAME_TEAM",
      "هذا التاجر تابع لفريقك بالفعل.",
      400,
    );
  }
  if (
    store.transferRequests.some(
      (request) =>
        request.merchantId === merchantId &&
        request.requestedBy === actor.id &&
        request.status === "pending",
    )
  ) {
    throw new FieldOpsError(
      "TRANSFER_PENDING",
      "يوجد طلب نقل لهذا التاجر قيد المراجعة بالفعل.",
      409,
    );
  }

  const request: TransferRequest = {
    id: id("transfer"),
    merchantId: merchant.id,
    merchantName: merchant.name,
    fromTeam: merchant.team,
    toTeam: actor.team,
    requestedBy: actor.id,
    requestedByName: actor.name,
    justification: justification.trim(),
    status: "pending",
    createdAt: isoNow(),
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: "",
  };

  store.transferRequests.push(request);
  bump();
  return clone(request);
}

export function decideTransferRequest(
  requestId: string,
  decision: "approve" | "reject",
  actor: Actor,
  note: string,
): TransferRequest {
  const store = getStore();
  const request = store.transferRequests.find(
    (candidate) => candidate.id === requestId,
  );
  if (!request) {
    throw new FieldOpsError("TRANSFER_NOT_FOUND", "الطلب غير موجود.", 404);
  }
  if (request.status !== "pending") {
    throw new FieldOpsError(
      "TRANSFER_CLOSED",
      "تمت مراجعة طلب النقل هذا بالفعل.",
      409,
    );
  }

  request.status = decision === "approve" ? "approved" : "rejected";
  request.reviewedBy = actor.id;
  request.reviewedByName = actor.name;
  request.reviewedAt = isoNow();
  request.reviewNote = note.trim();

  if (decision === "approve") {
    const merchant = store.merchants.find(
      (candidate) => candidate.id === request.merchantId,
    );
    if (merchant) {
      merchant.team = request.toTeam;
      merchant.updatedAt = isoNow();
      store.tasks.forEach((task) => {
        if (
          task.merchantId === merchant.id &&
          task.status === "scheduled"
        ) {
          task.team = request.toTeam;
        }
      });
    }
  }

  bump();
  return clone(request);
}

export function createEditRequest(
  merchantId: string,
  reason: string,
  actor: Actor,
): EditRequest {
  const store = getStore();
  const merchant = store.merchants.find(
    (candidate) => candidate.id === merchantId,
  );
  if (!merchant) {
    throw new FieldOpsError("MERCHANT_NOT_FOUND", "التاجر غير موجود.", 404);
  }
  if (merchant.contractState === "signed_contract") {
    throw new FieldOpsError(
      "SIGNED_LOCKED",
      "لا يمكن تعديل عقود التوقيع عبر طلب مندوب.",
      423,
    );
  }
  if (merchant.contractState !== "final_contract") {
    throw new FieldOpsError(
      "NOT_LOCKED",
      "طلبات التعديل مخصصة للاتفاقيات النهائية فقط.",
      400,
    );
  }
  if (merchant.editUnlocked) {
    throw new FieldOpsError(
      "ALREADY_UNLOCKED",
      "هذا التاجر مفتوح بالفعل لتعديل معتمد.",
      409,
    );
  }
  if (
    store.editRequests.some(
      (request) =>
        request.merchantId === merchantId &&
        request.requestedBy === actor.id &&
        request.status === "pending",
    )
  ) {
    throw new FieldOpsError(
      "EDIT_PENDING",
      "يوجد طلب تعديل لهذا التاجر قيد المراجعة بالفعل.",
      409,
    );
  }

  const request: EditRequest = {
    id: id("edit"),
    merchantId: merchant.id,
    merchantName: merchant.name,
    requestedBy: actor.id,
    requestedByName: actor.name,
    reason: reason.trim(),
    status: "pending",
    createdAt: isoNow(),
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: "",
  };

  store.editRequests.push(request);
  bump();
  return clone(request);
}

export function decideEditRequest(
  requestId: string,
  decision: "approve" | "reject",
  actor: Actor,
  note: string,
): EditRequest {
  const store = getStore();
  const request = store.editRequests.find(
    (candidate) => candidate.id === requestId,
  );
  if (!request) {
    throw new FieldOpsError("EDIT_NOT_FOUND", "الطلب غير موجود.", 404);
  }
  if (request.status !== "pending") {
    throw new FieldOpsError(
      "EDIT_CLOSED",
      "تمت مراجعة طلب التعديل هذا بالفعل.",
      409,
    );
  }

  request.status = decision === "approve" ? "approved" : "rejected";
  request.reviewedBy = actor.id;
  request.reviewedByName = actor.name;
  request.reviewedAt = isoNow();
  request.reviewNote = note.trim();

  if (decision === "approve") {
    const merchant = store.merchants.find(
      (candidate) => candidate.id === request.merchantId,
    );
    if (merchant) {
      merchant.editUnlocked = true;
      merchant.updatedAt = isoNow();
    }
  }

  bump();
  return clone(request);
}

export function setMerchantState(
  merchantId: string,
  state: ContractState,
  note: string,
  actor: Actor,
): { merchant: Merchant; override: StateOverride } {
  const store = getStore();
  const merchant = store.merchants.find(
    (candidate) => candidate.id === merchantId,
  );
  if (!merchant) {
    throw new FieldOpsError("MERCHANT_NOT_FOUND", "التاجر غير موجود.", 404);
  }

  const previous = merchant.contractState;
  const commissionAmount =
    state === "signed_contract"
      ? calculateCommission(merchant.monthlyValue, merchant.targetCommission)
      : 0;

  merchant.contractState = state;
  merchant.commissionAmount = commissionAmount;
  merchant.editUnlocked = false;
  merchant.updatedAt = isoNow();

  const override: StateOverride = {
    id: id("override"),
    merchantId: merchant.id,
    merchantName: merchant.name,
    fromState: previous,
    toState: state,
    actorId: actor.id,
    actorName: actor.name,
    note: note.trim(),
    createdAt: isoNow(),
  };
  store.overrides.push(override);

  const report: VisitReport = {
    id: id("report"),
    merchantId: merchant.id,
    merchantName: merchant.name,
    taskId: null,
    repId: actor.id,
    repName: actor.name,
    team: actor.team,
    outcome: state,
    previousState: previous,
    notes: `Manager state override: ${note.trim()}`,
    commissionAmount,
    createdAt: isoNow(),
  };
  store.reports.push(report);
  bump();

  return { merchant: clone(merchant), override: clone(override) };
}

export function addMerchantDocument(
  merchantId: string,
  input: MerchantDocumentInput,
  actor: Actor,
): Merchant {
  const store = getStore();
  const merchant = store.merchants.find(
    (candidate) => candidate.id === merchantId,
  );
  if (!merchant) {
    throw new FieldOpsError("MERCHANT_NOT_FOUND", "التاجر غير موجود.", 404);
  }
  if (
    merchant.contractState !== "final_contract" &&
    merchant.contractState !== "signed_contract"
  ) {
    throw new FieldOpsError(
      "AGREEMENT_REQUIRED",
      "تُفتح المستندات فقط بعد الاتفاق النهائي أو توقيع العقد.",
      423,
    );
  }

  const document: MerchantDocument = {
    id: id("doc"),
    name: input.name.trim(),
    type: input.type,
    url: input.url.trim(),
    uploadedAt: isoNow(),
    uploadedBy: actor.id,
  };
  merchant.documents.push(document);
  merchant.updatedAt = isoNow();
  bump();
  return clone(merchant);
}

export function today(): string {
  return todayIso();
}

export function yesterday(): string {
  return todayIso(-1);
}
