import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {numericOccurrences,wireInput,reconstructWire} from './semantic-wire.mjs';
import {evidenceRequest,projectEvidence} from './evidence.mjs';
import {selectSemanticUnits} from './semantic-units.mjs';
import {digest,checkpoint,restore} from './model.mjs';
import {createLiveSemanticInterpreter} from './live-semantic.mjs';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {evaluate} from './truth.mjs';
import {fixtureInput,evidenceFixtures,wireCompletion} from './evidence-fixtures.test-support.mjs';
const request=text=>({observation:{id:'obs',sha256:digest(text)},unit:{id:digest(text)},material:{segments:[{start:0,end:text.length,text}],presentations:[{id:'presentation',start:0,end:text.length}],destinations:[]},serviceName:'Library',translation:null});
for(const [text,raw,values] of [
 ['USD 10 monthly','10',[10]],['￥1,080/月','1,080',[1080,1.08]],['EUR 1.080 monthly','1.080',[1080,1.08]],['EUR 1 080','1 080',[1080]],['EUR 1\u00a0080','1\u00a0080',[1080]],['EUR 1\u202f080','1\u202f080',[1080]],['1080 USD','1080',[1080]],['￥１，０８０','１，０８０',[1080,1.08]],['USD 9.99','9.99',[9.99]],['EUR 12,99','12,99',[12.99]],['USD 1,234.56','1,234.56',[1234.56]],['EUR 1.234,56','1.234,56',[1234.56]],['EUR 1 234,56','1 234,56',[1234.56]],['Free USD 0','0',[0]],['25% off','25',[25]],['120 / 12 per month','120',[120]],
])test('source occurrence token and value alternatives: '+text,()=>{const r=request(text),n=numericOccurrences(r).find(n=>n.raw===raw);assert.ok(n);assert.deepEqual(n.values,values);assert.equal(text.slice(n.start,n.end),raw);assert.equal(wireInput(r).numbers.find(x=>x.id===n.id).segment,'s0');assert.deepEqual(numericOccurrences(r),numericOccurrences(r));});
test('duration, price, percentage and annual equivalents have independent occurrence identities',()=>{const n=numericOccurrences(request('3 months at €0, then €12.99/month. 25% saving; annual €120 equivalent €10.'));assert.deepEqual(n.map(n=>n.raw),['3','0','12.99','25','120','10']);assert.equal(new Set(n.map(n=>n.id)).size,6);});
test('repeated identical values retain independent exact spans',()=>{const r=request('First month $9.99, then $9.99/month'),n=numericOccurrences(r);assert.equal(n.length,2);assert.deepEqual(n[0].values,n[1].values);assert.notEqual(n[0].id,n[1].id);assert.notEqual(n[0].start,n[1].start);});
test('references are unit specific and bounded',()=>{const a=request('USD 10'),b={...a,unit:{id:'other'}};assert.notEqual(numericOccurrences(a)[0].id,numericOccurrences(b)[0].id);assert.throws(()=>numericOccurrences(request(Array(130).fill('1;').join(''))),/WIRE_NUMBER_BOUND/);});
const repeated={key:'equal-prices',language:'English',name:'Library',market:'US',html:'<section><h2>Personal</h2><p>Consumer subscription: first month USD 9.99, then USD 9.99 per month, ordinary recurring.</p></section>',plans:[{name:'Personal',anchor:'Consumer subscription:',container:true,transition:true,charges:[{id:'intro',money:{amount:9.99,amountText:'9.99',currency:'USD',currencyText:'USD'},cadence:{unit:'UNKNOWN',expression:null},role:'INTRODUCTORY',duration:'first month',derivation:'EXPLICIT',qualifiers:[],ambiguity:false},{id:'recurring',money:{amount:9.99,amountText:'9.99',currency:'USD',currencyText:'USD'},cadence:{unit:'MONTHLY',expression:'per month'},role:'ORDINARY',duration:null,derivation:'EXPLICIT',qualifiers:[],ambiguity:false}]}],expected:9.99};
async function run(f=repeated,mutate=(w,r)=>w) {
 const input={...fixtureInput(f),semantic:{mode:'LIVE'},bounds:{actions:1,modelCalls:1}},calls=[];
 const interpret=await createLiveSemanticInterpreter({env:{GROQ_API_KEY:'offline-placeholder',SAVLIVO_V3_SEMANTIC_MODEL:'offline-model'},fetchImpl:async(_,options)=>{
  const p=JSON.parse(options.body),r=JSON.parse(p.messages[1].content),w=wireCompletion(r,f);
  if(f===repeated){const ns=r.numbers.filter(n=>n.raw==='9.99');w.charges[0].amountRef=ns[0].id;w.charges[1].amountRef=ns[1].id;}
  calls.push({r,p,w});return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(mutate(w,r))}}]}),{headers:{'content-type':'application/json'}});
 }});
 return {...await runTarget({input,interpret,capabilities:offlineCapabilities(input)}),calls};
}
test('same-value introductory and subsequent charges cross SDK and truth with distinct exact bindings',async()=>{const r=await run(),e=r.knowledge.observations[0].evidence.envelope,charges=e.offers[0].charges;assert.equal(r.result.truth.established,true);assert.equal(charges[0].role,'INTRODUCTORY');assert.equal(charges[1].role,'ORDINARY');assert.notEqual(charges[0].money.amountSpan.start,charges[1].money.amountSpan.start);assert.equal(charges[0].money.amount,9.99);assert.equal(e.offers[0].transitions[0].kind,'RECURS_AFTER_INTRO');assert.deepEqual(restore(checkpoint(r.knowledge)).observations[0].evidence.wire,r.knowledge.observations[0].evidence.wire);assert.equal(evaluate(restore(checkpoint(r.knowledge))).prices.US.propositions.PRICE_AMOUNT.value,9.99);});
for(const [name,mutation,code] of [
 ['nonexistent occurrence',w=>w.charges[1].amountRef='n_missing','WIRE_NUMBER_REFERENCE_INVALID'],
 ['mismatching value',w=>w.charges[1].amount=0,'WIRE_NUMBER_VALUE_MISMATCH'],
 ['malformed occurrence',w=>w.charges[1].amountRef='../../../outside','WIRE_NUMBER_REFERENCE_INVALID'],
 ['forged span',w=>w.charges[1].amountSpan={start:0,end:4},'WIRE_FIELDS_INVALID'],
 ['truth verdict',w=>w.charges[1].established=true,'WIRE_FIELDS_INVALID'],
 ['fabricated currency',w=>w.charges[1].currency='EUR','WIRE_CURRENCY_UNSUPPORTED'],
 ['fabricated currency support',w=>w.charges[1].currencyRef='u_missing','WIRE_CURRENCY_UNSUPPORTED'],
 ['out-of-support occurrence',(w,r)=>w.charges[1].sources=[r.segments[0].id],'WIRE_NUMBER_REFERENCE_INVALID'],
])test('invalid '+name+' fails closed and retains safe failure category',async()=>{const r=await run(repeated,(w,input)=>{mutation(w,input);return w;});assert.equal(r.result.truth.established,false);assert.ok(r.result.trace.some(t=>t.code===code));});
test('numeric failures retain object, reference, candidate values and exact original spans, not arbitrary generations',async()=>{const r=await run(repeated,w=>{w.charges[1].amount=123;return w;});const t=r.result.trace.find(t=>t.code==='WIRE_NUMBER_VALUE_MISMATCH');assert.equal(t.diagnostics.object,'o0-recurring');assert.equal(t.diagnostics.field,'amount');assert.ok(t.diagnostics.reference.startsWith('n-'));assert.equal(t.diagnostics.occurrences.filter(n=>n.raw==='9.99').length,2);assert.ok(t.diagnostics.occurrences.every(n=>Number.isInteger(n.start)));assert.equal('generation' in t.diagnostics,false);});
test('another unit cannot supply a numeric reference',async()=>{const r=await run(repeated,(w,input)=>{w.charges[1].amountRef=input.numbers[0].id.replace(/n-[^-]+-/,'n-000000000000-');return w;});assert.ok(r.result.trace.some(t=>t.code==='WIRE_NUMBER_REFERENCE_INVALID'));});
test('multiple offers cannot borrow the other presentation amount or temporal edge',()=>{
 const f=evidenceFixtures.find(f=>f.key==='multiple-plans'),input=fixtureInput(f),body=input.fixtures.at(-1).body,o={id:'obs',body,sha256:digest(body),format:'WEB',contentType:'text/html',url:input.objective.seeds[0]};const unit=selectSemanticUnits(o,input.objective).find(u=>evidenceRequest(o,input.objective,u).material.segments.some(s=>s.text.includes('familial')))??selectSemanticUnits(o,input.objective)[0];
 // Whole bounded local region for this direct reconstruction adversary.
 const r=evidenceRequest(o,input.objective),i=wireInput(r),w=wireCompletion(i,f);assert.equal(projectEvidence(o,input.objective,reconstructWire(r,w)).error,undefined);
 w.charges[0].amountRef=w.charges[1].amountRef;w.charges[0].amount=w.charges[1].amount;assert.throws(()=>reconstructWire(r,w),/WIRE_NUMBER_REFERENCE_INVALID/);
 const w2=wireCompletion(i,f);w2.relations.push({from:w2.charges[0].id,to:w2.charges[1].id,kind:'FOLLOWED_BY',sources:w2.charges[0].sources,ambiguous:false});assert.throws(()=>reconstructWire(r,w2),/WIRE_RELATION_INVALID/);
});
test('native full-width zero, duration and subsequent monthly amount cross occurrence SDK boundary',async()=>{const f={...repeated,html:'<section><p>Consumer subscription: ３ months USD ０, then USD １２．９９ per month.</p></section>',plans:[{...repeated.plans[0],charges:[{...repeated.plans[0].charges[0],money:{...repeated.plans[0].charges[0].money,amount:0,amountText:'０'},duration:'３ months'},{...repeated.plans[0].charges[1],money:{...repeated.plans[0].charges[1].money,amount:12.99,amountText:'１２．９９'}}]}],expected:12.99};const r=await run(f);assert.equal(r.result.truth.established,true);assert.equal(r.result.truth.prices.US.propositions.PRICE_AMOUNT.value,12.99);});
test('production occurrence code has no oracle branches',()=>{assert.doesNotMatch(readFileSync(new URL('semantic-wire.mjs',import.meta.url),'utf8'),/Spotify|spotify|Japanese|Japan|\bJPY\b|\bJP\b|1080|1,080/);});
test('negative numeric source cannot be reconstructed as a positive charge',()=>{const r=request('USD -10 monthly'),n=numericOccurrences(r);assert.deepEqual(n[0].values,[-10]);assert.equal(n[0].raw,'-10');});
test('unsupported notation retains ambiguity diagnostics with source candidates',()=>{const r=request('USD 1,2,3'),i=wireInput(r),wire={language:'en',serviceSources:['s0'],serviceAmbiguous:false,offers:[{id:'o',presentation:'p0',name:'Personal',audience:'CONSUMER',relationship:'SUBSCRIPTION',marketStatements:[],qualifiers:[],ambiguous:false}],charges:[{id:'c',offer:'o',sources:['s0'],amountRef:i.numbers[0].id,amount:123,currencyRef:i.currencies.find(u=>u.raw==='USD').id,currency:'USD',cadence:'MONTHLY',cadenceText:'monthly',role:'ORDINARY_RECURRING',durationText:null,derivation:'EXPLICIT',qualifiers:[],ambiguous:false}],relations:[],accounts:[],populations:[],accountStatements:[]};assert.throws(()=>reconstructWire(r,wire),e=>{assert.equal(e.message,'WIRE_NUMBER_AMBIGUOUS');assert.deepEqual(e.v3Diagnostics.occurrences[0].values,[]);assert.equal(e.v3Diagnostics.field,'amount');return true;});});
