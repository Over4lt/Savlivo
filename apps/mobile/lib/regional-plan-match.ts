const normalizedPlan = (value: string) => value.normalize("NFKD").toLowerCase()
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function matchesRegionalPlan(
  entry: {planName?: unknown; planSlug?: unknown; serviceSlug?: unknown}, savedName: string,
  serviceSlug = String(entry.serviceSlug ?? "")
) {
  const wanted = normalizedPlan(savedName);
  if (!wanted) return false;
  const name = normalizedPlan(String(entry.planName ?? ""));
  const slug = normalizedPlan(String(entry.planSlug ?? ""));
  if (name === wanted || slug === wanted) return true;
  // Only documented Max tier names may link an older saved subscription to
  // its newly localized V3 plan. Price equality never enters the match.
  if (serviceSlug !== "max") return false;
  const ads = new Set(["basic-with-ads", "basis-med-reklame", "basic-med-reklam", "basis-med-reklamer"]);
  return ads.has(wanted) && (ads.has(name) || ads.has(slug));
}
