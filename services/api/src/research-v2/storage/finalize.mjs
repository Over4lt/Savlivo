import fs from 'node:fs';
import {safe,files,read,digest,sha,stableBytes,immutable,canonical,sealed} from './core.mjs';
import {format,publishReceipt,validateReceipt} from './references.mjs';
import {publishHistory} from './history.mjs';
export const receiptPath=directory=>'.savlivo/research-v2/storage/finalized/'+digest(directory)+'.json';
export function finalizedBoundary(root,directory){const file=receiptPath(directory);if(!fs.existsSync(safe(root,file)))return null;return {file,receipt:validateReceipt(root,read(safe(root,file)))};}
export function finalizeRun(root,{directory,baseline,engine,createdAt}){
 const lineage=read(safe(root,directory+'/lineage.json'));
 // Never append new finalization state to historical runs implicitly.
 if(lineage.storageBoundaryVersion!==1)return {status:'LEGACY_PROTECTED'};
 const all=files(root,directory),roots=[];
 const add=(p,classification)=>{if(fs.existsSync(safe(root,p)))roots.push({path:p,format:format(p),classification,reason:'MATURE_FINALIZATION_INPUT'});};
 for(const f of ['lineage.json','summary.json','final-dispositions.json','network.jsonl','capability-ledger.jsonl','provider-review-queue.json','provider-binding-drafts.json','human-lead-outcomes.jsonl'])add(directory+'/'+f,'PERMANENT_HISTORY');
 const states=all.filter(f=>/\/(catalog|pricing)\/adaptive-state\.json$/.test(f));
 const pages=all.filter(f=>f.endsWith('/pages.json')||f.endsWith('/open-web-discovery/state.json'));
 for(const f of [...states,...pages,...all.filter(f=>/\/(field-review|cancellation-review)\.jsonl$/.test(f))])add(f,'REFERENCED_EVIDENCE');
 let receipt=null,error=null;
 try{receipt=publishReceipt(root,{destination:receiptPath(directory),roots,runId:directory,versions:{engine,policy:'MATURE_V2_UNCHANGED',schema:1},cohort:lineage.cohort,baseline,capabilities:lineage.capabilities??null,createdAt,continuation:{stateFiles:states,pageFiles:pages}});}catch(e){error=e.message;}
 // Compact history is useful even when safe compaction is blocked. Null receipt is explicit.
 const history=publishHistory(root,{directory,receipt});
 const result=sealed({schema:'V2_FINALIZATION_STATUS_V1',runId:directory,status:receipt?'FINALIZED':'LEGACY_CLOSURE_PROTECTED',reason:error,historyHash:history.contentHash,receiptHash:receipt?.contentHash??null});
 immutable(safe(root,'.savlivo/research-v2/storage/status/'+digest(directory)+'.json'),canonical(result));return result;
}
