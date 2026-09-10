// Local offline measurement. Never contacts a database/provider or changes operational data.
// node --import tsx docs/catalog/global-47/build-management-audit.mjs
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {serviceCatalog,serviceBillingProviders,serviceAvailableInMarket,serviceEligibleForCatalog,catalogManagementEligibility} from '../../../packages/contracts/src/catalog.ts';
import {webEvidenceFor,catalogWebEvidence} from '../../../packages/contracts/src/catalog-web-management.ts';
import {countryCurrencyData} from '../../../packages/contracts/src/markets.ts';
import {verifiedProviderRegistry,fetchProviderLocalPrices} from '../../../services/api/src/pricing-adapters.ts';
const read=n=>JSON.parse(readFileSync(new URL(n,import.meta.url),'utf8'));
const baseline=read('management-baseline.json');
assert.deepEqual(serviceCatalog,baseline.catalog);
assert.deepEqual(serviceBillingProviders,baseline.billing);
assert.deepEqual(countryCurrencyData,baseline.markets.map(m=>[m.country,m.name,m.currency]));
globalThis.fetch=async()=>{throw new Error('Offline preservation audit');};
const stable=rows=>rows.map(({updatedAt,...r})=>JSON.stringify(r)).sort();
const unique=rows=>[...new Map(rows.map(r=>[[r.serviceSlug,r.planName,r.billingProviderSlug].join('|'),r])).values()];
const strong=r=>['registry','authoritative-provider'].includes(r.verification)||(r.verification==='multi-source'&&r.verifiedByAgreement&&r.sourceCount>=2);
const direct=r=>r.billingProviderSlug==='direct'&&!/apps\.apple\.com|play\.google\.com/.test(r.sourceUrl??'');
const statuses=['FULLY_VERIFIED','CATALOG_ELIGIBLE_PRICE_UNVERIFIED','NOT_CATALOG_ELIGIBLE','REVIEW_REQUIRED'];
const counts=rows=>Object.fromEntries(statuses.map(s=>[s,rows.filter(r=>r.classification===s).length]));
const pairs=[],markets=[];let registry=0,offline=0;
for(const old of baseline.markets){
 const prices=await fetchProviderLocalPrices(old.country,old.currency);
 assert.deepEqual(stable(prices),stable(old.prices),old.country+' offline outputs');
 assert.deepEqual(verifiedProviderRegistry[old.country]??[],old.registry,old.country+' registry');
 assert.deepEqual(serviceCatalog.filter(s=>serviceAvailableInMarket(s.slug,old.country)).map(s=>s.slug),old.services);
 registry+=old.registry.length;offline+=prices.length;
 const verified=unique(prices.filter(r=>strong(r)&&r.countryCode===old.country&&r.currency===old.currency));
 const local=serviceCatalog.map(s=>{
  const evidence=webEvidenceFor(s.slug,old.country);
  const relevant=old.services.includes(s.slug);
  const verifiedPrices=verified.filter(r=>r.serviceSlug===s.slug);
  const directPrices=verifiedPrices.filter(direct);
  return {countryCode:old.country,serviceSlug:s.slug,serviceName:s.name,previouslyOffered:relevant,
   classification:catalogManagementEligibility(s.slug,old.country,directPrices.length>0),eligible:serviceEligibleForCatalog(s.slug,old.country),
   startWeb:evidence?.startWeb??{status:'REVIEW_REQUIRED'},manageWeb:evidence?.manageWeb??{status:'REVIEW_REQUIRED'},cancelWeb:evidence?.cancelWeb??{status:'REVIEW_REQUIRED'},
   evidenceCheckedAt:evidence?.verifiedAt??null,scope:evidence?.scope??'No approved country-scoped provider web-flow evidence in this review',
   reason:!relevant?'Not previously offered in this market; no new availability asserted':!evidence?'Provider START_WEB and CANCEL_WEB completion evidence has not been established; existing account/homepage or store routes are insufficient':evidence.notes||'Provider documents direct website signup and cancellation; third-party billing excluded',
   verifiedDirectPlans:directPrices,channelPrices:verifiedPrices.filter(r=>!direct(r)),
   priceFreshness:'Retained verified snapshot; this web-flow review does not renew price verification dates. Unknown/weak and store-sourced direct rows excluded from direct KPI.'};
 });
 pairs.push(...local);
 const relevant=local.filter(r=>r.previouslyOffered),eligible=relevant.filter(r=>r.eligible);
 const fully=eligible.filter(r=>r.verifiedDirectPlans.length);
 const anyPrice=eligible.filter(r=>r.verifiedDirectPlans.length||r.channelPrices.length);
 markets.push({countryCode:old.country,name:old.name,currency:old.currency,selectable:true,previouslyOffered:relevant.length,
  eligible:eligible.length,...counts(relevant),verifiedDirectCoverage:eligible.length?Number((fully.length/eligible.length*100).toFixed(1)):null,
  totalChannelCoverage:eligible.length?Number((anyPrice.length/eligible.length*100).toFixed(1)):null,
  verifiedDirectPlanCount:eligible.reduce((n,r)=>n+r.verifiedDirectPlans.length,0),
  excluded:relevant.filter(r=>!r.eligible).map(r=>({serviceSlug:r.serviceSlug,reason:r.reason}))});
}
const relevant=pairs.filter(r=>r.previouslyOffered),eligible=relevant.filter(r=>r.eligible);
const report={reviewDate:'2026-09-10',head:baseline.head,canonicalServices:serviceCatalog.length,selectableMarkets:countryCurrencyData.length,
 matrixPairs:pairs.length,relevantPairs:relevant.length,matrixCounts:counts(pairs),relevantCounts:counts(relevant),eligiblePairs:eligible.length,
 verifiedDirectCoverage:Number((100*eligible.filter(r=>r.verifiedDirectPlans.length).length/eligible.length).toFixed(1)),
 totalChannelCoverage:Number((100*eligible.filter(r=>r.verifiedDirectPlans.length||r.channelPrices.length).length/eligible.length).toFixed(1)),
 preservation:{catalog:serviceCatalog.length,registryRows:registry,offlineResults:offline,billingChoices:'exact match',availability:'all 733 prior offerings preserved as availability facts'},
 methodology:'FULLY_VERIFIED uses retained verified direct price evidence, not a claim that prices were freshly checked today. All 3588 pairs classified; research coverage is incomplete and unproven pairs are explicitly REVIEW_REQUIRED. No unavailable claim inferred from missing evidence.',
 channelManagement:[{billingProvider:'apple',url:'https://apps.apple.com/account/subscriptions',evidence:'https://support.apple.com/en-us/118428'},{billingProvider:'google-play',url:'https://play.google.com/store/account/subscriptions',evidence:'https://support.google.com/googleplay/answer/7018481'}],
 markets,pairs};
