import { z } from "zod";

import {
  CITY_STATUSES,
  CONTRACT_STATES,
  FIELD_TEAMS,
} from "@/lib/field-ops/types";

const zonePointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const competitorSchema = z.object({
  name: z.string().trim().min(2, "Competitor name is required.").max(80),
  page: z.union([z.string().trim().url("Enter a valid competitor URL."), z.literal("")]),
  marketStrength: z.enum(["low", "medium", "high"]),
});

export const cityCreateSchema = z.object({
  name: z.string().trim().min(2, "City name is required.").max(80),
  country: z.string().trim().min(2, "Country is required.").max(60),
  population: z.coerce
    .number()
    .int("Population must be a whole number.")
    .min(1, "Population must be positive.")
    .max(100_000_000),
  status: z.enum(CITY_STATUSES),
  competitors: z.array(competitorSchema).max(10),
  strategicNotes: z.string().trim().max(2000),
  zone: z
    .array(zonePointSchema)
    .min(3, "Draw at least three zone vertices on the map."),
});

export const taskCreateSchema = z.object({
  merchantName: z.string().trim().min(2, "Merchant name is required.").max(120),
  cityId: z.string().trim().min(1, "Select a city."),
  team: z.enum(FIELD_TEAMS),
  visitDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Visit date must be YYYY-MM-DD."),
  targetCommission: z.coerce
    .number()
    .min(0, "Commission cannot be negative.")
    .max(100, "Commission cannot exceed 100%."),
  strategicNotes: z.string().trim().max(2000).default(""),
  estimatedMonthlyValue: z.coerce
    .number()
    .min(0)
    .max(100_000_000)
    .default(100_000),
});

export const visitReportSchema = z.object({
  outcome: z.enum(CONTRACT_STATES),
  notes: z
    .string()
    .trim()
    .min(10, "Visit notes must be at least 10 characters.")
    .max(4000),
  taskId: z.string().trim().min(1).nullable().optional(),
});

export const transferRequestSchema = z.object({
  justification: z
    .string()
    .trim()
    .min(10, "A justification of at least 10 characters is required.")
    .max(1000),
});

export const editRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "An edit reason of at least 10 characters is required.")
    .max(1000),
});

export const decisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().max(1000).optional().default(""),
});

export const merchantStateSchema = z.object({
  state: z.enum(CONTRACT_STATES),
  note: z
    .string()
    .trim()
    .min(5, "A state-change note of at least 5 characters is required.")
    .max(1000),
});

export const merchantDocumentSchema = z.object({
  name: z.string().trim().min(2, "Document name is required.").max(160),
  type: z.enum(["contract", "tax", "license", "other"]),
  url: z.union([z.string().trim().url("Enter a valid document URL."), z.literal("")]),
});

export type CityCreateInput = z.infer<typeof cityCreateSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type VisitReportInput = z.infer<typeof visitReportSchema>;
export type TransferRequestInput = z.infer<typeof transferRequestSchema>;
export type EditRequestInput = z.infer<typeof editRequestSchema>;
export type DecisionInput = z.infer<typeof decisionSchema>;
export type MerchantStateInput = z.infer<typeof merchantStateSchema>;
export type MerchantDocumentInput = z.infer<typeof merchantDocumentSchema>;

export function zodErrorMessage(error: z.ZodError): string {
  const first = error.errors[0];
  if (!first) return "Validation failed.";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}
