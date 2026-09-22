#!/usr/bin/env node
// Candidate admission is independent of evidence. This CLI performs no live work.
import '../../../../services/api/src/research-v2/offline-replay/offline-guard.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {serviceCatalog, catalogCategories} from '../../../../packages/contracts/src/catalog.ts';
import {countryCurrencyData} from '../../../../packages/contracts/src/markets.ts';
import {hash, norm, slug} from '../../../../services/api/src/research-v2/inventory/candidate-universe.mjs';

export const output = 'docs/catalog/global-47/research-v2/v15-discovery-20260921';
const baselinePath = '.savlivo/research-v2/universe-expansion/login-manage-full-catalog-live-20260920/after-catalog.json';
const historicalPath = 'docs/catalog/service-audit.json';
const shadowPath = '.savlivo/research-v2/universe-expansion/preflight-20260918T224000/expanded-service-universe.json';
const read = p => JSON.parse(fs.readFileSync(p,'utf8'));
const marketLabels = {'':[],Germany:['DE'],US:['US'],Brazil:['BR'],Japan:['JP'],'South Korea':['KR'],France:['FR'],India:['IN'],Australia:['AU'],Austria:['AT'],Portugal:['PT'],GB:['GB'],Ireland:['IE'],Canada:['CA'],'US/CA/GB/DE/AU':['US','CA','GB','DE','AU'],'US/GB/AU + others':['US','GB','AU'],'Spain / multi-market':['ES'],'China / multi-market':['CN'],'India / multi-market':['IN'],'Multi-market':[],Argentina:[]};
export function cliMode(args) {
  if(args.length !== 1 || !['--prepare','--check'].includes(args[0])) throw Error('OFFLINE_ONLY: use --prepare or --check. Full-online launch remains blocked by the current engine contract, not candidate admission.');
  return args[0];
}
function category(row) {
  if (/News|information|Finance\/news/.test(row.Category)) return 'news';
  if (/Audio/.test(row.Category)) return 'music-audio';
  if (/Gaming/.test(row.Category)) return 'gaming';
  if (/Streaming/.test(row.Category)) return 'video';
  if (/cloud|File transfer/.test(row.Category)) return 'cloud';
  return 'other';
}
export function validateCohort(manifest,candidates,baseline) {
  const ids=candidates.map(c=>c.slug),old=new Set(baseline.map(c=>c.service));
  if(!ids.length||new Set(ids).size!==ids.length) throw Error('EMPTY_OR_DUPLICATE_COHORT');
  if(ids.some(id=>old.has(id))) throw Error('BASELINE_SERVICE_IN_NEW_COHORT');
  if(JSON.stringify(ids)!==JSON.stringify(manifest.serviceIds)||manifest.expectedServices!==ids.length) throw Error('COHORT_MISMATCH');
  const aliases=new Map(),markets=new Set(countryCurrencyData.map(([m])=>m));
  for(const c of candidates) {
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(c.slug)) throw Error('INVALID_SLUG');
    if(!c.categories.every(x=>catalogCategories.some(y=>y.id===x))) throw Error('INVALID_CATEGORY');
    if(c.launchMarkets.length||c.markets.some(m=>!markets.has(m))) throw Error('UNPROVEN_AVAILABILITY');
    for(const a of [c.slug,c.name,...c.aliases]) {
      const key=norm(a);
      if(aliases.has(key)&&aliases.get(key)!==c.slug) throw Error('ALIAS_COLLISION');
      aliases.set(key,c.slug);
    }
    if(c.productionEligible!==false||c.urls.length||c.authorities.length) throw Error('UNSUPPORTED_RESEARCH_FACT');
  }
  return true;
}
export function prepare({write=false}={}) {
  const input=read(output+'/discovery-input.json'),reviews=read(output+'/full-identity-decisions.json');
  const baseline=read(baselinePath),historical=read(historicalPath).services,shadow=read(shadowPath);
  if(input.mainSheet!=='V15 Gate'||input.rows.length!==215||baseline.length!==275) throw Error('INPUT_BASELINE_CHANGED_RECONCILE');
  const existing=[...serviceCatalog,...historical,...shadow.new_include,...shadow.research,...shadow.exclude];
  const baselineKeys=new Map();
  for(const b of baseline) {
    const matches=existing.filter(e=>e.slug===b.service);
    for(const k of [b.service,b.name,...matches.flatMap(e=>[e.name,...(e.aliases??[])])].filter(Boolean)) {
      const key=norm(k);if(!baselineKeys.has(key))baselineKeys.set(key,new Set());baselineKeys.get(key).add(b.service);
    }
  }
  // Supplementary weak-evidence/low-scale rows are not rejected on those grounds.
  const sideRows=input.sidepoolRows.map(r=>({...r,'Provider / Product':r.Provider,'Gate Status':r.Status,'Scale Evidence / Rationale':r.Reason,Market:'',Category:'','Primary Source URL':'',Priority:null}));
  const rows=[...input.rows,...sideRows],decisions=[],candidates=[],byKey=new Map();
  for(const row of rows) {
    const name=row['Provider / Product'],status=row['Gate Status'],review=reviews.find(r=>r.name===name);
    const source={sheet:row.sheet,row:row.sheetRow,inputService:name,reference:row['Primary Source URL']||null};
    const base={name,sheet:row.sheet,sheetRow:row.sheetRow,inputStatus:status};
    const literalBaseline=baseline.filter(b=>b.name===name||b.service===name);
    const hits=literalBaseline.length===1?[literalBaseline[0].service]:[...(baselineKeys.get(norm(name))??[])];
    if(hits.length>1) throw Error('AMBIGUOUS_BASELINE_IDENTITY:'+name);
    if(hits.length===1) {decisions.push({...base,disposition:'ALREADY_COVERED',canonicalId:hits[0],reason:'Repository canonical name/ID/alias match in established 275.'});continue;}
    if(status==='ALREADY COVERED') throw Error('UNCONFIRMED_BASELINE_CLAIM:'+name);
    if(row.sheet==='Sidepool-Rejects'&&status.includes('SIDEPOOL')) {decisions.push({...base,disposition:'SIDEPOOL',canonicalId:null,reason:row.Reason});continue;}
    if(row.sheet==='Sidepool-Rejects'&&status==='REJECT') {decisions.push({...base,disposition:'CLEAR_REJECT',canonicalId:null,reason:row.Reason});continue;}
    if(review?.action==='MERGE_INTO_RESEARCH_FAMILY') {decisions.push({...base,disposition:'MERGE',canonicalId:null,parent:review.parent,reason:review.reason,source});continue;}
    const exact=existing.filter(e=>[e.slug,e.name,...(e.aliases??[])].filter(Boolean).some(v=>norm(v)===norm(name)));
    const exactIds=[...new Set(exact.map(e=>e.slug))];
    const id=review?.canonicalId??(exactIds.length===1?exactIds[0]:slug(name));
    if(exactIds.length>1&&!review?.canonicalId) throw Error('HISTORICAL_IDENTITY_REVIEW_REQUIRED:'+name);
    if(review?.canonicalId&&!existing.some(e=>e.slug===id))throw Error('REVIEW_IDENTITY_MISSING:'+name);
    if(baseline.some(b=>b.service===id))throw Error('BASELINE_ID_COLLISION:'+name);
    const prior=byKey.get(norm(name))??candidates.find(c=>c.slug===id);
    if(prior) {prior.references.push(source);decisions.push({...base,disposition:'DUPLICATE',canonicalId:prior.slug,reason:'Same exact canonical candidate identity.'});continue;}
    if(!(row.Market in marketLabels))throw Error('UNREVIEWED_MARKET_LABEL:'+row.Market);
    const family=reviews.some(r=>r.parent===name),identityReview=status==='IDENTITY REVIEW'||family||/product.family|bundle|mixed|holdings|Group/i.test(name+' '+row['Scale Evidence / Rationale']);
    const matched=existing.find(e=>e.slug===id),aliases=[...(matched?.aliases??[])];
    const c={slug:id,name:matched?.name??name,aliases,categories:matched?.categories??[category(row)],legacyGroup:row.Category||'Unclassified research candidate',
      category:category(row),disposition:identityReview?'RESEARCH':'NEW_INCLUDE',productionEligible:false,
      launchMarkets:[],markets:marketLabels[row.Market],marketStatus:'PLAUSIBLE_RESEARCH_MARKET',marketApplicabilityEstablished:false,
      urls:[],authorities:[],references:[source],
      researchInput:{priority:row.Priority,gateStatus:status,marketLabel:row.Market,categoryLabel:row.Category||null,scaleClaim:row['Scale Evidence / Rationale'],sourceUrl:row['Primary Source URL']||null,sourceIsVerifiedProviderEvidence:false,identityReviewRequired:identityReview,productFamilyMembers:[],historicalIdentityReused:!!matched}};
    candidates.push(c);byKey.set(norm(name),c);
    decisions.push({...base,disposition:'INCLUDE',canonicalId:id,identityResearchRequired:identityReview,historicalIdentityReused:!!matched,reason:review?.reason??'Potential consumer subscription/membership admitted for V2 investigation. Missing evidence is not an exclusion.'});
  }
  for(const d of decisions.filter(d=>d.disposition==='MERGE')) {
    const parent=byKey.get(norm(d.parent));if(!parent)throw Error('MERGE_PARENT_NOT_IN_COHORT:'+d.parent);
    d.canonicalId=parent.slug;parent.references.push(d.source);parent.researchInput.productFamilyMembers.push(d.name);
  }
  candidates.sort((a,b)=>a.slug.localeCompare(b.slug));
  const targets=candidates.flatMap(s=>s.markets.map(market=>({id:'v2-'+hash(s.slug+'|'+market).slice(0,24),service:s.slug,serviceName:s.name,category:s.category,market,scope:s.disposition,marketStatus:'PLAUSIBLE_RESEARCH_MARKET',marketApplicabilityEstablished:false,currency:null,urls:[],authorities:[],provenance:s.references})));
  const dependencies=[baselinePath,historicalPath,shadowPath,'packages/contracts/src/catalog.ts','packages/contracts/src/markets.ts','docs/catalog/global-47/research-v2/prepare-v15-new-services.mjs',output+'/discovery-input.json',output+'/full-identity-decisions.json'];
  const funnel={consolidatedDiscoveryRows:input.rows.length,supplementaryDispositionRows:sideRows.length,totalRowsConsidered:rows.length,existing275MatchesRemoved:decisions.filter(d=>d.disposition==='ALREADY_COVERED').length,candidateDuplicatesRemoved:decisions.filter(d=>d.disposition==='DUPLICATE').length,productFamilyRowsMerged:decisions.filter(d=>d.disposition==='MERGE').length,clearRejectsRemoved:decisions.filter(d=>d.disposition==='CLEAR_REJECT').length,sidepoolExcluded:decisions.filter(d=>d.disposition==='SIDEPOOL').length,aliasesResolved:decisions.filter(d=>d.disposition==='INCLUDE'&&d.historicalIdentityReused&&candidates.find(c=>c.slug===d.canonicalId)?.name!==d.name).length,historicalIdentitiesReused:decisions.filter(d=>d.disposition==='INCLUDE'&&d.historicalIdentityReused).length,identityResearchCandidates:candidates.filter(c=>c.researchInput.identityReviewRequired).length,identityBlockedCandidates:0,finalCohort:candidates.length};
  const manifest={version:1,authorityBootstrap:1,scope:'NEW_SERVICES_ONLY',status:'READY_FOR_FULL_V2_CONTROLLER',liveExecutable:true,liveReady:true,runtimePreflightRequired:true,production:false,
    sourceSheet:input.mainSheet,workbookSha256:input.sha256,expectedServices:candidates.length,serviceIds:candidates.map(c=>c.slug),
    excludedBaselineServiceIds:baseline.map(c=>c.service).sort(),inputHashes:Object.fromEntries(dependencies.map(p=>[p,hash(fs.readFileSync(p))])),
    requestedDimensions:['identity','subscription qualification','markets','login','management','cancellation','pricing','evidence','V2 readiness'],
    candidateAdmissionComplete:true,evidenceCompletenessRequiredForAdmission:false,
    blockers:[],
    controller:{version:1,entrypoint:'docs/catalog/global-47/research-v2/run-v15-full-v2.mjs',serviceLevelBootstrap:true,stages:['IDENTITY_SUBSCRIPTION','MARKETS','LOGIN','MANAGEMENT','CANCELLATION','PRICING','VALIDATION'],unknownEvidenceRemainsUnresolved:true,automaticAuthorityGrants:false},
    launchCommand:'node --import tsx docs/catalog/global-47/research-v2/run-v15-full-v2.mjs --live',networkCallsDuringPreparation:0};
  validateCohort(manifest,candidates,baseline);
  const artifacts={'manifest.json':manifest,'candidate-reconciliation.json':decisions,'funnel.json':funnel,
    'service-cohort.json':candidates.map(c=>({service:c.slug,serviceName:c.name,scope:c.disposition,marketScope:c.markets,marketApplicabilityEstablished:false,references:c.references})),
    'expanded-service-universe.json':{version:'V2_ADDITIVE_CANDIDATES_V1',marketAuthority:'packages/contracts/src/markets.ts#countryCurrencyData',existing:baseline,new_include:candidates.filter(c=>c.disposition==='NEW_INCLUDE'),research:candidates.filter(c=>c.disposition==='RESEARCH'),exclude:[]},
    'new-service-market-targets.json':targets,
    'base-targets.json':targets,
    'reviewed-provider-bindings.json':{schemaVersion:1,scope:'SHADOW_RESEARCH_ONLY',bindings:[]},
    'launch-targets.json':[],
    'blocked-targets.json':targets.map(t=>({targetId:t.id,service:t.service,market:t.market,status:'BLOCKED_PROVIDER_AUTHORITY',retryable:true,reason:'No reviewed ownership binding applicable to this target; retry after a new reviewed preflight, never by disabling the gate.'})),
    'overnight-preflight-summary.json':{version:1,status:'NO_GO',baseline:{services:baseline.length},expansion:{inputCandidates:rows.length,newServices:candidates.length,newTargets:targets.length},funnel,blockers:[{code:'USE_FULL_V2_CONTROLLER',reason:'Legacy price-only runner is intentionally disabled for this service-level cohort. Use manifest.launchCommand, which researches all 188 services.'}],launchCommand:null,network:0}};
  manifest.outputHashes=Object.fromEntries(Object.entries(artifacts).filter(([name])=>name!=='manifest.json').map(([name,value])=>[name,hash(JSON.stringify(value,null,2)+'\n')]));
  if(write)for(const [name,value]of Object.entries(artifacts))fs.writeFileSync(output+'/'+name,JSON.stringify(value,null,2)+'\n');
  else for(const [name,value]of Object.entries(artifacts))if(JSON.stringify(read(output+'/'+name))!==JSON.stringify(value))throw Error('STALE_PREPARATION:'+name);
  return {...funnel,explicitResearchMarketTargets:targets.length,liveReady:true,runtimePreflightRequired:true,network:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)console.log(JSON.stringify(prepare({write:cliMode(process.argv.slice(2))==='--prepare'}),null,2));
