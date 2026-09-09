import { normalizeCatalogText, serviceCatalog } from "./catalog.js";
import { countryCurrencyData, subscriptionsForMarket } from "./markets.js";
import type { AddSubscriptionIntent } from "./discovery.js";

export const managementActions = ["MANAGE", "CHANGE_PLAN", "PAUSE", "CANCEL", "REACTIVATE", "BILLING"] as const;
export type ManagementAction = typeof managementActions[number];
export type ManagementIntent = {
  kind: "open-subscription-management";
  version: 1;
  countryCode: string;
  currency: string;
  serviceQuery: string;
  managementAction: ManagementAction;
  requiresConfirmation: true;
};
export type AssistantAction = AddSubscriptionIntent | ManagementIntent;

// The model may extract text and an intent, never a trusted URL, price or country.
export function modelActionCandidate(value: unknown, countryCode: string, currency: string): AssistantAction | null {
  if (!value || typeof value !== "object" || !countryCurrencyData.some(([cc,,cur])=>cc===countryCode&&cur===currency)) return null;
  const v=value as Record<string,unknown>;
  if(typeof v.serviceQuery!=="string" || v.serviceQuery.length>160 || /[\x00-\x1f\x7f]/.test(v.serviceQuery))return null;
  if(v.type==="ADD") {
    if(!v.serviceQuery.trim() || (v.planQuery!=null && (typeof v.planQuery!=="string" || v.planQuery.length>160)) ||
      (v.billingProviderSlug!=null && (typeof v.billingProviderSlug!=="string" || v.billingProviderSlug.length>60)))return null;
    return {kind:"open-add-subscription",version:1,countryCode,currency,serviceQuery:v.serviceQuery.trim(),
      ...(typeof v.planQuery==="string"?{planQuery:v.planQuery}:{}),
      ...(typeof v.billingProviderSlug==="string"?{billingProviderSlug:v.billingProviderSlug}:{}),requiresConfirmation:true};
  }
  if(v.type==="MANAGEMENT" && managementActions.includes(v.managementAction as ManagementAction))return {
    kind:"open-subscription-management",version:1,countryCode,currency,serviceQuery:v.serviceQuery.trim(),
    managementAction:v.managementAction as ManagementAction,requiresConfirmation:true
  };
  return null;
}

export type SavedManagementRecord = {id:string;serviceSlug:string;serviceName:string;billingProviderSlug:string;countryCode?:string;currency?:string};
export function resolveSavedManagement<T extends SavedManagementRecord>(value:unknown, records:readonly T[], countryCode:string, currency:string) {
  if(!value || typeof value!=="object")return {kind:"invalid" as const};
  const v=value as Record<string,unknown>;
  if(v.kind!=="open-subscription-management" || v.version!==1 || v.requiresConfirmation!==true || v.countryCode!==countryCode || v.currency!==currency ||
    !countryCurrencyData.some(([cc,,cur])=>cc===countryCode&&cur===currency) || typeof v.serviceQuery!=="string" || v.serviceQuery.length>160 || !managementActions.includes(v.managementAction as ManagementAction))return {kind:"invalid" as const};
  const query=normalizeCatalogText(v.serviceQuery);
  const canonical=serviceCatalog.filter(s=>[s.slug,s.name,...s.aliases].some(a=>normalizeCatalogText(a)===query));
  const scoped=subscriptionsForMarket([...records],countryCode);
  const matches=scoped.filter(s=>!query || normalizeCatalogText(s.serviceName)===query || (s.serviceSlug!=="manual" &&
    (normalizeCatalogText(s.serviceSlug)===query || canonical.some(c=>c.slug===s.serviceSlug))));
  // Never let a model-supplied ID choose between multiple matching bills.
  if(matches.length>1)return {kind:"ambiguous" as const};
  if(matches.length===0)return {kind:"missing" as const};
  if(!["direct","apple","google-play","amazon","carrier","google","tv-provider","carrier-tv"].includes(matches[0].billingProviderSlug))return {kind:"invalid" as const};
  return {kind:"subscription" as const,subscription:matches[0],action:v.managementAction as ManagementAction,requiresConfirmation:true as const};
}
