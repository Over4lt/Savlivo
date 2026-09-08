import { serviceCatalog, billingProviders, catalogPlans, normalizeCatalogText, resolveCatalogCandidate, defaultBillingProviderForService, isBillingProviderAllowed, type CatalogPriceEvidence } from "./catalog";
import { countryCurrencyData } from "./markets";

// Transport contains user-stated queries, never trusted model prices or provider URLs.
export type AddSubscriptionIntent = {
  kind: "open-add-subscription"; version: 1; countryCode: string; currency: string;
  serviceQuery: string; planQuery?: string; billingProviderSlug?: string;
  requiresConfirmation: true;
};
export function parseAddSubscriptionIntent(message: string, countryCode: string, currency: string): AddSubscriptionIntent | null {
  const match = message.trim().match(/^(?:please\s+)?(?:add(?:\s+a subscription for)?|legg til|jeg har|i have)\s+(.+?)[.!]?$/i);
  if (!match || !countryCurrencyData.some(([cc,,cur]) => cc === countryCode && cur === currency)) return null;
  let text = match[1].trim();
  // Do not interpret negations, multiple subscriptions or management requests as adds.
  if (/\b(?:not|ikke|cancel(?:led|ed)?|paus(?:e|ed)|delet(?:e|ed)|slett(?:et)?|avslutt(?:et)?)\b/i.test(text) || text.length > 160) return null;
  let billingProviderSlug: string | undefined;
  const route = text.match(/\s+(?:through|via|billed through|som jeg betaler gjennom|betaler gjennom)\s+(.{1,60})\s*$/i);
  if (route) {
    billingProviderSlug = ({apple:"apple", "google play":"google-play", amazon:"amazon", carrier:"carrier", direct:"direct"} as Record<string,string>)[route[1].trim().toLowerCase()] ?? "unresolved";
    text = text.slice(0, route.index).trim();
  }
  const normalized = normalizeCatalogText(text);
  const matches = serviceCatalog.flatMap(service => [service.name,service.slug,...service.aliases].map(alias => ({service,alias:normalizeCatalogText(alias)})))
    .filter(({alias}) => normalized === alias || normalized.startsWith(alias + " "))
    .sort((a,b) => b.alias.length-a.alias.length);
  const best = matches[0];
  if (best && matches.some(m => m.alias.length === best.alias.length && m.service.slug !== best.service.slug)) return null;
  const remainder = best ? normalized.slice(best.alias.length).trim() : "";
  if (/\b(?:and|og)\b/.test(remainder)) return null;
  return {kind:"open-add-subscription",version:1,countryCode,currency,
    serviceQuery:best ? best.service.slug : text,
    ...(remainder ? {planQuery:remainder} : {}),
    ...(billingProviderSlug ? {billingProviderSlug} : {}),requiresConfirmation:true};
}

export function validateAddSubscriptionIntent(value: unknown, countryCode: string, currency: string, prices: readonly CatalogPriceEvidence[]) {
  if (!value || typeof value !== "object") return null;
  const v=value as Record<string,unknown>;
  if(v.kind!=="open-add-subscription" || v.version!==1 || v.requiresConfirmation!==true || v.countryCode!==countryCode || v.currency!==currency ||
    !countryCurrencyData.some(([cc,,cur])=>cc===countryCode&&cur===currency) || typeof v.serviceQuery!=="string" || !v.serviceQuery.trim() || v.serviceQuery.length>160) return null;
  if ((v.planQuery !== undefined && (typeof v.planQuery !== "string" || v.planQuery.length > 160)) ||
      (v.billingProviderSlug !== undefined && typeof v.billingProviderSlug !== "string")) return null;
  const service=resolveCatalogCandidate({serviceQuery:v.serviceQuery,countryCode,currency},[]);
  if(service.kind==="ambiguous")return null;
  if(service.kind==="unknown")return {kind:"manual" as const,customServiceName:v.serviceQuery.trim().slice(0,100),countryCode,currency,requiresConfirmation:true as const};
  const requestedRoute=typeof v.billingProviderSlug==="string" ? v.billingProviderSlug : undefined;
  const route=requestedRoute && isBillingProviderAllowed(service.serviceSlug,requestedRoute) ? requestedRoute : undefined;
  // An explicit unsupported route stays unresolved, rather than silently becoming direct.
  const billingProviderSlug=requestedRoute ? route : defaultBillingProviderForService(service.serviceSlug);
  const planQuery=typeof v.planQuery==="string" ? normalizeCatalogText(v.planQuery) : "";
  const displayName=serviceCatalog.find(s=>s.slug===service.serviceSlug)!.name;
  const matchingNames=[...new Set(catalogPlans(service.serviceSlug,countryCode,currency,prices)
    .filter(p=>p.billingProviderSlug===billingProviderSlug && planQuery &&
      [planQuery,normalizeCatalogText(displayName+" "+planQuery)].includes(normalizeCatalogText(p.planName))).map(p=>p.planName))];
  const candidate=resolveCatalogCandidate({serviceQuery:service.serviceSlug,countryCode,currency,
    planName:matchingNames.length===1?matchingNames[0]:undefined,billingProviderSlug},service.availableForSelection ? prices : []);
  if(candidate.kind!=="service")return null;
  return {...candidate,billingProviderSlug:billingProviderSlug ?? "", requestedRouteUnresolved:Boolean(requestedRoute&&!route)};
}

export function validateManualSubscription(input: {customServiceName?:unknown; billingProviderSlug?:unknown; monthlyPriceMinor?:unknown; countryCode?:unknown; currency?:unknown; planName?:unknown; renewalDate?:unknown}) {
  const name=typeof input.customServiceName==="string"?input.customServiceName.trim():"";
  if(!name || name.length>100 || /[\x00-\x1f\x7f]/.test(String(input.customServiceName)) ||
    !billingProviders.some(route=>route.slug===input.billingProviderSlug) ||
    !Number.isSafeInteger(input.monthlyPriceMinor) || Number(input.monthlyPriceMinor)<=0 || Number(input.monthlyPriceMinor)>2147483647 ||
    !countryCurrencyData.some(([cc,,cur])=>cc===input.countryCode&&cur===input.currency) ||
    (input.planName!=null && (typeof input.planName!=="string" || input.planName.length>100 || /[\x00-\x1f\x7f]/.test(input.planName))) ||
    (input.renewalDate!=null && (typeof input.renewalDate!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.renewalDate) || !Number.isFinite(Date.parse(input.renewalDate)) || new Date(input.renewalDate).toISOString().slice(0,10)!==input.renewalDate))) throw new Error("INVALID_MANUAL_SUBSCRIPTION");
  return name;
}

export function discoveryRequestIsCurrent(request: {countryCode:string; epoch:number}, current: {countryCode:string; epoch:number}) {
  return request.countryCode === current.countryCode && request.epoch === current.epoch;
}
