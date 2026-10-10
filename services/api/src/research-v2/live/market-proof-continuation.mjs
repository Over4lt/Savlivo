import fs from 'node:fs';
import {digest} from '../../research-v3/model.mjs';
// Planning only. Sources carried to the next interpreter are re-opened there;
// this controller cannot establish market applicability or pricing eligibility.
export const pendingMarketProof=t=>(t.marketProof?.objectives??[]).filter(o=>o.status==='MARKET_NOT_VERIFIED');
export const marketProofContradicted=t=>!!t.marketProof?.objectives?.length&&!pendingMarketProof(t).length&&t.marketProof.objectives.every(o=>o.status==='MARKET_CONTRADICTED');
function v3MarketObjective(t,truth,observation){
 const price=truth.prices?.[t.market];
 const need=truth.needs.find(row=>row.proposition==='TARGET_MARKET'&&row.market===t.market&&row.offerId===price?.id&&row.state==='UNRESOLVED');
 const established=['SERVICE_IDENTITY','PRICE_AMOUNT','CURRENCY','MONTHLY_SUBSCRIPTION','CONSUMER_SUBSCRIPTION'].every(key=>price?.propositions?.[key]?.state==='ESTABLISHED');
 if(!need||!established)return null;
 const identity={service:t.service,market:t.market,plan:price.id,amount:price.propositions.PRICE_AMOUNT.value,currency:price.propositions.CURRENCY.value,interval:'P1M',sourceHash:observation.sha256,sourceUrl:observation.url};
 return {key:digest(identity),identity,status:'MARKET_NOT_VERIFIED',missingFact:'MARKET_PROOF',established:['AUTHORITY','IDENTITY','COMMERCIAL_MEANING','VALUE_AND_CADENCE','PROVENANCE']};
}
export function pendingV3MarketProof(t,url=null){
 const truth=t.v3Truth,observation=t.v3Observation;if(t.marketProof?.meaning!=='V3_TRUTH_NEEDS_PLANNING_ONLY'||!truth||!Array.isArray(truth.needs)||!observation)return null;
 const expected=v3MarketObjective(t,truth,observation),actual=pendingMarketProof(t)[0],page=(t.reads??[]).find(row=>row.bodyHash===observation.sha256&&(row.url===observation.url||row.requestedUrl===observation.url));
 if(!expected||!actual||actual.key!==expected.key||JSON.stringify(actual.identity)!==JSON.stringify(expected.identity)||(url&&observation.url!==url)||page?.outcome!=='OK'||!page.accessDecisions?.length||page.accessDecisions.some(row=>!['ALLOWED','NO_ROBOTS_POLICY'].includes(row.decision)))return null;
 return actual;
}
export function acceptV3TruthNeeds(t,outcome){
 const truth=outcome?.v3Truth,observation=outcome?.v3Observation;
 if(!truth||!Array.isArray(truth.needs)||!observation||typeof observation.url!=='string'||!/^[a-f0-9]{64}$/.test(observation.sha256??''))return false;
 t.v3Truth=structuredClone(truth);t.v3Observation=structuredClone(observation);
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
