import {Operations,settings,OperationError} from './control.mjs';import {publicRun,json,lifecycleEvents} from './artifacts.mjs';import path from 'node:path';
let singleton;export function operations(){return singleton??=new Operations(settings());}
export async function operationsRequest({method,url,body,actor},ops=operations()){
 if(!actor)throw new OperationError('UNAUTHORIZED',401);if(!ops.config.read)throw new OperationError('OPERATIONS_DISABLED',404);
 const route=url.pathname.replace('/v1/admin/v2-operations',''),parts=route.split('/').filter(Boolean),page=()=>{const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??50);if(!Number.isInteger(offset)||offset<0||offset>100000||!Number.isInteger(limit)||limit<1||limit>100)throw new OperationError('INVALID_PAGE');return {offset,limit};};
 if(method==='GET'&&route==='/summary')return ops.summary();
 if(method==='GET'&&route==='/runs'){const {offset,limit}=page();let rows=ops.index().map(publicRun);for(const k of ['objective','status','origin'])if(url.searchParams.get(k))rows=rows.filter(r=>r[k]===url.searchParams.get(k));return {total:rows.length,rows:rows.slice(offset,offset+limit)};}
 if(method==='GET'&&route==='/coverage')return {rows:ops.index().filter(r=>r.after).map(r=>({runId:r.id,at:r.createdAt,origin:r.origin,objective:r.objective,...r.after})).reverse()};
 if(method==='GET'&&['/services','/unresolved'].includes(route)){const result=ops.services({runId:url.searchParams.get('run')??undefined,q:url.searchParams.get('q')??'',unresolvedOnly:route==='/unresolved',state:url.searchParams.get('state')??'',...page()});return {...result,rows:result.rows.map(({evidence,...row})=>row)};}
 if(method==='GET'&&parts[0]==='runs'&&parts[2]==='artifacts'&&parts.length===4){const r=ops.run(parts[1]),kind=parts[3];if(kind==='manifest')return {objective:r.objective,version:r.engineVersion,bounds:r.bounds,targets:(r._manifest?.targets??[]).slice(0,500).map(t=>({service:t.service,market:t.market,objective:t.researchObjective}))};if(kind==='summary'||kind==='report')return {run:publicRun(r),before:r.before,after:r.after,meaning:'SANITIZED_STRUCTURED_ARTIFACT_VIEW'};if(kind==='checkpoint')return {status:r.status,checkpoint:r.checkpoint,checkedAt:r.checkpointAt,progress:r.routes?.current??null};throw new OperationError('ARTIFACT_NOT_AVAILABLE',404);}
 if(method==='GET'&&parts[0]==='runs'&&parts.length===2){const r=ops.run(parts[1]),services=ops.services({runId:r.id,limit:100});return {run:publicRun(r),services,efficiency:{requestsPerFreshService:r.freshResolutions>0&&r.requests!==null?r.requests/r.freshResolutions:null,freshPer100Requests:r.requests>0&&r.freshResolutions!==null?r.freshResolutions*100/r.requests:null},events:[...ops.db().events.filter(e=>e.jobId===r.jobId).slice(-100),...(r.lifecycle?lifecycleEvents(r._directory):[])]};}
 if(method==='GET'&&parts[0]==='services'&&parts.length===2){const service=parts[1];if(!/^[a-z0-9-]+$/.test(service))throw new OperationError('INVALID_SERVICE');return ops.evidence(service,url.searchParams.get('run')??undefined);}
 if(method==='GET'&&route==='/schedules')return {rows:ops.db().schedules.map(s=>({...s,lastRun:ops.db().jobs.find(j=>j.id===s.lastRunId)??null,lastSuccessfulRun:ops.db().jobs.find(j=>j.id===s.lastSuccessfulRunId)??null}))};
 if(method==='POST'&&route==='/preflight')return ops.preflight(body,actor);
 if(method==='POST'&&route==='/start'){if(!body||Object.keys(body).some(k=>!['token','confirmed'].includes(k)))throw new OperationError('INVALID_BODY');return ops.start(body.token,actor,body.confirmed);}
 if(method==='POST'&&parts[0]==='jobs'&&parts.length===3)return ops.control(parts[1],parts[2],actor);
 if(method==='POST'&&route==='/schedules')return ops.saveSchedule(body,actor);
 if(method==='POST'&&parts[0]==='schedules'&&parts.length===2)return ops.saveSchedule(body,actor,parts[1]);
 if(method==='POST'&&parts[0]==='schedules'&&parts.length===3)return ops.scheduleAction(parts[1],parts[2],actor,body?.idempotencyKey);
 throw new OperationError('NOT_FOUND',404);
}
