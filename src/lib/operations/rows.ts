/**
 * Shared row-mapping helpers for the operations repositories.
 *
 * PostgREST returns an embedded relation as an object on a to-one join and as
 * an array otherwise, and the shape depends on the inferred relationship. One
 * unwrap keeps both repositories honest without repeating the array dance.
 */

type Embed =
  | {
      name?: string;
      display_name?: string;
      order_id?: string;
      full_name?: string;
    }
  | {
      name?: string;
      display_name?: string;
      order_id?: string;
      full_name?: string;
    }[]
  | null;

export function embedName(embed: Embed, fallback: string): string {
  const value = Array.isArray(embed) ? embed[0] : embed;
  const name =
    value?.name ?? value?.display_name ?? value?.order_id ?? value?.full_name;
  return name && name.trim() !== "" ? name : fallback;
}
