// Shared between client and server: meals become favorites two ways —
// manually starred, or automatically once the same normalized text has been
// logged AUTO_FAVORITE_THRESHOLD+ times. Normalization is plain text
// matching (lowercase, trim, strip punctuation, collapse whitespace), not
// fuzzy/AI matching, so re-logging the exact same phrasing is what builds
// the count.
export const AUTO_FAVORITE_THRESHOLD = 3;

export function normalizeMealKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}
