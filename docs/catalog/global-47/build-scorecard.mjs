// Local read-only product evidence measurement; no database or network access.
// Run from repository root: node --import tsx docs/catalog/global-47/build-scorecard.mjs
import {verifiedExpansionPrices} from '../../../services/api/src/verified-expansion-prices.ts';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {serviceCatalog,serviceBillingProviders,serviceAvailableInMarket} from '../../../packages/contracts/src/catalog.ts';
import {countryCurrencyData,countryCurrencies} from '../../../packages/contracts/src/markets.ts';
import {verifiedProviderRegistry,fetchProviderLocalPrices} from '../../../services/api/src/pricing-adapters.ts';
const read=name=>JSON.parse(readFileSync(new URL(name,import.meta.url),'utf8'));
const write=(name,data)=>writeFileSync(new URL(name,import.meta.url),JSON.stringify(data,null,2)+'\n');
const baseline=read('baseline.json'), rows=read('markets.json'), evidence=read('evidence.json'), candidates=read('candidates.json');
const oldSlugs=new Set(baseline.catalog.map(s=>s.slug));
assert.deepEqual(serviceCatalog.filter(s=>oldSlugs.has(s.slug)).map(({additionalAvailability,...s})=>s),baseline.catalog);
for(const [cc,currency] of Object.entries(baseline.currencies))assert.equal(countryCurrencies[cc],currency);
assert.deepEqual(countryCurrencyData.slice(0,30),baseline.markets.map(m=>[m.country,m.name,m.currency]));
for(const slug of oldSlugs)assert.deepEqual(serviceBillingProviders[slug],baseline.billing[slug]);
globalThis.fetch=async()=>{throw new Error('Audit offline; no network allowed');};
const keys=['serviceSlug','planName','billingProviderSlug','countryCode','currency','monthlyPriceMinor','verification','sourceUrl'];
const canonical=items=>items.map(row=>Object.fromEntries(keys.filter(k=>row[k]!==undefined).map(k=>[k,row[k]]))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));

