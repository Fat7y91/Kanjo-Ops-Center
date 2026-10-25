import { z } from "zod";

export const geoPolygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z
    .array(
      z
        .array(
          z.tuple([
            z.number().min(-180).max(180),
            z.number().min(-90).max(90),
          ]),
        )
        .min(3),
    )
    .min(1),
});

export const geoIntelligenceSchema = z.object({
  polygon: geoPolygonSchema,
  datasetCityId: z.string().trim().optional(),
});

export type GeoIntelligenceInput = z.infer<typeof geoIntelligenceSchema>;