writeFileSync(new URL('management-eligibility.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
let md='# New catalog web-management eligibility — 2026-09-10\n\nThis review supersedes earlier discovery counts, not historical availability/pricing facts. Saved/manual subscriptions and legacy writes are never filtered by eligibility. No service or market added. No migration required. Research is not complete: REVIEW_REQUIRED deliberately excludes unproven new choices, without claiming they are unavailable.\n\n';
md+=`Audited matrix: **${pairs.length}** pairs, **${serviceCatalog.length}** identities, **46** active markets. Relevant denominator: **${relevant.length}** previously offered combinations. Eligible: **${eligible.length}**. Relevant classifications: ${JSON.stringify(report.relevantCounts)}. Verified Direct Coverage: **${report.verifiedDirectCoverage}%**; Total Channel Coverage: **${report.totalChannelCoverage}%**. Full matrix counts: ${JSON.stringify(report.matrixCounts)}.\n\n`;
md+='FULLY_VERIFIED means verified start/cancel documentation plus **retained verified direct pricing**. It does not assert a fresh price check today. Existing verification/source-agreement checks apply; Apple/Google-source rows never count as direct. Channel coverage counts eligible combinations with any strong channel price. Zero eligible denominator is N/A. Price age/recheck limitations from the prior audit still apply.\n\n';
md+='|Market|Prior offerings|Eligible|Full/direct|Manual price|Not eligible|Review|Direct %|Any channel %|Direct plans|\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
for(const m of markets)md+=`|${m.countryCode}|${m.previouslyOffered}|${m.eligible}|${m.FULLY_VERIFIED}|${m.CATALOG_ELIGIBLE_PRICE_UNVERIFIED}|${m.NOT_CATALOG_ELIGIBLE}|${m.REVIEW_REQUIRED}|${m.verifiedDirectCoverage??'N/A'}|${m.totalChannelCoverage??'N/A'}|${m.verifiedDirectPlanCount}|\n`;
md+='\n## Evidence and scope\n\nProvider help documents are evidence of a supported flow, not proof of an authenticated physical-device transaction. Generic homepages alone were not accepted as management proof. Provider-wide web instructions are combined with existing explicit country scope; no future-market wildcard. Signup source may be a provider instruction page leading to checkout. Store/channel management does not qualify another provider’s direct flow. Apple Music/TV web purchases are first-party provider subscriptions.\n';
for(const e of catalogWebEvidence){md+=`\n### ${e.serviceSlug} — ${e.markets.join(', ')}\n\n${e.scope}. ${e.notes}\n\n`;for(const [label,f] of [['START',e.startWeb],['MANAGE',e.manageWeb],['CANCEL',e.cancelWeb]])md+=`- ${label}: ${f.status}; ${f.url?`[destination](${f.url})`:'no verified destination'}; ${f.evidenceUrl?`[provider evidence](${f.evidenceUrl})`:'no evidence'}. ${f.path??''}\n`;}
md+='\n## Exclusions from new selection, by market\n\nAll exclusions below are REVIEW_REQUIRED, not a finding that web cancellation is impossible. No NOT_CATALOG_ELIGIBLE finding is made without affirmative evidence.\n';
for(const m of markets){md+=`\n### ${m.countryCode}\n\n`;for(const e of m.excluded)md+=`- ${e.serviceSlug}: ${e.reason}\n`;if(!m.excluded.length)md+='None.\n';}
md+='\n## Operational boundaries / review decisions\n\n- Existing 46 markets and 13 languages remain. Kuwait remains blocked for KWD precision, unrelated to this check.\n- Price registry/adapters were not changed by this eligibility task. The offline script proves all 465 registry rows and 858 adapter outputs exactly preserved (ignoring observation timestamps only).\n- Existing provider routes win; verified direct web instruction/account destinations are only an additive fallback for services without an existing routing profile. No route is copied to Apple/Google/carrier/Amazon.\n- Existing clients may still submit canonical IDs: no new server write rejection was introduced, preserving Build 12 and saved-record edits. The rule applies to the updated picker/search and validated AI Add candidates.\n- Known but ineligible AI Add requests open a manual form with the canonical display name only. No plan, price, route or management identity is fabricated. The user still saves explicitly.\n- Some markets lose most local catalog choices pending provider-flow evidence; manual entry remains visible. Review the per-market exclusions before release. This is the requested fail-closed rule, not deletion of user data.\n- Sportsnet+/Crunchyroll full help content was inaccessible; SiriusXM Canada cancellation is plan-dependent; Vidio instructions did not clearly establish browser completion. They remain review-required.\n- Physical iPhone checks: browse/search eligible and excluded providers; manual fallback; saved excluded service edit/status/delete; Apple/Google route isolation; verified new provider flow and return without status mutation; switch market/language; selected-market PDF and AI. Do not complete purchases/cancellations merely to test navigation.\n\nSee management-validation.md for exact commands/results and change list.\n';
writeFileSync(new URL('management-eligibility.md',import.meta.url),md);
console.log(JSON.stringify({...report,markets:undefined,pairs:undefined,channelManagement:undefined},null,2));