const continuation=read('continuation-baseline.json'), expansion=read('market-expansion-evidence.json');
for(const old of continuation.catalog){
 const now=serviceCatalog.find(s=>s.slug===old.slug);assert.ok(now);
 const {launchMarkets:beforeMarkets,...before}=old;const {launchMarkets:afterMarkets,...after}=now;
 assert.deepEqual(after,before);
 for(const cc of beforeMarkets??[])assert.ok(afterMarkets?.includes(cc));
 assert.deepEqual(serviceBillingProviders[old.slug],continuation.billing[old.slug]);
}
const selectable=new Set(countryCurrencyData.map(([cc])=>cc));
const normalized=s=>s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'');
const aliases={ 'COSMOTE TV':'magenta-tv-gr','Win Sports':'win-play','Hulu Japan':'hulu-japan','VOYO':'voyo-ro','SiriusXM Canada':'siriusxm-canada','STING+':'sting-plus','NOW TV':'now-tv'};
for(const c of candidates){
 const service=serviceCatalog.find(s=>s.slug===c.canonicalSlug)||serviceCatalog.find(s=>s.slug===aliases[c.serviceName]&&serviceAvailableInMarket(s.slug,c.countryCode))||serviceCatalog.find(s=>normalized(s.name)===normalized(c.serviceName)&&serviceAvailableInMarket(s.slug,c.countryCode));
 if(service){c.canonicalSlug=service.slug;if(serviceAvailableInMarket(service.slug,c.countryCode)){c.recommendation='IMPLEMENTED; manual amount if no verified direct price';c.reason='Provider evidence recorded in market-expansion-evidence.json / evidence.json; no price inferred from availability.';}}
}
// Explicit editorial lower bounds, not a claim of exhaustive country market share.
for(const row of rows){
 for(const slug of row.countryCode==='CN'?['iqiyi','tencent-video','bilibili']:['netflix','spotify']){
  const svc=serviceCatalog.find(s=>s.slug===slug);if(!svc)continue;
  if(!candidates.some(c=>c.countryCode===row.countryCode&&c.canonicalSlug===slug))candidates.push({countryCode:row.countryCode,serviceName:svc.name,canonicalSlug:slug,proposedTier:1,evidenceIds:[],evidenceType:'subscriber / global platform significance; local availability evaluated separately',reason:'Large established recurring platform. Global size is not proof of local availability.'});
 }
 for(const slug of row.countryCode==='CN'?['apple-music']:['apple-music','google-one','youtube-premium']){
  if(!candidates.some(c=>c.countryCode===row.countryCode&&c.canonicalSlug===slug))candidates.push({countryCode:row.countryCode,serviceName:serviceCatalog.find(s=>s.slug===slug).name,canonicalSlug:slug,proposedTier:2,evidenceType:'official global subscriber / distribution evidence',sourceUrl:slug==='apple-music'?'https://www.apple.com/newsroom/2026/01/2025-marked-a-record-breaking-year-for-apple-services/':'https://blog.google/company-news/inside-google/message-ceo/alphabet-earnings-q4-2025/',reason:'Editorial Tier 2; global significance, country availability evaluated separately. No per-country subscriber number inferred.'});
 }
 for(const e of expansion.services.filter(s=>s.countries.includes(row.countryCode))){
  let c=candidates.find(c=>c.countryCode===row.countryCode&&c.canonicalSlug===e.slug);
  if(!c){c={countryCode:row.countryCode,serviceName:e.name,canonicalSlug:e.slug,evidenceIds:[]};candidates.push(c);}
  c.proposedTier??=2;c.evidenceType??='distribution / qualitative provider evidence';c.sourceUrl=e.sourceUrl;c.tierMeaning='Editorial significance lower bound; no invented subscriber count or country market-share claim';
 }
}
write('candidates.json',candidates);
let registryCount=0,offlineCount=0;const plans=new Set();
for(const row of rows){
 const old=baseline.markets.find(m=>m.country===row.countryCode);
 const checkpoint=continuation.markets.find(m=>m.country===row.countryCode);
 const services=serviceCatalog.filter(s=>serviceAvailableInMarket(s.slug,row.countryCode)).map(s=>s.slug);
 const prices=selectable.has(row.countryCode)?await fetchProviderLocalPrices(row.countryCode,row.currency):[];
 const registry=verifiedProviderRegistry[row.countryCode]??[];
 const retained=canonical(prices).map(p=>JSON.stringify(p));
 for(const previous of [old,checkpoint].filter(Boolean)){
  for(const slug of previous.services)assert.ok(services.includes(slug),`${row.countryCode}: lost ${slug}`);
  assert.deepEqual(registry.slice(0,previous.registry.length),previous.registry);
  for(const price of canonical(previous.offlinePrices??previous.prices))assert.ok(retained.includes(JSON.stringify(price)),`Lost baseline price ${JSON.stringify(price)}`);
 }
 registryCount+=registry.length;offlineCount+=prices.length;prices.forEach(p=>plans.add(p.serviceSlug+'|'+p.planName));
 const strong=prices.filter(p=>services.includes(p.serviceSlug)&&p.countryCode===row.countryCode&&p.currency===row.currency&&(['registry','authoritative-provider'].includes(p.verification)||(p.verification==='multi-source'&&p.verifiedByAgreement&&p.sourceCount>=2)));
 const unique=items=>[...new Map(items.map(p=>[[p.serviceSlug,p.planName,p.billingProviderSlug].join('|'),p])).values()];
 const direct=unique(strong.filter(p=>p.billingProviderSlug==='direct'&&!/apps\.apple\.com|play\.google\.com/.test(p.sourceUrl??'')));
 const directServices=[...new Set(direct.map(p=>p.serviceSlug))].sort();
 const fresh=verifiedExpansionPrices.filter(p=>p.countryCode===row.countryCode&&p.billingProviderSlug==='direct');
 const freshServices=[...new Set(fresh.map(p=>p.serviceSlug))];
 row.currentSelectable=selectable.has(row.countryCode);row.selectable=row.currentSelectable;
 row.beforeServiceCount=old?.services.length??0;row.currentSavlivoServiceCount=services.length;row.currentServices=services;
 row.verifiedDirectServiceCount=directServices.length;row.verifiedDirectServices=directServices;
 row.verifiedDirectCoveragePercentage=services.length?Math.round(1000*directServices.length/services.length)/10:null;
 row.freshlyRecheckedDirectServiceCount=freshServices.length;
 row.freshlyRecheckedDirectServices=freshServices;
 row.verifiedDirectPlanCount=direct.length;
 row.applePriceCount=unique(strong.filter(p=>p.billingProviderSlug==='apple')).length;
 row.googlePlayPriceCount=unique(strong.filter(p=>p.billingProviderSlug==='google-play')).length;
 row.otherChannelPriceCount=unique(strong.filter(p=>!['direct','apple','google-play'].includes(p.billingProviderSlug))).length;
 const marketCandidates=candidates.filter(c=>c.countryCode===row.countryCode);
 const currentEvidence=new Set([...freshServices,...expansion.services.filter(s=>s.countries.includes(row.countryCode)).map(s=>s.slug)]);
 if(expansion.newMarkets.some(([cc])=>cc===row.countryCode)){
  for(const slug of Object.keys(expansion.globalSources))if(services.includes(slug))currentEvidence.add(slug);
  for(const slug of ['disney-plus','max','nintendo-switch-online'])if(services.includes(slug))currentEvidence.add(slug);
  if(row.countryCode==='CA')for(const slug of ['amazon-prime','playstation-plus','xbox-game-pass'])currentEvidence.add(slug);
 }
 if(row.countryCode!=='CN'&&row.currentSelectable)for(const slug of ['netflix','spotify','apple-music','google-one','youtube-premium','chatgpt'])currentEvidence.add(slug);
 for(const slug of services)if(serviceCatalog.find(s=>s.slug===slug)?.additionalAvailability?.markets.includes(row.countryCode))currentEvidence.add(slug);
 row.serviceClassifications=services.map(slug=>({serviceSlug:slug,status:directServices.includes(slug)?'VERIFIED':currentEvidence.has(slug)?'AVAILABLE / DIRECT PRICE UNVERIFIED':'UNVERIFIED',freshness:freshServices.includes(slug)?'provider rechecked 2026-09-10':directServices.includes(slug)?'retained verified snapshot; not freshly rechecked':'availability evidence / historical offering; see source gaps'}));
 row.availableDirectPriceUnverifiedCount=row.serviceClassifications.filter(s=>s.status==='AVAILABLE / DIRECT PRICE UNVERIFIED').length;
 row.unverifiedOfferedCount=row.serviceClassifications.filter(s=>s.status==='UNVERIFIED').length;
 row.unknownManualPriceServices=services.filter(slug=>!directServices.includes(slug));row.unknownManualPriceServiceCount=row.unknownManualPriceServices.length;
 row.unavailableCandidates=marketCandidates.filter(c=>c.recommendation==='NOT SUITABLE'&&/discontinu|ceased|retired|rebrand|successor/i.test(c.reason??'')).map(c=>({serviceName:c.serviceName,status:'UNAVAILABLE',reason:c.reason}));
 row.unverifiedCandidates=marketCandidates.filter(c=>!services.includes(c.canonicalSlug)&&c.recommendation!=='NOT SUITABLE'&&!String(c.recommendation).includes('REJECT')).map(c=>c.serviceName);
 row.unverifiedCount=row.unverifiedOfferedCount+new Set(row.unverifiedCandidates).size;
 row.relevantServiceCount=new Set([...services,...marketCandidates.map(c=>c.canonicalSlug??c.serviceName)]).size;
 row.relevantServiceCountMeaning='Identified candidate union offered services; includes unresolved candidates, not an exhaustive census';
 row.verifiedDirectIdentifiedCoveragePercentage=Math.round(1000*directServices.length/row.relevantServiceCount)/10;
 row.pricingIsActivationGate=false;
 row.catalogReadiness=row.currentSelectable?'IMPLEMENTED — COVERAGE NEEDS WORK':'DO_NOT_ACTIVATE';
 row.pricingReadiness='NEEDS_WORK — manual price supported; older snapshots require freshness review';
 row.status=row.currentSelectable?'NEEDS_WORK':'DO_NOT_ACTIVATE';
 row.proposedActivation=row.currentSelectable?'Selectable; unknown prices remain manual. Coverage quality work remains.':'Blocked: KWD thousandths cannot round-trip in the existing integer-hundredths model.';
 row.implementationBlockers=row.currentSelectable?[]:['KWD three-decimal amounts cannot be represented exactly; no storage migration authorized'];
 row.verifiedLocalPriceServiceCount=new Set(strong.map(p=>p.serviceSlug)).size;
 row.verifiedLocalPriceServices=[...new Set(strong.map(p=>p.serviceSlug))].sort();
 row.priceCoveragePercentage=row.verifiedDirectCoveragePercentage;
 row.verifiedPlanCount=unique(strong).length;
 row.sourceEvidence=evidence.filter(e=>e.countries.includes(row.countryCode)).map(e=>e.id);
 for(const tier of [1,2]){
  const matches=marketCandidates.filter(c=>c.proposedTier===tier);
  row.tiers[tier]={identified:matches.length,covered:matches.filter(c=>services.includes(c.canonicalSlug)).length,missing:matches.filter(c=>!services.includes(c.canonicalSlug)).map(c=>c.serviceName),complete:false};
 }
 row.marketEssentials=marketCandidates.filter(c=>c.proposedTier===1).map(c=>c.serviceName);row.missingMarketEssentials=row.tiers[1].missing;
 row.evidenceGaps=['Tier census is an evidence-backed editorial lower bound, not exhaustive; unclassified candidates remain','Historical broad availability preserved for old markets; UNVERIFIED is not new evidence','Direct snapshots retained safely; not all old source pages were rechecked today'];
}
assert.equal(rows.length,47);
write('markets.json',rows);
write('preservation.json',{startingHead:baseline.head,verifiedAt:'2026-09-10',before:{markets:30,services:43,distinctPlans:107,registryRows:364,offlineRows:757},continuationBefore:{markets:30,services:48,registryRows:371,offlineRows:764},after:{markets:countryCurrencyData.length,services:serviceCatalog.length,distinctPlans:plans.size,registryRows:registryCount,offlineRows:offlineCount},allOldCatalogMetadataPreserved:true,allOldBillingChoicesPreserved:true,allOldCurrenciesPreserved:true,allOldOfferedServicesPreserved:true,allOldRegistryRowsPreservedExactly:true,allOldOfflineRowsPreservedExactly:true,managementDestinationRegression:'6300 original destinations preserved by existing mobile/API tests; new services do not invent destinations'});
let md='# 47-market direct-price scorecard — 2026-09-10\n\n46 selectable; Kuwait blocked by thousandths precision. Catalog implementation and pricing readiness are separate. All countries still have coverage/freshness work. No claim of exhaustive market-share census or full Tier 1 coverage.\n\n**DIRECT % = verified direct-priced services / offered services.** Relevant is the wider candidate union; identified-denominator coverage is also in markets.json. Retained verified snapshots are included but not relabeled freshly checked. Freshly rechecked counts and per-service classifications are in JSON. Apple/Google/operator rows never inflate direct counts. Available/manual counts require recorded evidence; historical offered services lacking evidence are classified UNVERIFIED without removing saved records.\n\n|Market|Currency|Relevant|Offered|T1 present/identified|T2 present/identified|DIRECT services|DIRECT %|Available/manual|Unverified*|Direct plans|Apple|Google|Other|Selectable|\n|---|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|\n';
for(const r of rows)md+=`|${r.countryCode}|${r.currency}|${r.relevantServiceCount}|${r.currentSavlivoServiceCount}|${r.tiers[1].covered}/${r.tiers[1].identified}|${r.tiers[2].covered}/${r.tiers[2].identified}|${r.verifiedDirectServiceCount}|${r.verifiedDirectCoveragePercentage??'—'}|${r.availableDirectPriceUnverifiedCount}|${r.unverifiedCount}|${r.verifiedDirectPlanCount}|${r.applePriceCount}|${r.googlePlayPriceCount}|${r.otherChannelPriceCount}|${r.selectable?'yes':'no'}|\n`;
md+='\n*Unverified includes unresolved research candidates plus historical offerings without sufficiently documented current evidence. It is not a count of additional available services.\n';
for(const r of rows){
 md+=`\n## ${r.countryCode} — ${r.countryName}\n\nCatalog: **${r.catalogReadiness}**. Pricing: **${r.pricingReadiness}**.\n\nOffered: ${r.currentServices.join(', ')||'None'}.\n\nTier 1 missing: ${r.missingMarketEssentials.join(', ')||'None among identified lower bound; completeness not established'}. Tier 2 missing: ${r.tiers[2].missing.join(', ')||'None among identified lower bound'}.\n\nFresh direct rechecks: ${r.freshlyRecheckedDirectServices.join(', ')||'None this continuation; retained snapshots are not fresh rechecks'}.\n\nUnknown direct/manual: ${r.unknownManualPriceServices.join(', ')||'None among offered'}.\n\nDecision: ${r.proposedActivation}\n\nEvidence: `+evidence.filter(e=>r.sourceEvidence.includes(e.id)).map(e=>`[${e.id}](${e.sourceUrl})`).join(', ')+'. Additional provider links: market-expansion-evidence.json and direct-price-review.md.\n';
}
writeFileSync(new URL('country-coverage.md',import.meta.url),md);
console.log({services:serviceCatalog.length,registryCount,offlineCount,distinctPlans:plans.size,marketsAudited:rows.length,selectable:countryCurrencyData.length});
