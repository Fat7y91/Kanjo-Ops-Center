import { z } from "zod";

/**
 * Wire contract for `POST /api/catalog/mirror-images`.
 *
 * The catalog UI validates the response with this schema before touching local
 * product state, so a shifted status value fails at the boundary instead of
 * silently showing a stale image.
 */

export const mirrorStatusSchema = z.enum([
  "mirrored",
  "already_hosted",
  "failed",
]);

export const mirrorItemResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: mirrorStatusSchema,
  url: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
});

export const mirrorImagesPayloadSchema = z.object({
  results: z.array(mirrorItemResultSchema),
});

export type MirrorStatus = z.infer<typeof mirrorStatusSchema>;
export type MirrorItemResult = z.infer<typeof mirrorItemResultSchema>;
export type MirrorImagesPayload = z.infer<typeof mirrorImagesPayloadSchema>;
