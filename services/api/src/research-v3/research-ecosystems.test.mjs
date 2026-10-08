import {firstEstablishedUsage,firstEstablishedAttempts} from './catalog-progress.test-support.mjs';
// Multi-resource OFFLINE sites; semantic annotations describe acquired material.
// Targets contain no destination hints or expected price. No SDK/network IO.
import test from 'node:test';import assert from 'node:assert/strict';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {createLiveSemanticInterpreter} from './live-semantic.mjs';
import {checkpoint,restore,digest,context,createKnowledge} from './model.mjs';
import {evaluate} from './truth.mjs';
import {numericOccurrences} from './semantic-wire.mjs';
import {sourceNumberCandidates} from './numeric-source.mjs';
const root='https://provider.example/';
function proposedSource(r,notes){
 const w={language:'fixture',serviceSources:r.segments.filter(s=>s.text==='Aurora').map(s=>s.id),serviceAmbiguous:false,offers:[],charges:[],relations:[],accounts:[],populations:[],accountStatements:[]};
 for(const [i,note]of notes.entries()){
  const number=r.numbers.find(n=>n.raw===note.raw),s=r.segments.find(s=>s.id===number?.segment);if(!s)continue;
  const p=r.presentations.filter(p=>p.segments.includes(s.id)).at(0),id='offer'+i;
  w.offers.push({id,presentation:p.id,name:note.plan??'Personal',serviceRef:r.knownObservationService?.reference??null,association:'UNKNOWN',audience:'CONSUMER',relationship:'SUBSCRIPTION',marketStatements:[],qualifiers:[],ambiguous:false,availability:{scope:note.only?'SERVICE':'UNKNOWN',choiceSet:note.only?'EXPLICIT_NO_MONTHLY':'UNKNOWN',cadences:note.only?['YEARLY']:[],sources:note.only?p.segments:[]}});
  const currency=r.currencies.find(u=>u.segment===s.id&&u.candidates.includes(note.currency));
  w.charges.push({monetary:{kind:note.equivalent?'EFFECTIVE_COST':note.role==='INTRODUCTORY'?'INTRODUCTORY_SUBSCRIPTION_CHARGE':'SUBSCRIPTION_CHARGE',sources:[s.id],relatedCharge:null,relation:'NONE'},id:'charge'+i,offer:id,sources:p.segments,amountRef:number.id,amount:note.amount,currencyRef:currency?.id??null,currency:note.currency,cadence:note.display??'MONTHLY',cadenceText:null,cadenceSources:[s.id],cadenceKind:'RECURRENCE',role:note.role??'ORDINARY_RECURRING',durationText:null,temporal:{billingCadence:note.billing??'UNKNOWN',billingSources:note.billing?p.segments:[],commitmentText:note.commitment??null,commitmentSources:note.commitment?p.segments:[],priceKind:note.equivalent?'EQUIVALENT':'CHARGE'},derivation:'EXPLICIT',qualifiers:[],ambiguous:false});
 }
 return w;
}
async function site({market='US',currency='USD',labels=['Short choice','Long choice'],stateParameter='selection',navigationCount=12,noAnswer=false,annualOnly=false,commitment=false,intro=false,pricingLabel='Aurora membership choices'}={}){
 const objective={kind:'PRICE',serviceId:'aurora',serviceName:'Aurora',providerHosts:['provider.example'],markets:[market],seeds:[root]};
 const page=t=>'<title>Aurora</title><main>'+t+'</main>';
 const home=page('<nav>'+Array.from({length:navigationCount},(_,i)=>`<a href="/help/article-${i}">Aurora support ${i}</a>`).join('')+'<a href="/surface">'+pricingLabel+'</a><a href="/account">Your account</a></nav><p>Welcome</p>');
 const surface=annualOnly?page(`<section><p>Consumer subscription ${currency} 6.50 / month. Paid once per year. These are all available subscriptions; monthly payment is not offered.</p></section>`):page(`<section><form method="get" action="/variant"><label><input type="radio" name="${stateParameter}" value="small">${labels[0]}</label><label><input type="radio" name="${stateParameter}" value="large" checked>${labels[1]}</label></form><p>Consumer subscription ${currency} 6.50 / month. Paid once per year.</p></section>`);
 const monthly=page(noAnswer?'<p>Client shell. Please run JavaScript.</p>':`<section><h2>Personal</h2><p>Consumer subscription ${intro?'introductory first month '+currency+' 1.00, then ordinary ongoing ':''}${currency} 17.25 charged every month.${commitment?' Contract duration twelve months.':''}</p></section>`);
 const yearly=page(`<section><p>Consumer subscription ${currency} 6.50 / month. Charged once per year.${annualOnly?' These are all available subscriptions; monthly payment is not offered.':''}</p></section>`);
 const rows=[[root,home],['https://provider.example/surface',surface],[`https://provider.example/variant?${encodeURIComponent(stateParameter)}=small`,monthly],[`https://provider.example/variant?${encodeURIComponent(stateParameter)}=large`,yearly],['https://provider.example/account',page('<p>Log in</p>')],...Array.from({length:navigationCount},(_,i)=>['https://provider.example/help/article-'+i,page('<nav><a href="/surface">Membership choices</a></nav><p>Useful help article.</p>')])];
 const notes=[...(intro?[{raw:'1.00',amount:1,currency,billing:'MONTHLY',role:'INTRODUCTORY'}]:[]),{raw:'17.25',amount:17.25,currency,billing:'MONTHLY',commitment:commitment?'Contract duration twelve months.':null},{raw:'6.50',amount:6.5,currency,billing:'YEARLY',equivalent:true}];let adviceCalls=0;
 const input={objective,provider:{reviewed:true,serviceId:objective.serviceId,hosts:objective.providerHosts},permissions:{DECODO:true},bounds:{actions:8,acquisitions:8,countryAcquisitions:8,modelCalls:12},planning:{initialPerspective:'COUNTRY'},semantic:{mode:'LIVE'},fixtures:[{url:root+'robots.txt',transport:'DECODO',country:market,contentType:'text/plain',body:'User-agent: *\nAllow: /'},...rows.map(([url,body])=>({url,body,transport:'DECODO',country:market}))]};
 const interpreter=await createLiveSemanticInterpreter({env:{SAVLIVO_V3_SEMANTIC_MODEL:'offline'},client:{chat:{completions:{create:async p=>{
  const r=JSON.parse(p.messages[1].content);let out;
  if(p.response_format.json_schema.name==='v3_research_advice_v1'){
   adviceCalls++;out={candidates:r.candidates.sort((a,b)=>Number(b.label===pricingLabel)-Number(a.label===pricingLabel)).slice(0,24).map(c=>({candidateId:c.candidateId,role:c.state?'STATE':c.label.includes('support')?'SUPPORT':c.label===pricingLabel?'PRICING':'UNKNOWN',stateIntent:c.label===labels[0]?'MONTHLY_PAYMENT':c.label===labels[1]?'NON_MONTHLY_PAYMENT':'UNKNOWN',needs:r.objectiveNeeds.map(n=>n.proposition)}))};
  }else out=proposedSource(r,notes.map(n=>({...n,only:n.raw==='6.50'&&r.segments.some(s=>s.text.includes('These are all available subscriptions; monthly payment is not offered.'))})));
  return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(out)}}]};
 }}}}});
 const run=await runTarget({input,interpret:interpreter,capabilities:offlineCapabilities(input)});
 return {...run,input,adviceCalls};
}
for(const [market,currency,labels,param]of [
 ['US','USD',['Pay every month','Pay once yearly'],'interval_choice'],
 ['DE','EUR',['Monatliche Zahlung','Jährliche Zahlung'],'zustand'],
 ['JP','JPY',['毎月払い','年間払い'],'選択'],
 ['KR','KRW',['월별 결제','연간 결제'],'옵션'],
 ['BR','BRL',['Pagamento mensal','Pagamento anual'],'opcao'],
 ['NO','NOK',['Betal månedlig','Betal årlig'],'modus']
])test('autonomous provider ecosystem '+market,async()=>{
 const r=await site({market,currency,labels,stateParameter:param,commitment:true});
 assert.equal(r.result.truth.established,true);assert.equal(r.result.truth.eligibility[market].result,'ELIGIBLE');assert.equal(r.result.truth.prices[market].propositions.PRICE_AMOUNT.value,17.25);assert.ok(r.result.trace.some(t=>t.event==='OBSERVATION'&&t.evaluations?.established));assert.equal(firstEstablishedUsage(r.result).acquisitions,3);assert.ok(r.knowledge.destinations.some(d=>d.url.endsWith('=large')));assert.ok(r.knowledge.destinations.some(d=>d.url.endsWith('=small')));assert.ok(!firstEstablishedAttempts(r.knowledge).some(a=>a.action.url?.includes('/help/')));assert.deepEqual(evaluate(restore(checkpoint(r.knowledge))),r.result.truth);assert.notEqual(r.result.catalog.state,'CATALOG_EXHAUSTED');
});
for(const count of [0,8,32,96])test('frontier ecosystem source-state discriminates within finite capacity '+count,async()=>{const r=await site({navigationCount:count});assert.equal(r.result.truth.established,true);assert.equal(firstEstablishedUsage(r.result).acquisitions,3);assert.ok(r.knowledge.workingModel.decisions.length<=128);});
test('client shell cannot become false price or annual-only',async()=>{const r=await site({noAnswer:true});assert.equal(r.result.truth.established,false);assert.equal(r.result.truth.eligibility.US.result,'UNRESOLVED');assert.equal(r.knowledge.observations.some(o=>o.body.includes('Client shell')),true);});
for(const raw of ['١٢٫٩٩','۱۲٫۹۹','１２．９９','१२.९९','𝟙𝟚.𝟡𝟡','1 234,50','١٬٢٣٤٫٥٠'])test('Unicode numeric source normalization preserves occurrence '+raw,()=>{
 const req={observation:{id:'source',sha256:digest(raw)},material:{segments:[{start:0,end:raw.length,text:raw}]}};const n=numericOccurrences(req)[0];assert.equal(n.raw,raw);assert.equal(n.start,0);assert.equal(n.end,raw.length);assert.ok(n.values.includes(raw.includes('234')||raw.includes('٢٣٤')?1234.5:12.99));assert.deepEqual(n.values,sourceNumberCandidates(raw));
});
for(const raw of ['١٢٫٩٩','۱۲٫۹۹','१२.९९'])test('Unicode wire interpretation reaches actual monthly eligibility '+raw,async()=>{
 const body='<title>Aurora</title><main><section><p>Consumer subscription USD '+raw+' charged monthly.</p></section></main>',objective={kind:'PRICE',serviceId:'a',serviceName:'Aurora',providerHosts:['provider.example'],markets:['US'],seeds:[root]};
 const input={objective,provider:{reviewed:true,serviceId:'a',hosts:objective.providerHosts},permissions:{DECODO:true},fixtures:[{url:root+'robots.txt',transport:'DECODO',country:'US',status:404,contentType:'text/plain',body:''},{url:root,transport:'DECODO',country:'US',body}]};
 const interpret=await createLiveSemanticInterpreter({env:{SAVLIVO_V3_SEMANTIC_MODEL:'offline'},client:{chat:{completions:{create:async p=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify(proposedSource(JSON.parse(p.messages[1].content),[{raw,amount:12.99,currency:'USD',billing:'MONTHLY'}]))}}]})}}}});
 const r=await runTarget({input,interpret,capabilities:offlineCapabilities(input)});assert.equal(r.result.truth.established,true,JSON.stringify(r.knowledge.observations.map(o=>({interpretation:o.interpretation,attempts:o.semanticAttempts,fragments:o.evidenceFragments}))));
});

test('introductory monthly charge is never the ordinary recurring monthly charge',async()=>{const r=await site({intro:true});assert.equal(r.result.truth.established,true);assert.equal(r.result.truth.prices.US.propositions.PRICE_AMOUNT.value,17.25);assert.ok(r.result.truth.offers.some(o=>o.propositions.PRICE_AMOUNT.state==='UNRESOLVED'));});
test('explicit complete annual-only provider ecosystem stops ineligible without chasing a monthly answer',async()=>{const r=await site({annualOnly:true});assert.equal(r.result.truth.eligibility.US.result,'INELIGIBLE');assert.notEqual(r.result.catalog.state,'CATALOG_EXHAUSTED');assert.ok(r.result.usage.acquisitions>=2);});

for(const label of ['Aurora 購読の選択','Aurora 구독 옵션','Aurora خيارات الاشتراك','Aurora Abonnementmöglichkeiten'])test('semantic resource roles overcome ambiguous multilingual frontier '+label,async()=>{const r=await site({navigationCount:96,pricingLabel:label});assert.equal(r.result.truth.established,true);assert.equal(firstEstablishedUsage(r.result).acquisitions,3);assert.ok(r.adviceCalls>0);});
