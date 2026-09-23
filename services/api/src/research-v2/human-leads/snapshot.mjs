// Operator hints are independent of Genesis authority and never evidence.
import fs from 'node:fs';
import path from 'node:path';
import {countryCurrencyData} from '../../../../../packages/contracts/src/markets.ts';
import {canonical,sha,safe,stableBytes,immutable} from '../storage/core.mjs';
export const leadTypes=Object.freeze(['PROVIDER_HOME','PRICING','LOGIN','MANAGEMENT','CANCELLATION','GENERAL']);
const markets=new Set(countryCurrencyData.map(([id])=>id));
const reject=code=>{throw Object.assign(Error('HUMAN_LEAD_'+code),{status:400});};
const keys=(x,allowed)=>{if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!allowed.includes(k)))reject('SCHEMA');};
const sorted=a=>[...new Set(a)].sort();
export function leadURL(value){
 if(typeof value!=='string'||value.length>2048)reject('URL');let u;try{u=new URL(value);}catch{reject('URL');}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash||!u.hostname.includes('.')||/^(localhost|127\.|0\.|169\.254\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u.hostname)||u.hostname.includes(':')||/\.(local|localhost|internal)$/i.test(u.hostname))reject('URL');
 if([...u.searchParams.keys()].some(k=>/^(?:access_token|api_key|password|secret|authorization)$/i.test(k)))reject('URL');
 return u.href;
}
export function submission(x){
 keys(x,['type','url','marketScope','note']);if(!leadTypes.includes(x.type))reject('TYPE');
 const scope=x.marketScope??[];if(!Array.isArray(scope)||scope.length>markets.size||scope.some(m=>!markets.has(m)))reject('MARKET');
 if(x.note!==undefined&&(typeof x.note!=='string'||x.note.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(x.note)))reject('NOTE');
 return {type:x.type,url:leadURL(x.url),marketScope:sorted(scope),note:x.note??''};
}
function record(x){
 keys(x,['leadId','serviceId','type','url','marketScope','note','status','createdBy','createdAt','updatedAt']);
 if(!/^[a-f0-9-]{36}$/.test(x.leadId??'')||!/^[a-z0-9-]+$/.test(x.serviceId??'')||x.status!=='UNVERIFIED'||typeof x.createdBy!=='string'||!x.createdBy||x.createdBy.length>200||![x.createdAt,x.updatedAt].every(t=>typeof t==='string'&&Number.isFinite(Date.parse(t))))reject('RECORD');
 return {...submission({type:x.type,url:x.url,marketScope:x.marketScope,note:x.note}),leadId:x.leadId,serviceId:x.serviceId,status:'UNVERIFIED',createdBy:x.createdBy,createdAt:x.createdAt,updatedAt:x.updatedAt};
}
export function leadContext(config,root){
 const universe=JSON.parse(stableBytes(safe(root,config.universe))),manifest=JSON.parse(stableBytes(safe(root,config.cohortManifest)));
 const services=sorted(config.executionServices??manifest.serviceIds);if(services.some(id=>!manifest.serviceIds.includes(id)||(universe.existing??[]).some(c=>(c.service??c.slug)===id)))reject('COHORT');
 const scoped=config.researchScopes?JSON.parse(stableBytes(safe(root,config.researchScopes))).researchMarkets:{};
 const candidates=[...universe.new_include,...universe.research];
 return {cohortHash:sha(canonical(manifest.serviceIds.slice().sort())),services,scopes:Object.fromEntries(services.map(id=>[id,sorted(scoped[id]?.length?scoped[id]:candidates.find(c=>c.slug===id)?.markets??[])]))};
}
export function snapshotDocument(context,records){
 if(!context||Object.keys(context).sort().join()!=='cohortHash,scopes,services'||!/^[a-f0-9]{64}$/.test(context.cohortHash??'')||!Array.isArray(context.services)||canonical(context.services)!==canonical(sorted(context.services))||context.services.some(id=>!/^[a-z0-9-]+$/.test(id))||canonical(Object.keys(context.scopes).sort())!==canonical(context.services)||Object.values(context.scopes).some(a=>!Array.isArray(a)||a.some(m=>!markets.has(m))||canonical(a)!==canonical(sorted(a))))reject('CONTEXT');
 const leads=records.filter(x=>x.status==='UNVERIFIED'&&context.services.includes(x.serviceId)&&(!x.marketScope.length||x.marketScope.some(m=>context.scopes[x.serviceId]?.includes(m)))).map(record).sort((a,b)=>a.leadId.localeCompare(b.leadId));
 if(leads.length>4000||new Set(leads.map(l=>l.leadId)).size!==leads.length)reject('BOUND');
 return {schema:'V2_HUMAN_LEADS_V1',context,leads};
}
export function freezeLeads(root,context,records){
 const value=snapshotDocument(context,records),bytes=canonical(value),sha256=sha(bytes),relative='.savlivo/v2-operations-inputs/human-leads/'+sha256+'.json';
 immutable(safe(root,relative),bytes);return {path:relative,sha256};
}
export function readLeadSnapshot(root,binding,context){
 keys(binding,['path','sha256']);if(!/^[a-f0-9]{64}$/.test(binding.sha256??'')||binding.path!=='.savlivo/v2-operations-inputs/human-leads/'+binding.sha256+'.json')reject('BINDING');
 const file=safe(root,binding.path);if(fs.statSync(file).size>8*1024*1024)reject('BOUND');const bytes=stableBytes(file);if(sha(bytes)!==binding.sha256)reject('HASH');
 const value=JSON.parse(bytes);keys(value,['schema','context','leads']);if(value.schema!=='V2_HUMAN_LEADS_V1'||!Array.isArray(value.leads)||canonical(value.context)!==canonical(context))reject('CONTEXT');
 if(canonical(snapshotDocument(context,value.leads))!==bytes.toString())reject('CANONICAL');return value;
}
export function applicableLeads(target,snapshot){return snapshot.leads.filter(l=>l.serviceId===target.service&&(!l.marketScope.length||(target.market?l.marketScope.includes(target.market):l.marketScope.some(m=>snapshot.context.scopes[target.service]?.includes(m))))&&(target.researchObjective==='CATALOG_ONLY'?l.type!=='PRICING':!['LOGIN','MANAGEMENT','CANCELLATION'].includes(l.type)));}
export function candidateLeads(target,snapshot,binding){
 if(!snapshot)return target;
 const hints=applicableLeads(target,snapshot).map(l=>({url:l.url,title:l.type==='GENERAL'?target.serviceName:l.type.toLowerCase().replaceAll('_',' '),rank:-1,evidenceStatus:'HUMAN_UNVERIFIED_LEAD',authoritative:false,humanLead:{leadId:l.leadId,snapshotHash:binding.sha256,investigationMarkets:l.marketScope}}));
 // Candidate input only. Existing authority, information-value and capability gates still decide.
 return {...target,leads:[...hints,...(target.leads??[]).filter(l=>!l.humanLead&&!hints.some(h=>h.url===l.url))]};
}
// Verify the admitted binding before worker execution, independently of mutable submissions.
export function verifyAdmittedLeads(root,config,manifest){
 const relative=path.isAbsolute(manifest.lifecycle.input)?path.relative(root,manifest.lifecycle.input):manifest.lifecycle.input;
 const bytes=stableBytes(safe(root,relative)),input=JSON.parse(bytes);
 if(!Object.hasOwn(config,'humanLeadSnapshot')&&!Object.hasOwn(manifest,'humanLeadSnapshot')&&!Object.hasOwn(input,'humanLeadSnapshot'))return;
 if(sha(bytes)!==manifest.lifecycle.inputHash||canonical(config.humanLeadSnapshot)!==canonical(manifest.humanLeadSnapshot)||canonical(config.humanLeadSnapshot)!==canonical(input.humanLeadSnapshot))reject('ADMITTED_BINDING');
 return readLeadSnapshot(root,input.humanLeadSnapshot,leadContext(input,root));
}
