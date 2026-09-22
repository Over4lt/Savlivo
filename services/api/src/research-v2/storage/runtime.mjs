import fs from 'node:fs';
import path from 'node:path';
import {safe,read,verifySeal,sha,stableBytes} from './core.mjs';
export const DEFAULT_MIN_FREE_BYTES=8*1024**3;
export function diskStatus(location,{statfs=fs.statfsSync,minimum=process.env.V2_STORAGE_MIN_FREE_BYTES??DEFAULT_MIN_FREE_BYTES}={}){
 const min=Number(minimum);if(!Number.isSafeInteger(min)||min<1024**3)return {available:false,admissionAllowed:false,reason:'STORAGE_INVALID_RESERVE',minimumFreeBytes:null};
 try{let p=path.resolve(location);while(!fs.existsSync(p)){const next=path.dirname(p);if(next===p)throw Error();p=next;}const s=statfs(p);const capacity=Number(s.blocks)*Number(s.bsize),available=Number(s.bavail)*Number(s.bsize),used=(Number(s.blocks)-Number(s.bfree))*Number(s.bsize);if(![capacity,available,used].every(Number.isSafeInteger))throw Error();return {available:true,capacityBytes:capacity,usedBytes:used,availableBytes:available,minimumFreeBytes:min,admissionAllowed:available>=min,reason:available>=min?null:'STORAGE_LOW_SPACE'};}catch{return {available:false,capacityBytes:null,usedBytes:null,availableBytes:null,minimumFreeBytes:min,admissionAllowed:false,reason:'STORAGE_METRICS_UNAVAILABLE'};}
}
export function requireSpace(location,options){const s=diskStatus(location,options);if(!s.admissionAllowed)throw Error(s.reason);return s;}
export function storageView(repo){const store='.savlivo/research-v2/storage';let inventory=null;try{const p=read(safe(repo,store+'/latest-inventory.json'));if(fs.statSync(safe(repo,p.path)).size>1024**2)throw Error('STORAGE_METRICS_TOO_LARGE');const bytes=stableBytes(safe(repo,p.path));if(sha(bytes)!==p.sha256)throw Error();const full=verifySeal(JSON.parse(bytes),'V2_STORAGE_METRICS_V1');const {rows,...compact}=full;inventory=compact;}catch{}return {disk:diskStatus(path.join(repo,'.savlivo')),inventory,growthRate:null,growthMeasurementWindow:null,projectedExhaustion:null,lastGc:null,destructiveGcEnabled:false};}

// Active work stops before the next bounded wave when measured reserve is low. Unknown metrics
// do not kill a running worker: new admission is blocked separately and the UI reports unavailable.
export function checkpointReserveLow(location){const s=diskStatus(location,{minimum:2*1024**3});return s.available&&!s.admissionAllowed;}
