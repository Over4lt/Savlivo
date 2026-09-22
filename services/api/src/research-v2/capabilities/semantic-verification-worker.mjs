// Offline only: proposals select candidates, never supply authoritative fields.
import {assertOffline} from '../offline-replay/offline-guard.mjs';
import fs from 'node:fs';
import {validateSemanticOutput} from '../../research-v1/semantic-price.mjs';
import {loadLiveSource} from '../verification/live-source.mjs';
import {deriveEvidence,verifyCandidate} from '../verification/gate.mjs';
const file=process.argv[2],input=JSON.parse(fs.readFileSync(file)),read=f=>JSON.parse(fs.readFileSync(f));
const dir=input.runDirectory,out=dir+'/'+fs.readdirSync(dir).filter(n=>/^interpretation-\d+$/.test(n)).sort().at(-1);
const sources=read(out+'/corpus/sources.json').sources,bindings=read(out+'/discovery/bindings.json');
const offers=validateSemanticOutput(input.output,input.context),decisions=[];
for(const source of sources.filter(s=>s.sha256===input.context.sourceHash))for(const occurrence of source.occurrences){
 const loaded=loadLiveSource(occurrence,source.sha256,bindings),span=input.context.container;
 if(loaded.body.slice(span.offset,span.offset+input.context.text.length)!==input.context.text)throw Error('SEMANTIC_SOURCE_SPAN_CHANGED');
 const derived=deriveEvidence(loaded.body,loaded.context);
 for(const offer of offers){const matches=derived.rows.filter(r=>String(r.amountNormalized)===offer.amount.value&&r.currency===offer.currency.value&&r.product===offer.plan.value);
  if(matches.length!==1){decisions.push({status:'V2_VERIFICATION_BLOCKED',blockers:['SEMANTIC_PROPOSAL_NOT_INDEPENDENTLY_ESTABLISHED']});continue;}
  const claim={...matches[0],service:occurrence.service,market:occurrence.market,sourceUrl:occurrence.url};
  decisions.push(verifyCandidate(claim,derived,loaded.receipt));
 }
}
fs.writeFileSync(file+'.verification.json',JSON.stringify({decisions,offline:assertOffline(),productionPromotion:false}),{flag:'wx'});
