import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import test from "node:test";
import ts from "typescript";
import { browseCatalog } from "./catalog-browse";
import { appLanguages, appLocale, translateUi, uiTranslations } from "./ui-localization";
import { configuredSavlivoPrice } from "./savlivo-plan-prices";
import { catalogCategories, searchCatalog, serviceCatalog, serviceAvailableInMarket } from "../../../packages/contracts/src/catalog";
import { countryCurrencyData, formatMarketMinor, subscriptionsForMarket } from "../../../packages/contracts/src/markets";
import { validateManualSubscription } from "../../../packages/contracts/src/discovery";

const source = readFileSync(new URL("../app/index.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("index.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function descendants(node: ts.Node): ts.Node[] {
  const result: ts.Node[] = [node];
  ts.forEachChild(node, child => { result.push(...descendants(child)); });
  return result;
}
const nodes = descendants(ast);

test("browse exposes every available service in all 30 markets, independent of prices and relevance limits", () => {
  assert.equal(countryCurrencyData.length, 30);
  assert.equal(serviceCatalog.length, 43);
  for (const [country] of countryCurrencyData) {
    const expected = serviceCatalog.filter(s => serviceAvailableInMarket(s.slug, country)).map(s => s.slug).sort();
    assert.deepEqual(browseCatalog(country).map(s => s.slug).sort(), expected, country);
    assert.equal(new Set(browseCatalog(country).map(s => s.slug)).size, expected.length);
  }
  assert.ok(browseCatalog("NO").length > 12);
});

test("category browsing includes all category members and groups the default browse", () => {
  for (const [country] of countryCurrencyData) {
    for (const category of catalogCategories) {
      assert.deepEqual(browseCatalog(country, category.id).map(s => s.slug).sort(),
        browseCatalog(country).filter(s => s.categories.includes(category.id)).map(s => s.slug).sort());
    }
    const groupOrder = browseCatalog(country).map(s => catalogCategories.findIndex(c => c.id === s.categories[0]));
    assert.deepEqual(groupOrder, [...groupOrder].sort((a, b) => a - b));
  }
});

test("search keeps aliases and foreign explicit matches without claiming local availability", () => {
  assert.equal(searchCatalog("  DISNEY   PLUS ", "NO")[0]?.slug, "disney-plus");
  assert.equal(searchCatalog("HBO MAX", "NO")[0]?.slug, "max");
  assert.equal(searchCatalog("腾讯视频", "NO")[0]?.slug, "tencent-video");
  assert.equal(serviceAvailableInMarket("tencent-video", "NO"), false);
  assert.deepEqual(searchCatalog("Unlisted LocalTV", "NO"), []);
});

test("manual entry stays ahead of the browse list and preserves unknown identities", () => {
  assert.ok(source.indexOf('onPress={()=>beginManualService(catalogQuery)}') < source.indexOf("{catalogResults.map("));
  const manual = {customServiceName:"Unlisted LocalTV",planName:"",monthlyPriceMinor:1234,countryCode:"NO",currency:"NOK",billingProviderSlug:"carrier",renewalDate:"2026-10-15"};
  const result = validateManualSubscription(manual);
  assert.equal(result, manual.customServiceName);
  assert.doesNotMatch(JSON.stringify(result), /netflix|https?:/i);
  assert.match(JSON.stringify(result), /Unlisted LocalTV/);
});

test("every static tr key and every dictionary key has translations in all 11 non-English languages", () => {
  const keys = new Set(Object.values(uiTranslations).flatMap(dictionary => Object.keys(dictionary ?? {})));
  for (const node of nodes) {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === "tr" && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) keys.add(node.arguments[0].text);
  }
  for (const {code} of appLanguages.filter(l => l.code !== "en")) {
    for (const key of keys) {
      const translated = uiTranslations[code]?.[key];
      assert.ok(translated, `${code}: ${key}`);
      assert.deepEqual((translated.match(/\{\w+\}/g) ?? []).sort(), (key.match(/\{\w+\}/g) ?? []).sort(), `${code}: ${key} placeholders`);
    }
  }
  assert.equal(translateUi("zh-CN", "Unresolved future label"), "Unresolved future label");
  assert.equal(translateUi("zh-CN", "constructor"), "constructor");
});

test("rendered literal labels and textual placeholders go through localization, except product names", () => {
  const brands = new Set(["Savlivo", "Manual", "Premium", "PREMIUM", "Preview", "Autopilot"]);
  for (const node of nodes) {
    if (ts.isJsxText(node) && /[A-Za-z]/.test(node.text)) assert.ok(brands.has(node.text.trim()), node.text.trim());
    if (ts.isJsxAttribute(node) && ["placeholder", "accessibilityLabel"].includes(node.name.getText(ast)) && node.initializer && ts.isStringLiteral(node.initializer)) {
      assert.doesNotMatch(node.initializer.text, /[A-Za-z]/);
    }
  }
});

test("Chinese fixed AI and dynamic Home UI are translated without translating model or user text", () => {
  const welcome = "Hi — ask me general questions or get help with Savlivo, your subscriptions, prices and renewal dates. Subscription changes always stay under your control.";
  for (const {code} of appLanguages.filter(l => l.code !== "en")) assert.notEqual(translateUi(code, welcome), welcome);
  assert.match(translateUi("zh-CN", welcome), /一般问题/);
  assert.match(translateUi("zh-CN", 'Try “pause YouTube”, “cancel Prime” or ask for help...'), /试试/);
  assert.equal(translateUi("zh-CN", "{service} needs more information", {service:"Bilibili"}), "Bilibili需要补充信息");
  assert.equal(translateUi("zh-CN", "Change password"), "更改密码");
  assert.equal(translateUi("zh-CN", "Renewal date not set"), "未设置续订日期");
  assert.match(source, /message\.uiKey \? tr\(message\.uiKey\) : message\.text/);
  assert.match(source, /uiKey: "Hi — ask me general questions/);
  assert.match(source, /message\.uiKey \? appLocale\(selectedLanguage\) : undefined/);
  const name = "{fields} $&";
  assert.equal(translateUi("zh-CN", "{service} needs more information", {service:name}), name + "需要补充信息");
});

test("static welcome initialization never reads the language state before it exists", () => {
  const state = nodes.find(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === "[aiMessages, setAiMessages]")!;
  assert.ok(state);
  assert.doesNotMatch(state.getText(ast), /\btr\(/);
  assert.match(source, /aiMessages\.slice\(-10\)\.map\(\(\{role,text\}\)=>\(\{role,text\}\)\)/);
});

test("actual manual-entry handler clears stale catalog data and opens a form without saving", () => {
  const handler = nodes.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "beginManualService")!;
  const text = handler.getText(ast);
  const state: Record<string, unknown> = {};
  const setters = ["setEditingSubscriptionId","setServiceSlugInput","setCustomServiceName","setServiceSelectionLocked","setBillingProviderInput","setSubscriptionPlanInput","setMonthlyPriceInput","setRenewalDateInput","setShowRenewalDatePicker","setServicePickerOpen","setServiceFormOpen"];
  const refs = [{current:false},{current:0},{current:"US"},{current:"NO"},{current:"old-id"}];
  const start = new Function("saveServiceBusyRef","discoveryEpochRef","formMarketRef","selectedCountryCodeRef","editingSubscriptionIdRef","requireActivePlan", ...setters,
    ts.transpile(text, {target:ts.ScriptTarget.ES2022}) + "; return beginManualService;")(...refs, () => true, ...setters.map(key => (value:unknown) => {state[key] = value;}));
  start("LocalTV");
  assert.equal(state.setServiceSlugInput, "manual");
  assert.equal(state.setCustomServiceName, "LocalTV");
  assert.equal(state.setServiceFormOpen, true);
  for (const key of ["setBillingProviderInput","setSubscriptionPlanInput","setMonthlyPriceInput","setRenewalDateInput"]) assert.equal(state[key], "");
  assert.equal(refs[2].current, "NO");
  assert.doesNotMatch(text, /\bapi\(|netflix|saveServiceForm/);
});

test("actual paywall presentation survives StoreKit failure and identifies foreign storefront quotes", () => {
  const handler = nodes.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "savlivoPlanPrice")!;
  const display = (country:string, store:string|null, period:"monthly"|"annual") => new Function(
    "selectedCountryCode","billingPeriod","selectedLanguage","manualMonthlyPrice","manualAnnualPrice","premiumMonthlyPrice","premiumAnnualPrice","configuredSavlivoPrice","appLocale","tr",
    ts.transpile(handler.getText(ast), {target:ts.ScriptTarget.ES2022}) + "; return savlivoPlanPrice;")(
      country,period,"en",store,store,store,store,configuredSavlivoPrice,appLocale,(key:string)=>key);
  for (const period of ["monthly","annual"] as const) {
    assert.match(display("NO",null,period)("premium").display, period === "monthly" ? /49\.00/ : /399\.00/);
    const no = display("NO","$3.99",period)("premium");
    assert.match(no.display, /NOK/);
    assert.match(no.note, /App Store price: \$3\.99/);
    const cn = display("CN","$3.99",period)("premium");
    assert.equal(cn.note, "App Store price");
    assert.doesNotMatch(cn.display, /CNY|¥/);
    assert.equal(display("CN",null,period)("premium").display, "Price unavailable");
  }
});

test("actual market-switch handler never changes language or saved subscriptions", () => {
  const handler = nodes.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "selectCountry")!;
  assert.ok(handler);
  const text = handler.getText(ast);
  assert.doesNotMatch(text, /setSelectedLanguage|setItems|setAuthed|setToken/);
  const epoch = {current:0}; const market = {current:"NO"}; const calls: string[] = [];
  const setters = ["setAiGuidedAction","setServiceFormOpen","setSubscriptionPlanInput","setMonthlyPriceInput","setCustomServiceName","setCatalogQuery","setCatalogCategory","setPricingSnapshot","setSelectedCountryCode","setSelectedCountryName","setSelectedCurrency"];
  const js = ts.transpile(text, {target:ts.ScriptTarget.ES2022});
  const select = new Function("discoveryEpochRef", "selectedCountryCodeRef", ...setters, js + "; return selectCountry;")(
    epoch, market, ...setters.map(name => (_value: unknown) => calls.push(name)));
  for (const language of appLanguages) for (const [code, name, currency] of countryCurrencyData) {
    select(code, name, currency);
    assert.equal(market.current, code);
    assert.equal(appLanguages.find(l => l.code === language.code)?.code, language.code);
  }
  assert.ok(epoch.current > 0);
  assert.ok(calls.includes("setServiceFormOpen"));
  assert.doesNotMatch(source, /localLanguagesByMarket|setSelectedLanguage\("en"\)/);
});

test("configured US and Norway Savlivo prices have exact amounts; no other market is inferred", () => {
  for (const [country, currency, manual, premium] of [
    ["US","USD",[199,1999],[399,2999]], ["NO","NOK",[2900,24900],[4900,39900]]
  ] as const) {
    for (const language of appLanguages) for (const [plan, values] of [["manual",manual],["premium",premium]] as const) {
      for (const [i, period] of ["monthly","annual"].entries()) assert.equal(
        configuredSavlivoPrice(country, plan, period as "monthly"|"annual", appLocale(language.code)),
        formatMarketMinor(values[i], currency, appLocale(language.code)));
    }
  }
  for (const [country] of countryCurrencyData.filter(([cc]) => cc !== "US" && cc !== "NO")) assert.equal(configuredSavlivoPrice(country, "premium", "annual", "en"), null);
  assert.match(source, /const display = configured \?\? store/);
  assert.match(source, /The App Store confirms the final purchase price/);
  const billing = readFileSync(new URL("../src/billing.ts", import.meta.url), "utf8");
  assert.match(billing, /com\.thomashodne\.savlivo\.premium\.annual/);
  assert.doesNotMatch(billing, /premium\.yearly/);
});

test("language changes formatting only: market currency, hundredths and multi-country records survive", () => {
  const records = countryCurrencyData.map(([countryCode,,currency]) => ({id:countryCode,countryCode,currency,monthlyPriceMinor:12345}));
  const before = structuredClone(records);
  for (const {code} of appLanguages) for (const [country,,currency] of countryCurrencyData) {
    assert.deepEqual(subscriptionsForMarket(records, country).map(s => s.id), [country]);
    assert.equal(formatMarketMinor(12345, currency, appLocale(code)), new Intl.NumberFormat(appLocale(code), {style:"currency",currency,maximumFractionDigits:2}).format(123.45));
  }
  for (const currency of ["JPY","KRW","VND","IDR"]) assert.match(formatMarketMinor(12345, currency, "en"), /123\.45/);
  assert.deepEqual(records, before);
  assert.match(source, /formatMarketMinor\(minor, currency, appLocale\(selectedLanguage\)\)/);
});
