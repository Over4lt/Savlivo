// Response negotiation only, never authentication or catalog identity.
export function supportsManualSubscriptions(headers: Record<string, string | string[] | undefined>) {
  return headers["x-savlivo-subscription-format"] === "manual-v1";
}

export function subscriptionForClient<T extends { id: string; serviceSlug: string }>(item: T, modern: boolean): T {
  return !modern && item.serviceSlug === "manual"
    ? { ...item, serviceSlug: `manual:${item.id}` }
    : item;
}

export function subscriptionEditIdentity(serviceSlug: string, id: string, modern: boolean) {
  if (!serviceSlug.startsWith("manual:")) return { serviceSlug, preserveManualIdentity: false };
  if (modern || serviceSlug !== `manual:${id}`) throw new Error("INVALID_MANUAL_SUBSCRIPTION");
  return { serviceSlug: "manual", preserveManualIdentity: true };
}
