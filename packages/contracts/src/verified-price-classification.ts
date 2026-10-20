// Read-only classification of current provider prices. Historical observations
// retain their original verification and source; this never admits new Truth.
export type CurrentProviderPriceClass = "SUGGESTED" | "OLD_VERIFIED" | "VERIFIED";

export function classifyCurrentProviderPrice(row: {
  source?: string | null;
  verification?: string | null;
  sourceCount?: number | null;
  verifiedByAgreement?: boolean | null;
}): CurrentProviderPriceClass {
  const qualified = row.verification === "registry" ||
    row.verification === "authoritative-provider" ||
    (row.verification === "multi-source" && row.verifiedByAgreement === true &&
      (row.sourceCount ?? 0) >= 2);
  if (!qualified) return "SUGGESTED";
  return row.source?.startsWith("official-provider-adapter:") ? "OLD_VERIFIED" : "VERIFIED";
}

// The SQL readers use the same qualification and source boundary as the
// in-memory projection. Keep this expression scoped to a current-price row.
export const currentProviderPriceClassSql = `CASE
  WHEN verification IN ('registry','authoritative-provider')
    OR (verification='multi-source' AND verified_by_agreement=true AND source_count>=2)
  THEN CASE WHEN source LIKE 'official-provider-adapter:%' THEN 'old_verified' ELSE 'verified' END
  ELSE 'suggested' END`;
