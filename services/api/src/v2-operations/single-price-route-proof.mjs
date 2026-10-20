// Routing-only proof for a completed known-service research result. This does
// not enter retained Verified reconciliation or create a new admission path.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {safePath} from './artifacts.mjs';
import {readMarketRunRecords} from '../research-v1/market-run-store.mjs';
import {originalAcquisitionTime} from './verified-reconciliation-v1.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inside=(root,value)=>{const base=fs.realpathSync(root),file=fs.realpathSync(value);if(!file.startsWith(base+path.sep))throw Error('PRICING_ROUTE_PROOF_PATH');return file;};
const readJson=file=>{if(fs.statSync(file).size>16_000_000)throw Error('PRICING_ROUTE_PROOF_BOUND');return JSON.parse(fs.readFileSync(file,'utf8'));};

export function loadSinglePriceRouteProof({jobRoot,jobId,service,market,sourceHash}){
 if(!/^[a-f0-9-]{36}$/.test(jobId??'')||!/^[a-z0-9][a-z0-9-]{0,159}$/.test(service??'')||!/^[A-Z]{2}$/.test(market??'')||!/^[a-f0-9]{64}$/.test(sourceHash??''))throw Error('PRICING_ROUTE_PROOF_SELECTOR');
 const job=readJson(safePath(jobRoot,'operation.json'));
 if(job.id!==jobId||job.config?.objective!=='PRICE_RESEARCH'||job.config?.targetKind!=='KNOWN_SERVICE'||job.config?.serviceId!==service||job.config?.market!==market)throw Error('PRICING_ROUTE_PROOF_JOB');
 const targetId=`price-research:${service}:${market}`,matches=[];
 for(const checkpoint of ['priority-research-links','known-service','known-service-v3-verification-retry-1']){
  const file=safePath(jobRoot,checkpoint+'/adaptive-state.json');if(!fs.existsSync(file))continue;
  const target=readJson(file).targets?.[targetId];if(!target)continue;
  if(target.id!==targetId||target.service!==service||target.market!==market)throw Error('PRICING_ROUTE_PROOF_TARGET');
  for(const outcome of target.acquisitionOutcomes??[])if(outcome.sourceHash===sourceHash&&outcome.countryV3Evaluation?.status==='EVALUATED')matches.push({checkpoint,outcome});
 }
 if(matches.length!==1)throw Error('PRICING_ROUTE_PROOF_AMBIGUOUS');
 const {checkpoint,outcome}=matches[0],campaign=safePath(jobRoot,checkpoint),run=inside(campaign,outcome.runDirectory),bodyFile=inside(run,path.join(run,'raw',sourceHash+'.body'));
 if(outcome.countryV3Evaluation.sourceHash!==sourceHash||outcome.countryV3Evaluation.receiptStatus!=='HASH_VERIFIED'||outcome.countryV3Evaluation.geoClass!=='G1')throw Error('PRICING_ROUTE_PROOF_G1');
 if(fs.statSync(bodyFile).size>8_000_000)throw Error('PRICING_ROUTE_PROOF_BOUND');
 const body=fs.readFileSync(bodyFile,'utf8');if(sha(body)!==sourceHash)throw Error('PRICING_ROUTE_PROOF_HASH');
 const verification=readJson(safePath(run,'interpretation-0001/targeted-verification.json')),checks=(verification.sourceChecks??[]).filter(row=>row.hash===sourceHash);
 if(checks.length!==1)throw Error('PRICING_ROUTE_PROOF_RECEIPT');
 const sourceCheck=checks[0],receipt=sourceCheck.receipt,attemptId=receipt?.geo?.attemptId;
 if(receipt?.intact!==true||receipt?.bodyHash!==sourceHash||receipt?.service!==service||receipt?.serviceEstablished!==true||receipt?.bindingEstablished!==true||receipt?.geo?.classification!=='G1'||receipt.geo.targetCountry!==market||receipt.geo.bodyHash!==sourceHash||sourceCheck.occurrence!==receipt.sourceOccurrenceId)throw Error('PRICING_ROUTE_PROOF_RECEIPT');
 const records=readMarketRunRecords(path.join(run,'journal'),{maxBytes:250_000_000}),found=records.filter(row=>row.type==='V2_ACQUISITION_RESULT'&&row.payload?.target?.id===targetId).flatMap(record=>(record.payload.result?.attempts??[]).flatMap((attempt,attemptIndex)=>attempt.id===attemptId?[{record,attempt,attemptIndex}]:[]));
 if(found.length!==1)throw Error('PRICING_ROUTE_PROOF_ATTEMPT');
 const {record,attempt,attemptIndex}=found[0],reference=receipt.geo.sourceReference,expectedPath=`journal/record-${String(record.sequence).padStart(8,'0')}.json`;
 const geo=attempt.transportVerification;
 if(reference?.hash!==record.hash||reference.sequence!==record.sequence||reference.path!==expectedPath||reference.pointer!==`/result/attempts/${attemptIndex}/page`||reference.trustRoot?.kind!=='LIVE_CAMPAIGN_ROOT_V1'||reference.trustRoot.id!==path.basename(run)||attempt.targetCountry!==market||geo?.level!=='BRACKET_VERIFIED'||geo.targetCountry!==market||geo.before?.status!=='MATCH'||geo.before.country!==market||geo.after?.status!=='MATCH'||geo.after.country!==market||receipt.geo.geoCountry!==market||receipt.sourceUrl!==attempt.page?.url||receipt.geo.sourceUrl!==attempt.page?.url||outcome.sourceClassification?.status!=='PROVIDER_SOURCE'||outcome.sourceClassification.sourceHash!==sourceHash||outcome.sourceClassification.finalUrl!==attempt.page?.url||attempt.page?.rawSource?.text!==body||attempt.page?.sourceIntegrity?.sha256!==sourceHash)throw Error('PRICING_ROUTE_PROOF_BINDING');
 return {sourceUrl:attempt.page.url,acquiredAt:originalAcquisitionTime(attempt),method:attempt.method};
}
