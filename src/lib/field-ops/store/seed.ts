import {
  zoneToBoundary,
  type City,
  type EditRequest,
  type FieldTask,
  type TransferRequest,
  type VisitReport,
} from "@/lib/field-ops/types";

import { isoNow, todayIso, zone, type FieldOpsStore } from "./core";

export function seedStore(): FieldOpsStore {
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
      agreedCommission: 8,
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
      agreedCommission: 7,
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
    tasks,
    reports,
    followUps: [],
    transferRequests,
    editRequests,
    overrides: [],
    revision: 1,
  };
}

