import fs from 'node:fs';
import {digest,normalizeUrl} from '../../research-v3/model.mjs';
// Planning only. Sources carried to the next interpreter are re-opened there;
// this controller cannot establish market applicability or pricing eligibility.
export const pendingMarketProof=t=>(t.marketProof?.objectives??[]).filter(o=>o.status==='MARKET_NOT_VERIFIED');
export const marketProofContradicted=t=>!!t.marketProof?.objectives?.length&&!pendingMarketProof(t).length&&t.marketProof.objectives.every(o=>o.status==='MARKET_CONTRADICTED');
function exactProjectedMarketOwner(t,objective,sourceUrl,sourceHash){
 if(t.marketProof?.meaning!=='PLANNING_ONLY_REOPEN_SOURCES_FOR_VERIFICATION')return false;
 const identity=objective?.identity,authorityHost=new URL(sourceUrl).hostname;
 if(identity?.service!==t.service||identity?.market!==t.market||!identity.plan||!(Number(identity.amount)>0)||!identity.currency||!identity.interval||objective.key!==digest(JSON.stringify(identity)))return false;
 const source=(t.marketProof.sources??[]).find(row=>row.sha256===sourceHash),occurrence=source?.occurrences?.find(row=>row.service===t.service&&row.market===t.market&&row.taskId===t.id&&normalizeUrl(row.url)===sourceUrl);
 const authority=occurrence?.authority;
 return authority?.status==='CONFIGURED_REVIEWED'&&authority.hostname===authorityHost&&authority.provider===t.serviceName&&/^OFFICIAL_/.test(authority.sourceType??'')&&normalizeUrl(authority.sourceUrl)===sourceUrl;
}
function v3MarketObjective(t,truth,observation){
 const price=truth.prices?.[t.market];
 const need=truth.needs.find(row=>row.proposition==='TARGET_MARKET'&&row.market===t.market&&row.offerId===price?.id&&row.state==='UNRESOLVED');
 const established=['SERVICE_IDENTITY','PRICE_AMOUNT','CURRENCY','MONTHLY_SUBSCRIPTION','CONSUMER_SUBSCRIPTION'].every(key=>price?.propositions?.[key]?.state==='ESTABLISHED');
 if(!need||!established)return null;
 const identity={service:t.service,market:t.market,plan:price.id,amount:price.propositions.PRICE_AMOUNT.value,currency:price.propositions.CURRENCY.value,interval:'P1M',sourceHash:observation.sha256,sourceUrl:observation.url};
 return {key:digest(identity),identity,status:'MARKET_NOT_VERIFIED',missingFact:'MARKET_PROOF',established:['AUTHORITY','IDENTITY','COMMERCIAL_MEANING','VALUE_AND_CADENCE','PROVENANCE']};
}
export function pendingV3MarketProof(t,url=null){
 if(!['V3_TRUTH_NEEDS_PLANNING_ONLY','PLANNING_ONLY_REOPEN_SOURCES_FOR_VERIFICATION'].includes(t.marketProof?.meaning))return null;
 const requested=url&&normalizeUrl(url),actual=pendingMarketProof(t).find(row=>{const source=normalizeUrl(row.identity?.sourceUrl);return source&&(!requested||source===requested);});
 const sourceUrl=normalizeUrl(actual?.identity?.sourceUrl),sourceHash=actual?.identity?.sourceHash;if(!actual||!sourceUrl||!/^[a-f0-9]{64}$/.test(sourceHash??''))return null;
 const rows=[...(t.providerInterpretations??[]),{v3Truth:t.v3Truth,v3Observation:t.v3Observation}],owner=rows.find(row=>{const observation=row?.v3Observation;return row?.v3Truth&&Array.isArray(row.v3Truth.needs)&&observation?.kind==='PROVIDER'&&normalizeUrl(observation.url)===sourceUrl&&observation.sha256===sourceHash;});
 if(!owner)return null;
 const truth=owner.v3Truth,observation=owner.v3Observation,page=(t.reads??[]).find(row=>row.bodyHash===sourceHash&&(normalizeUrl(row.url)===sourceUrl||normalizeUrl(row.requestedUrl)===sourceUrl));
 if(page?.outcome!=='OK'||normalizeUrl(page.requestedUrl??page.url)!==sourceUrl||normalizeUrl(page.url??page.requestedUrl)!==sourceUrl||!page.accessDecisions?.length||page.accessDecisions.some(row=>!['ALLOWED','NO_ROBOTS_POLICY'].includes(row.decision)))return null;
 if(t.marketProof.meaning==='V3_TRUTH_NEEDS_PLANNING_ONLY'){
  const expected=v3MarketObjective(t,truth,observation);if(!expected||actual.key!==expected.key||JSON.stringify(actual.identity)!==JSON.stringify(expected.identity))return null;
 }else if(!exactProjectedMarketOwner(t,actual,sourceUrl,sourceHash))return null;
 return actual;
}
export function acceptV3TruthNeeds(t,outcome){
 const truth=outcome?.v3Truth,observation=outcome?.v3Observation;
 if(!truth||!Array.isArray(truth.needs)||!observation||typeof observation.url!=='string'||!/^[a-f0-9]{64}$/.test(observation.sha256??''))return false;
 t.v3Truth=structuredClone(truth);t.v3Observation=structuredClone(observation);if(outcome.v3Catalog)t.v3Catalog=structuredClone(outcome.v3Catalog);
 const suggested=(outcome.v3SuggestedCandidates??[]).filter(row=>row?.provenance==='V3_SOURCE_RESEARCH'&&Number.isFinite(row.amount)&&row.amount>0&&/^[A-Z]{3}$/.test(row.currency??'')&&row.paymentCadence==='MONTHLY_RECURRING'&&row.researchEvidence?.acquired===true&&row.researchEvidence.sourceBound===true&&row.researchEvidence.amountBasis==='EXPLICIT'&&row.researchEvidence.cadence==='MONTHLY_RECURRING'&&row.researchEvidence.priceRole==='ORDINARY_RECURRING'&&row.researchEvidence.sourceOwnership==='FIRST_PARTY'&&row.researchEvidence.observationId===observation.id&&row.sourceHash===observation.sha256&&normalizeUrl(row.sourceUrl)===normalizeUrl(observation.url));
 if(suggested.length){
  const rows=[...(t.v3SuggestedCandidates??[]),...suggested].map(row=>structuredClone(row)),seen=new Set();
  t.v3SuggestedCandidates=rows.filter(row=>{const key=digest(row);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,128);
 }
 if(outcome.v3ResearchLineage)t.v3ResearchLineage=structuredClone(outcome.v3ResearchLineage);
 const objective=v3MarketObjective(t,truth,observation);if(!objective){if(truth.prices?.[t.market]?.propositions?.TARGET_MARKET?.state==='ESTABLISHED')delete t.marketProof;return true;}
 t.marketProof={version:1,objectives:[objective],sources:[],leads:[],meaning:'V3_TRUTH_NEEDS_PLANNING_ONLY'};
 return true;
}
export function acceptMarketResearch(t,outcome,add){
 const dir=outcome?.runDirectory;if(!dir||!fs.existsSync(dir))return;
 const latest=fs.readdirSync(dir).filter(n=>/^interpretation-\d+$/.test(n)).sort().at(-1),file=latest&&dir+'/'+latest+'/market-proof-research.json';
 if(!file||!fs.existsSync(file)||fs.statSync(file).size>2097152)return;
 const next=JSON.parse(fs.readFileSync(file)).targets?.[t.id];if(!next||next.version!==1||next.sources?.length>8||next.objectives?.length>16||next.leads?.length>16)return;
 // A failed/empty interpretation cannot erase an existing unresolved objective.
 if(!next.objectives?.length)return;
 t.marketProof=next;
 for(const l of next.leads??[])add({...l,title:l.label,rank:0,marketProofHint:true,from:{sourceHash:l.sourceHash,path:l.path},navigationOnly:true});
}
