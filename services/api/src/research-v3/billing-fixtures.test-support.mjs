// OFFLINE annotated understanding for acquisition/navigation fixtures only.
// The production path never imports this file. A displayed interval alone is
// deliberately insufficient; fixtures explicitly add payment wording.
import {evidenceRequest} from './evidence.mjs';
import {projectWebSource} from './source.mjs';
import {numericOccurrences} from './semantic-wire.mjs';
const span=s=>({start:s.start,end:s.end,quote:s.text,translated:null});
export function interpretBillingFixture(o,objective){
 const native=projectWebSource(o,objective),r=evidenceRequest(o,objective);
 const identity=r.material.segments.find(s=>s.text===objective.serviceName);
 if(!identity)return {kind:'NATIVE'};
 const offers=[];
 for(const [i,v] of native.source.offers.entries()) {
  if(typeof v.amount!=='number'||!v.currency)continue;
  const b=native.bindings['/offers/'+i],p=r.material.presentations.filter(p=>b.start>=p.start&&b.end<=p.end).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0];if(!p)continue;
  const rows=r.material.segments.filter(s=>s.start>=p.start&&s.end<=p.end),support=rows.map(span),billing=rows.filter(s=>s.text.includes('Billed monthly.')).map(span);
  const n=numericOccurrences(r).find(n=>n.start>=p.start&&n.end<=p.end&&n.values.includes(v.amount));if(!n)continue;
  offers.push({presentation:p.id,name:'Personal-'+i,service:objective.serviceName,audience:v.consumer===true?'CONSUMER':'UNKNOWN',relationship:v.relationship??'UNKNOWN',qualifiers:[],ambiguity:false,support,market:{country:v.market??null,basis:v.market?'EXPLICIT':'UNKNOWN',ambiguity:false,support:v.market?support:[]},charges:[{id:'charge-'+i,money:{amount:v.amount,amountText:n.raw,amountSpan:{start:n.start,end:n.end,quote:n.raw},currency:v.currency,currencyText:v.currency},cadence:{unit:v.cadence??'UNKNOWN',expression:rows.find(s=>s.start<=n.start&&s.end>=n.end)?.text??null},temporal:{billingCadence:billing.length?'MONTHLY':'UNKNOWN',billingSupport:billing,commitmentText:null,commitmentSupport:[],priceKind:v.amountDerivation==='ARITHMETIC'?'EQUIVALENT':'CHARGE'},role:v.role==='TRIAL'?'INTRODUCTORY':v.role??'UNKNOWN',derivation:v.amountDerivation??'UNKNOWN',duration:null,qualifiers:[],ambiguity:false,support}],transitions:[]});
 }
 return {kind:'EVIDENCE',envelope:{schema:r.schema,observationId:o.id,observationSha256:o.sha256,language:'fixture',translationArtifact:null,service:{name:objective.serviceName,ambiguity:false,support:[span(identity)],populations:[],account:[]},offers,accountGraph:{nodes:[],edges:[]}}};
}
