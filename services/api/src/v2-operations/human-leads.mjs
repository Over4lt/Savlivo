import fs from 'node:fs';
import path from 'node:path';
import {countryCurrencyData} from '../../../../packages/contracts/src/markets.ts';
import {safe} from '../research-v2/storage/core.mjs';
import {leadTypes} from '../research-v2/human-leads/snapshot.mjs';
import {randomUUID} from 'node:crypto';
import {submission} from '../research-v2/human-leads/snapshot.mjs';
const fail=(code,status=400)=>{throw Object.assign(Error(code),{status});};
export function humanLeadsRequest(ops,service,actor,body,leadId=null){
 if(!actor)fail('UNAUTHORIZED',401);
 if(!ops.config.lifecycleInput)fail('HUMAN_LEADS_REQUIRE_MATURE_LIFECYCLE',404);
 if(!/^[a-z0-9-]+$/.test(service)||!ops.services({q:service,limit:100}).rows.some(s=>s.service===service))fail('SERVICE_NOT_FOUND',404);
 const view=l=>({...l,createdBy:l.createdBy===actor?'You':'Admin operator',canDeactivate:ops.config.control&&l.createdBy===actor&&l.status==='UNVERIFIED'});
 if(body===undefined){const rows=(ops.db().humanLeads??[]).filter(l=>l.serviceId===service&&(!leadId||l.leadId===leadId));if(leadId&&!rows.length)fail('LEAD_NOT_FOUND',404);const outcomes=[];for(const job of ops.db().jobs.slice(-100)){try{const manifest=JSON.parse(fs.readFileSync(path.join(ops.config.root,'runs',job.id,'manifest.json')));if(!manifest.humanLeadSnapshot||!manifest.lifecycle?.output)continue;const file=safe(ops.config.repo,manifest.lifecycle.output+'/human-lead-outcomes.jsonl');if(!fs.existsSync(file))continue;const fd=fs.openSync(file,'r');let chunk;try{const size=fs.fstatSync(fd).size,start=Math.max(0,size-262144),b=Buffer.alloc(Math.min(size,262144));fs.readSync(fd,b,0,b.length,start);chunk=b.toString();if(start)chunk=chunk.slice(chunk.indexOf('\n')+1);}finally{fs.closeSync(fd);}for(const line of chunk.trim().split('\n')){const r=JSON.parse(line);if(r.serviceId===service&&r.snapshotHash===manifest.humanLeadSnapshot.sha256&&rows.some(l=>l.leadId===r.leadId))outcomes.push({jobId:job.id,leadId:r.leadId,event:r.event,at:r.at,market:r.market,route:r.route,outcome:r.outcome,verifierOutcome:r.verifierOutcome,verifiedCount:r.verifiedCount,bodyHash:r.bodyHash,snapshotHash:r.snapshotHash});}}catch{/* Incomplete observations remain unavailable, never fabricated. */}}return {rows:rows.map(view),outcomes:outcomes.slice(-100),canCreate:ops.config.control,types:leadTypes,markets:countryCurrencyData.map(([id])=>id),meaning:'UNVERIFIED_CANDIDATES_NOT_EVIDENCE'};}
 if(!ops.config.control)fail('RUN_CONTROL_DISABLED',403);
 const parsed=leadId?null:submission(body);
 return ops.transaction(db=>{
  db.humanLeads??=[];const now=new Date().toISOString();
  if(leadId){if(Object.keys(body??{}).join()!=='action'||body.action!=='deactivate')fail('INVALID_LEAD_ACTION');const lead=db.humanLeads.find(l=>l.leadId===leadId&&l.serviceId===service&&l.createdBy===actor);if(!lead)fail('LEAD_NOT_FOUND',404);if(lead.status==='UNVERIFIED'){lead.status='DEACTIVATED';lead.updatedAt=now;ops.event(db,'HUMAN_LEAD_DEACTIVATED',actor,{leadId,serviceId:service});}return view(lead);}
  if(db.humanLeads.length>=10000||db.humanLeads.filter(l=>l.serviceId===service&&l.status==='UNVERIFIED').length>=20)fail('HUMAN_LEAD_LIMIT',409);
  const lead={...parsed,leadId:randomUUID(),serviceId:service,status:'UNVERIFIED',createdBy:actor,createdAt:now,updatedAt:now};db.humanLeads.push(lead);ops.event(db,'HUMAN_LEAD_SUBMITTED',actor,{leadId:lead.leadId,serviceId:service});return view(lead);
 });
}
