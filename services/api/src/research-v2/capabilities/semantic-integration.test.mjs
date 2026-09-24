import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {enrichProvider} from './enrichment.mjs';
import {capabilityLedger} from './ledger.mjs';
import {validateSemanticOutput} from '../../research-v1/semantic-price.mjs';
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const permissions={direct:false,tavily:false,decodo:false,browser:false,groq:true};
// Synthetic hash-bound source occurrence, consumed by the REAL offline worker.
// Keep references beneath its repository root; never use production retained state.
function fixture(t,{amount='12',country='France',authority=true}={}) {
 const directory=fs.mkdtempSync(path.join(process.cwd(),'.semantic-fixture-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const text=`<section><h2>${country}</h2><article><h3>Basic</h3><p>EUR ${amount}/month</p><p>Abonnement mensuel</p></article></section>`;
 const target={id:'example-price-FR',service:'example',serviceName:'Example',market:'FR',researchObjective:'SERVICE_COVERAGE',authorities:[{hostname:'example.com',provider:'Example',sourceType:'OFFICIAL_PROVIDER'}]};
 const bodyHash=hash(text),url='https://example.com/plans';
 const page={url,outcome:'OK',httpStatus:200,contentType:'text/html',bodyHash,bodyFile:`bodies/${bodyHash}.txt`,sourceIntegrity:{sha256:bodyHash},authority:{status:'CONFIGURED_REVIEWED',provider:'Example',hostname:'example.com'},accessDecisions:[{decision:'ALLOWED'}]};
 fs.mkdirSync(directory+'/bodies');fs.writeFileSync(directory+'/'+page.bodyFile,text);
 const payload={target:{...target,authorities:authority?target.authorities:[]},page:{...page,rawSource:{text}}};
 const record={sequence:1,payload},recordHash=hash(record),recordPath=path.relative(process.cwd(),directory+'/source.json');
 fs.writeFileSync(directory+'/source.json',JSON.stringify({...record,hash:recordHash}));
 const occurrence={id:'synthetic-source',service:target.service,market:target.market,taskId:target.id,url,record:{path:recordPath,hash:recordHash,pointer:'/page'}};
 const runDirectory=directory+'/run',out=runDirectory+'/interpretation-0001';
 fs.mkdirSync(out+'/corpus',{recursive:true});fs.mkdirSync(out+'/discovery');
 fs.writeFileSync(out+'/corpus/sources.json',JSON.stringify({sources:[{sha256:bodyHash,occurrences:[occurrence]}]}));
 fs.writeFileSync(out+'/discovery/bindings.json',JSON.stringify([{sourceOccurrenceId:occurrence.id,bodyHash,taskId:target.id,record:occurrence.record}]));
 const field=(value,quote)=>({value,quote,start:text.indexOf(quote),end:text.indexOf(quote)+quote.length});
 const offer={plan:field('Basic','Basic'),amount:field(amount,amount),currency:field('EUR','EUR'),cadence:field('MONTHLY','month'),semantics:field('ORDINARY_RECURRING','Abonnement mensuel'),promotionDuration:null,ordinaryPriceAfterPromotion:null,ambiguous:false};
 const output={offers:[offer]};let calls=0,charges=0,verifications=0;
 const invoke=(options={})=>enrichProvider({target,page,directory,capabilities:permissions,ledger:capabilityLedger(directory,permissions,{model:'synthetic-text-model'}),result:{verified:[],sufficient:false},charge:()=>charges++,createSemantic:async()=>({policy:{modelRevision:'synthetic-text-model'},interpret:async()=>{calls++;return output;}}),verify:async()=>{verifications++;return {runDirectory,verified:[],sufficient:false};},...options});
 return {invoke,output,offer,text,page,target,directory,counts:()=>({calls,charges,verifications})};
}
test('nonempty foreign-language proposal crosses both consumers and reaches real independent verification',async t=>{
 const f=fixture(t);assert.equal(validateSemanticOutput(f.output,{text:f.text}).offers.length,1);
 const result=await f.invoke(),semantic=result.semanticInterpretation;
 assert.equal(semantic.status,'SOURCE_GROUNDED_PROPOSAL');assert.equal(semantic.offers.length,1);
 assert.equal(semantic.proposalVerification.decisions.length,1);
 const decision=semantic.proposalVerification.decisions[0];
 assert.equal(decision.fields.plan.status,'VERIFIED');
 assert.equal(decision.fields.ordinaryPriceRole.status,'VERIFIED');
 assert.equal(decision.fields.market.status,'BLOCKED'); // Requested FR / nearby country text is not proof.
 assert.equal(decision.status,'V2_VERIFICATION_BLOCKED');
 assert.equal(semantic.proposalVerification.productionPromotion,false);
 assert(Object.values(semantic.proposalVerification.offline).every(n=>n===0));
 assert.deepEqual(result.verified,[]); // A proposal never appends its own verified price.
 assert.deepEqual(f.counts(),{calls:1,charges:1,verifications:1});
 await f.invoke();assert.deepEqual(f.counts(),{calls:1,charges:1,verifications:1});
});
test('empty interpretation abstains without invoking proposal worker',async t=>{
 const f=fixture(t);f.output.offers=[];const result=await f.invoke();
 assert.equal(result.semanticInterpretation.status,'ABSTAINED');assert.deepEqual(result.semanticInterpretation.proposalVerification.decisions,[]);
 assert.equal(fs.readdirSync(f.directory).some(n=>n.endsWith('.verification.json')),false);
});
for(const [name,mutate] of [
 ['invented amount',f=>{f.offer.amount.value='999';}],
 ['unsupported quote',f=>{f.offer.plan.quote='Invented';}],
 ['invalid span',f=>{f.offer.cadence.start++;}],
 ['malformed output',f=>{f.output.extra='not allowed';}]
])test(name+' fails closed before verification',async t=>{
 const f=fixture(t);mutate(f);const result=await f.invoke();
 assert.equal(result.semanticInterpretation.reason,'CAPABILITY_FAILED_CLOSED');assert.equal(f.counts().verifications,0);
 assert.equal(fs.readdirSync(f.directory).some(n=>n.endsWith('.verification.json')),false);
});
for(const [name,options] of [['recurring zero',{amount:'0'}],['missing authority',{authority:false}],['missing market',{country:''}]])test(name+' cannot be established by semantic interpretation',async t=>{
 const f=fixture(t,options),result=await f.invoke(),s=result.semanticInterpretation;
 assert.equal(s.status,'SOURCE_GROUNDED_PROPOSAL');assert.equal(s.proposalVerification.decisions.length,1);
 assert(s.proposalVerification.decisions.every(d=>d.status!=='V2_VERIFIED'));assert.equal(s.verifierOutcome,'UNRESOLVED');
 const fields=s.proposalVerification.decisions[0].fields;
 if(name==='recurring zero')assert.equal(fields.ordinaryPriceRole.status,'BLOCKED');
 if(name==='missing authority')assert.equal(fields.service.status,'BLOCKED');
 if(name==='missing market')assert.equal(fields.market.status,'BLOCKED');
});
test('source-grounded words that are not independently established plan ownership are rejected',async t=>{
 const f=fixture(t);const quote='Abonnement mensuel';f.offer.plan={value:quote,quote,start:f.text.indexOf(quote),end:f.text.indexOf(quote)+quote.length};
 const s=(await f.invoke()).semanticInterpretation;
 assert.equal(s.status,'SOURCE_GROUNDED_PROPOSAL');assert.deepEqual(s.proposalVerification.decisions[0].blockers,['SEMANTIC_PROPOSAL_NOT_INDEPENDENTLY_ESTABLISHED']);
});
for(const [name,options] of [
 ['permission OFF',{capabilities:{...permissions,groq:false}}],
 ['already sufficient',{result:{sufficient:true}}],
 ['already verified',{result:{verified:[{id:'existing'}]}}],
 ['catalog objective',{target:{researchObjective:'CATALOG_ONLY'}}]
])test('Groq remains optional: '+name,async t=>{
 const f=fixture(t);await f.invoke({...options,createSemantic:()=>assert.fail('must not initialize')});
 assert.deepEqual(f.counts(),{calls:0,charges:0,verifications:0});
});
