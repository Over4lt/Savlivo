import { catalogCategories, serviceEligibleForCatalog, serviceCatalog, type CatalogCategory } from "../../../packages/contracts/src/catalog";

// Browse every web-eligible identity, regardless of automatic price coverage.
// Search retains the canonical alias matcher and its separate result limit.
export function browseCatalog(country: string, category?: CatalogCategory) {
  const order = new Map(catalogCategories.map((entry, index) => [entry.id, index]));
  return serviceCatalog.filter(service => serviceEligibleForCatalog(service.slug, country) &&
    (!category || service.categories.includes(category)))
    .sort((a, b) => (order.get(a.categories[0]) ?? 99) - (order.get(b.categories[0]) ?? 99) || a.name.localeCompare(b.name));
}
