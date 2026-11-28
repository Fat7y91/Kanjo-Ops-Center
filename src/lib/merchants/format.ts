/**
 * Merchant display helpers.
 *
 * Kept free of React so the monogram rule can be unit-tested directly and
 * reused by any surface that shows a merchant without rendering the avatar.
 */

/**
 * Returns the monogram for a merchant name.
 *
 * Arabic merchant names usually lead with a category word ("مطعم ...", "كافيه
 * ..."), so the first two words would read as noise. One letter from the first
 * word is the clearest mark at avatar sizes.
 */
export function merchantInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) return "?";
  const first = Array.from(words[0]);
  return (first[0] ?? "?").toUpperCase();
}
