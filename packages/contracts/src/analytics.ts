import { countryCurrencyData } from "./markets";
import { catalogCategories, serviceCatalog } from "./catalog";

// No free-text properties, client identity, timestamp, prices or conversation content.
export const analyticsEvents = ["app_active", "catalog_search", "catalog_result_selected",
  "catalog_no_result", "manual_service_fallback_selected", "category_filter_used",
  "subscription_add_started", "subscription_add_cancelled", "ai_add_form_opened",
  "ai_add_cancelled", "management_flow_opened", "management_browser_returned",
  "report_generated"] as const;
export type AnalyticsEvent = {
  event: typeof analyticsEvents[number]; market: string;
  service?: string; category?: string; platform: "ios" | "android" | "web";
};
export function parseAnalyticsEvent(input: unknown): AnalyticsEvent {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_EVENT");
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["event", "market", "service", "category", "platform"].includes(key))) throw new Error("INVALID_EVENT");
  if (!analyticsEvents.includes(value.event as AnalyticsEvent["event"]) ||
      !countryCurrencyData.some(([code]) => code === value.market) ||
      (typeof value.platform !== "string" || !["ios", "android", "web"].includes(value.platform))) throw new Error("INVALID_EVENT");
  if (value.service !== undefined && !serviceCatalog.some(service => service.slug === value.service)) throw new Error("INVALID_EVENT");
  if (value.category !== undefined && !catalogCategories.some(category => category.id === value.category)) throw new Error("INVALID_EVENT");
  if (["catalog_no_result", "manual_service_fallback_selected"].includes(String(value.event)) && value.service !== undefined) throw new Error("INVALID_EVENT");
  return { event: value.event as AnalyticsEvent["event"], market: String(value.market), platform: value.platform as AnalyticsEvent["platform"],
    ...(value.service === undefined ? {} : {service: String(value.service)}),
    ...(value.category === undefined ? {} : {category: String(value.category)}) };
}
