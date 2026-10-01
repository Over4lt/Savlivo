import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {digest,checkpoint,restore} from './model.mjs';
import {selectSemanticUnits} from './semantic-units.mjs';
import {evidenceRequest,projectEvidence} from './evidence.mjs';
import {semanticWireSchema,wireInput,reconstructWire,validateWire} from './semantic-wire.mjs';
import {createLiveSemanticInterpreter} from './live-semantic.mjs';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {evaluate} from './truth.mjs';
import {evidenceFixtures,fixtureInput,wireCompletion} from './evidence-fixtures.test-support.mjs';
const oracle=evidenceFixtures.find(f=>f.key==='retained-oracle');
const env={SAVLIVO_V3_SEMANTIC_MODEL:'offline-model'};
async function liveMock(f=oracle,mutate=x=>x,{sdk=false}={}) {
 const input={...fixtureInput(f),semantic:{mode:'LIVE'}},calls=[];
 const reply=p=>{const r=JSON.parse(p.messages[1].content);calls.push({r,p});return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(mutate(wireCompletion(r,f),r))}}]};};
 const options=sdk?{env:{...env,GROQ_API_KEY:'offline-placeholder'},fetchImpl:async(url,o)=>new Response(JSON.stringify(reply(JSON.parse(o.body))),{headers:{'content-type':'application/json'}})}:{env,client:{chat:{completions:{create:async p=>reply(p)}}}};
 const interpret=await createLiveSemanticInterpreter(options);return {...await runTarget({input,interpret,capabilities:offlineCapabilities(input)}),calls,input};
}
for(const f of evidenceFixtures)test('compact wire '+f.key+' '+f.language+' retains conservative deterministic outcome',async()=>{
 const run=await liveMock(f);assert.equal(run.result.truth.established,f.expected!==undefined);
 if(f.expected!==undefined){const expected=Array.isArray(f.expected)?f.expected:[f.expected];assert.ok(expected.includes(run.result.truth.prices[f.market].propositions.PRICE_AMOUNT.value));}
});
test('real SDK offline oracle reconstructs provenance locally; model emits no hashes or offsets',async()=>{
 const run=await liveMock(oracle,x=>x,{sdk:true}),{r,p}=run.calls[0];assert.equal(run.calls.length,1);assert.equal(run.result.truth.established,true);
 const text=p.messages[1].content;for(const field of ['sha256','observationId','observationSha256','start','end','quote','amountSpan'])assert.equal(text.includes('"'+field+'"'),false);
 assert.equal(p.response_format.json_schema.name,'v3_semantic_unit_v2');assert.ok(Buffer.byteLength(JSON.stringify(p))<10000);
 const o=run.knowledge.observations[0],e=o.evidence.envelope;assert.equal(e.observationId,o.id);assert.equal(e.observationSha256,o.sha256);
 assert.equal(e.offers[0].charges[0].money.amount,0);assert.equal(e.offers[0].charges[0].role,'INTRODUCTORY');assert.equal(e.offers[0].charges[1].money.amount,1080);assert.equal(e.offers[0].charges[1].role,'SUBSEQUENT');assert.equal(e.offers[0].transitions[0].kind,'RECURS_AFTER_INTRO');
 assert.ok(e.offers[0].charges[1].support.every(s=>o.body.slice(s.start,s.end)===s.quote));assert.equal(evaluate(restore(checkpoint(run.knowledge))).prices.JP.propositions.PRICE_AMOUNT.value,1080);
 assert.equal(run.result.truth.prices.JP.propositions.TARGET_MARKET.evidence[0].reference.marketContext.basis,'VERIFIED_COUNTRY_OBSERVATION');
});
for(const [name,mutate] of [
 ['unknown segment',e=>e.charges[1].sources=['s_missing']],['unknown presentation',e=>e.offers[0].presentation='p_missing'],['unknown charge owner',e=>e.charges[1].offer='o_missing'],['unknown relationship endpoint',e=>e.relations[0].to='missing'],['duplicate charge ID',e=>e.charges[1].id=e.charges[0].id],['fabricated numeric text',e=>e.charges[1].amountRef='n_missing'],['partial numeric token',e=>e.charges[1].amount=80],['ambiguous temporal link',e=>e.relations[0].ambiguous=true],['unsupported temporal source',e=>e.relations[0].sources=e.serviceSources],['unbound currency',e=>e.charges[1].currencyText='fabricated']
])test('compact wire rejects '+name+' without ordinary price promotion',async()=>{
 const run=await liveMock(oracle,e=>{mutate(e);return e;});assert.equal(run.result.truth.established,false);assert.notEqual(run.result.truth.prices.JP.propositions.PRICE_AMOUNT.value,1080);
});
for(const field of ['truthState','established','verified','admitted','sufficient','objectiveComplete','confidence'])test('wire rejects authority '+field,async()=>{
 const run=await liveMock(oracle,e=>{e[field]=true;return e;});assert.equal(run.result.truth.established,false);assert.ok(run.result.trace.some(t=>t.code==='WIRE_FIELDS_INVALID'));
});
test('simple strict schema uses only basic supported JSON types and fixed semantic enums',()=>{
 const walk=s=>{for(const key of Object.keys(s))assert.ok(['type','properties','required','additionalProperties','items','enum'].includes(key));if(s.type==='object'){assert.equal(s.additionalProperties,false);assert.deepEqual(s.required,Object.keys(s.properties));Object.values(s.properties).forEach(walk);}if(s.type==='array')walk(s.items);};walk(semanticWireSchema());assert.ok(Buffer.byteLength(JSON.stringify(semanticWireSchema()))<4000);
});
test('provider failure generation is diagnosed locally without retaining raw generation or reasoning',async()=>{
 const input={...fixtureInput(oracle),semantic:{mode:'LIVE'},bounds:{modelCalls:1}};
 const interpret=await createLiveSemanticInterpreter({env,client:{chat:{completions:{create:async()=>{throw Object.assign(Error('PRIVATE_MESSAGE'),{status:400,error:{code:'json_validate_failed',failed_generation:'{"privateReasoning":"PRIVATE_REASONING"}'}});}}}}});
 const {result}=await runTarget({input,interpret,capabilities:offlineCapabilities(input)});const t=result.trace.find(t=>t.status===400);assert.equal(t.diagnostics.wireValidation,'WIRE_FIELDS_INVALID');assert.equal(t.diagnostics.failedGenerationJson,true);assert.equal(JSON.stringify(result).includes('PRIVATE_REASONING'),false);assert.equal(JSON.stringify(result).includes('PRIVATE_MESSAGE'),false);
});
test('production compact wire has no provider/country/currency oracle branch',()=>{
 assert.doesNotMatch(readFileSync(new URL('semantic-wire.mjs',import.meta.url),'utf8'),/Spotify|spotify|Japan|Japanese|\bJPY\b|\bJP\b|1080|1,080/);
});
test('translated compact references reconstruct the full original artifact/index chain',()=>{
 const f=evidenceFixtures.find(f=>f.key==='free-intro'),input=fixtureInput(f),body=input.fixtures.at(-1).body,o={id:'o',format:'WEB',body,sha256:digest(body),contentType:'text/html',url:input.objective.seeds[0]};
 const unit=selectSemanticUnits(o,input.objective)[0],r=evidenceRequest(o,input.objective,unit);
 o.translation={envelope:{schema:'V3_TRANSLATION_V1',observationId:o.id,observationSha256:o.sha256,language:'de',segments:r.material.segments.map(s=>({start:s.start,end:s.end,original:s.text,text:s.text.startsWith('Für Privatkunden:')?'For consumers: membership first EUR 0 for 1 month, then ordinary EUR 12,90 monthly until cancellation.':s.text,status:'FAITHFUL'}))}};
 const request=evidenceRequest(o,input.objective,unit),wire=wireCompletion(wireInput(request),f);wire.charges[1].cadenceText='monthly';
 const e=reconstructWire(request,wire),p=projectEvidence(o,input.objective,e,unit);assert.equal(p.error,undefined);assert.equal(e.translationArtifact,digest(o.translation.envelope));assert.ok(p.bindings['/offers/1'].support.some(s=>s.translated&&s.quote.includes('Privatkunden')));
 o.translation.envelope.segments.at(-1).text='forged';assert.equal(projectEvidence(o,input.objective,e,unit).error,'EVIDENCE_TRANSLATION_BINDING_INVALID');
});
test('compact account relationships survive adapter -> reconstruction -> deterministic evaluation',async()=>{
 const {runResearch}=await import('./engine.mjs');const objective={kind:'SERVICE_QUALIFICATION',serviceId:'library',serviceName:'Library',providerHosts:['provider.example'],markets:[],seeds:['https://provider.example/plans']};
 const body='<title>Library</title><article><a href="https://identity.example/auth">Sign in</a><a href="/account">Account</a><a href="/billing">Subscription controls</a><a href="/cancel">Cancel subscription</a><p>Sign in opens the provider account. In your account, subscription controls manage billing and include cancellation.</p></article>';
 const interpret=await createLiveSemanticInterpreter({env,client:{chat:{completions:{create:async p=>{
  const r=JSON.parse(p.messages[1].content),service=r.segments.find(s=>s.text==='Library'),relation=r.segments.find(s=>s.text.startsWith('Sign in opens'));
  const wire={language:'en',serviceSources:[service.id],serviceAmbiguous:false,offers:[],charges:[],relations:[],accounts:r.destinations.map((d,i)=>({id:'a'+i,destination:d.id,role:['AUTH','ACCOUNT','MANAGE','CANCEL'][i],sources:d.segments,ambiguous:false})),populations:[],accountStatements:[]};
  for(const [from,to,kind] of [['a0','a1','AUTHENTICATES_TO'],['a1','a2','MANAGES_SUBSCRIPTION'],['a2','a3','CANCELS_SUBSCRIPTION']])wire.relations.push({from,to,kind,sources:[...wire.accounts.find(a=>a.id===from).sources,...wire.accounts.find(a=>a.id===to).sources,relation.id],ambiguous:false});
  return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(wire)}}]};
 }}}}});
 const k=await runResearch({objective,permissions:{DIRECT:true},bounds:{actions:1},interpret,capabilities:{DIRECT:a=>({url:a.url,context:a.context,format:'WEB',body,contentType:'text/html',outcome:'OK',httpStatus:200})}});
 const t=evaluate(k);for(const role of ['LOGIN','ACCOUNT','MANAGE','CANCEL'])assert.equal(t.accountAccess[role].state,'ESTABLISHED');assert.equal(t.service.MEMBERSHIP_MANAGEMENT_EXISTS.state,'ESTABLISHED');assert.equal(t.admitted,false);
});
test('source value alternatives are explicitly selected rather than guessed from currency minor digits',()=>{
 const input=fixtureInput(oracle),o={id:'o',format:'WEB',body:'<title>Spotify Premium</title><p>KWD 1,080 monthly subscription</p>',contentType:'text/html',url:input.objective.seeds[0]};o.sha256=digest(o.body);const unit=selectSemanticUnits(o,input.objective)[0],r=evidenceRequest(o,input.objective,unit),i=wireInput(r);
 const wire={language:'en',serviceSources:[i.segments[0].id],serviceAmbiguous:false,offers:[{id:'o1',presentation:i.presentations.at(-1).id,name:'Personal',audience:'CONSUMER',relationship:'SUBSCRIPTION',market:null,marketSources:[],qualifiers:[],ambiguous:false}],charges:[{id:'c1',offer:'o1',sources:[i.segments.at(-1).id],amountRef:i.numbers.find(n=>n.raw==='1,080').id,amount:1080,currency:'KWD',currencyText:'KWD',cadence:'MONTHLY',cadenceText:'monthly',role:'ORDINARY_RECURRING',durationText:null,derivation:'EXPLICIT',qualifiers:[],ambiguous:false}],relations:[],accounts:[],populations:[],accountStatements:[]};
 assert.equal(reconstructWire(r,wire).offers[0].charges[0].money.amount,1080);wire.charges[0].amount=1.08;assert.equal(reconstructWire(r,wire).offers[0].charges[0].money.amount,1.08);
});

