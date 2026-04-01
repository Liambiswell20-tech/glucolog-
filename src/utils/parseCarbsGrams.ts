/**
 * Extracts a numeric carb-gram value from an AI estimate string.
 * Handles ranges ("40-50g" or "40\u201350g") by taking the midpoint,
 * single values ("45g"), and returns null for unparseable input.
 */
export function parseCarbsGrams(estimate: string | null): number | null {
  if (!estimate) return null;
  // Range like "40\u201350g" or "40-50g" \u2192 midpoint
  const rangeMatch = estimate.match(/(\d+)[\u2013\-](\d+)\s*g/);
  if (rangeMatch) return Math.round((parseInt(rangeMatch[1], 10) + parseInt(rangeMatch[2], 10)) / 2);
  // Single value like "45g"
  const singleMatch = estimate.match(/(\d+)\s*g/);
  if (singleMatch) return parseInt(singleMatch[1], 10);
  return null;
}
