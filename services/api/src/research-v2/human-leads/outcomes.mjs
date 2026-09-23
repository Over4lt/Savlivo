import {applicableLeads} from './snapshot.mjs';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
// Append-only observations, separate from immutable submissions and snapshots.
// A verifier result is copied from the normal pipeline, never inferred from HTTP success.
export function leadOutcomeRecorder(directory,binding,snapshot,clock=()=>new Date().toISOString()){
 return (target,url,event,details={})=>{
  if(!snapshot)return;
  const leads=applicableLeads(target,snapshot).filter(l=>l.url===url);
  for(const lead of leads){const row={schema:'V2_HUMAN_LEAD_OUTCOME_V1',runId:directory.split('/').at(-1),leadId:lead.leadId,snapshotHash:binding.sha256,serviceId:target.service,market:target.market??null,event,at:clock(),...details};
   row.observationHash=createHash('sha256').update(JSON.stringify(row)).digest('hex');fs.appendFileSync(directory+'/human-lead-outcomes.jsonl',JSON.stringify(row)+'\n',{mode:0o600});
  }
 };
}