test('faithful retained hero presentation crosses the compact SDK boundary with original qualifiers',async()=>{
 const fixture={...oracle,html:'<section><h1>好きなだけ聴ける。Premium Standardを1ヶ月間￥0で体験しよう。</h1><p>キャンペーン終了後も、月額はわずか￥1,080。いつでもキャンセル可能です。</p><p>1ヶ月間￥0、その後は月額￥1,080。 特典は、これまでにPremiumを利用したことがないお客様のみが対象です。</p></section>',plans:oracle.plans.map(p=>({...p,anchor:'好きなだけ聴ける。'}))};
 const run=await liveMock(fixture,e=>{e.offers[0].qualifiers=['これまでにPremiumを利用したことがないお客様のみが対象です。'];return e;},{sdk:true});
 const p=run.result.truth.prices.JP.propositions;assert.equal(run.calls.length,1);assert.equal(p.PRICE_AMOUNT.value,1080);assert.equal(p.CURRENCY.value,'JPY');assert.equal(p.MONTHLY_CADENCE.value,true);assert.equal(p.TARGET_MARKET.value,'JP');assert.equal(run.result.stop.reason,'OBJECTIVE_ESTABLISHED');
 const charge=run.knowledge.observations[0].evidence.envelope.offers[0].charges[0];assert.equal(charge.duration,'1ヶ月');assert.equal(charge.money.amount,0);assert.equal(charge.role,'INTRODUCTORY');assert.ok(p.PRICE_AMOUNT.evidence[0].reference.source.qualifiers.includes('これまでにPremiumを利用したことがないお客様のみが対象です。'));
});
