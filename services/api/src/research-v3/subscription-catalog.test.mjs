import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createKnowledge,digest,context,checkpoint,restore} from './model.mjs';
import {runResearch,availableActions} from './engine.mjs';
import {evaluate} from './truth.mjs';
import {refreshCatalog,catalogLimits} from './subscription-catalog.mjs';
import {selectSemanticPlan,offeringRoutingValue,semanticUnitLimits,materialForUnit} from './semantic-units.mjs';
import {createEvidenceInterpreter} from './evidence.mjs';
const url='https://provider.example/catalog',objective={kind:'PRICE',serviceId:'lumen',serviceName:'Lumen',providerHosts:['provider.example'],markets:['US'],seeds:[url]};
const offer=(id,extra={})=>({id,amount:19,currency:'USD',cadence:'MONTHLY',billingCadence:'MONTHLY',consumer:true,relationship:'SUBSCRIPTION',role:'ORDINARY',monetaryKind:'SUBSCRIPTION_CHARGE',market:'US',amountDerivation:'EXPLICIT',...extra});
const obs=body=>({id:digest(body),kind:'PROVIDER',format:'WEB',contentType:'text/html',url,body,sha256:digest(body),outcome:'OK',context:context('DIRECT'),httpStatus:200,truncated:false});
const knowledge=source=>{const k=createKnowledge({objective});const body=JSON.stringify(source);k.observations=[{...obs(body),format:'JSON',candidates:[{kind:'SERVICE',pointer:''},...(source.offers??[]).map((_,i)=>({kind:'OFFER',pointer:'/offers/'+i}))]}];return k;};
const complete=offers=>({serviceId:'lumen',offers,catalog:{scope:'SERVICE_MARKET',coverage:'COMPLETE',market:'US',offerIds:offers.map(o=>o.id)}});
for(const position of [0,7,37,100])test('metadata cannot starve unseen offering objects at position '+position,()=>{
 const noise=Array.from({length:position},(_,i)=>({name:'metadata '+i,country:'US',flag:i}));
 const plans=Array.from({length:4},(_,i)=>({title:'Unknown glyph '+i,recurring:true,price:'USD '+(10+i)+' charged monthly',purchase:{href:'/buy/'+i}}));
 const body='<title>Lumen</title><aside>'+ 'irrelevant '.repeat(800)+'</aside><script type="application/json">'+JSON.stringify({noise,plans})+'</script>',o=obs(body),p=selectSemanticPlan(o,objective);
 assert.equal(p.units.length,4);assert.equal(semanticUnitLimits.units,4);
 for(const u of p.units){assert.ok(u.researchValue>=6);assert.match(materialForUnit(o,u).segments.map(s=>s.text).join(''),/Unknown glyph/);}
 assert.equal(p.units.filter(u=>u.presentationIds.length).length,4);
});
test('arbitrary numeric metadata is not an offering routing signal',()=>{assert.equal(offeringRoutingValue(JSON.stringify({count:300,temperature:19,revision:1})),0);});
test('all independently admitted offers remain visible with unknown names',async()=>{
 const offers=['雲の扉','Aurora','Zeta','Λ'].map((id,i)=>offer(id,{amount:20+i}));const k=await runResearch({objective,permissions:{DIRECT:true},capabilities:{DIRECT:a=>({url:a.url,context:a.context,outcome:'OK',body:JSON.stringify({serviceId:'lumen',offers})})}});
 const t=evaluate(k);assert.equal(t.offers.length,4);for(const g of t.offers)assert.equal(g.propositions.PRICE_AMOUNT.state,'ESTABLISHED');assert.equal(k.catalog.state,'CATALOG_UNRESOLVED');assert.equal(k.catalog.offerings.length,4);
});
test('first verified offering does not suppress a second source/family',async()=>{
 const seen=[];const k=await runResearch({objective,permissions:{DIRECT:true},capabilities:{DIRECT:a=>{seen.push(a.url);return {url:a.url,context:a.context,outcome:'OK',body:JSON.stringify({serviceId:'lumen',offers:[offer(a.url===url?'Unseen A':'Unseen B',{amount:a.url===url?11:23})],...(a.url===url?{links:[{url:'/additional',needs:['PRICE_AMOUNT']}]}:{})})};}}});
 assert.deepEqual(seen,[url,'https://provider.example/additional']);assert.equal(evaluate(k).offers.length,2);assert.equal(k.catalog.state,'CATALOG_UNRESOLVED');
});
test('monthly annual and unresolved offerings coexist without sibling leakage',()=>{
 const k=knowledge({serviceId:'lumen',offers:[offer('A',{amount:11}),offer('B',{amount:28,billingCadence:'YEARLY'}),offer('C',{amount:null,billingCadence:'UNKNOWN'})]});const t=evaluate(k);assert.equal(t.offers.length,3);assert.equal(t.offers.find(o=>o.id==='A').propositions.PRICE_AMOUNT.value,11);assert.equal(t.offers.find(o=>o.id==='B').propositions.MONTHLY_SUBSCRIPTION.state,'UNRESOLVED');assert.equal(t.offers.find(o=>o.id==='C').propositions.PRICE_AMOUNT.state,'UNRESOLVED');
});
for(const extra of [{billingCadence:'UNKNOWN'},{billingCadence:'YEARLY',amountDerivation:'ARITHMETIC'},{relationship:'UNKNOWN',consumer:null}])test('insufficient payment/relationship remains unresolved '+JSON.stringify(extra),()=>{assert.equal(evaluate(knowledge({serviceId:'lumen',offers:[offer('unseen',extra)]})).established,false);});
for(const monetaryKind of ['CREDIT','BENEFIT','SAVINGS','TAX','INSTALLMENT'])test('noncharge money cannot become ordinary subscription price '+monetaryKind,()=>{assert.equal(evaluate(knowledge({serviceId:'lumen',offers:[offer('unseen',{monetaryKind})]})).established,false);});
test('annual commitment is independent from actual monthly payment',()=>{assert.equal(evaluate(knowledge({serviceId:'lumen',offers:[offer('unseen',{commitment:'12 months'})]})).established,true);});
test('one collection/page or verified price cannot exhaust catalog',()=>{const k=knowledge({serviceId:'lumen',offers:[offer('unseen')]});refreshCatalog(k,evaluate(k));assert.equal(k.catalog.state,'CATALOG_UNRESOLVED');assert.equal(evaluate(k).established,true);});
test('explicit bounded authoritative catalog may exhaust with unresolved prices',()=>{const k=knowledge(complete([offer('unseen',{amount:null})]));refreshCatalog(k,evaluate(k));assert.equal(k.catalog.state,'CATALOG_EXHAUSTED');assert.equal(evaluate(k).established,false);});
test('incomplete choice membership cannot certify completeness',()=>{const s=complete([offer('A'),offer('B')]);s.catalog.offerIds=['A'];const k=knowledge(s);refreshCatalog(k,evaluate(k));assert.equal(k.catalog.state,'CATALOG_UNRESOLVED');});
test('catalog source scope cannot escape service/market',()=>{for(const field of ['market','scope']){const s=complete([offer('A')]);s.catalog[field]='OTHER';const k=knowledge(s);refreshCatalog(k,evaluate(k));assert.equal(k.catalog.state,'CATALOG_UNRESOLVED');}});
test('incomplete annual discovery cannot establish service-wide annual-only',()=>{const k=knowledge({serviceId:'lumen',offers:[offer('annual',{billingCadence:'YEARLY'})]});refreshCatalog(k,evaluate(k));assert.equal(k.catalog.state,'CATALOG_UNRESOLVED');assert.equal(evaluate(k).eligibility.US.result,'UNRESOLVED');});
test('capacity access and malformed sources never manufacture completeness',()=>{
 for(const stop of [{reason:'CAPACITY_BOUND_REACHED'},{reason:'SEMANTIC_EXHAUSTION'}]){const k=knowledge({serviceId:'lumen',offers:[offer('A')]});k.stop=stop;if(stop.reason==='SEMANTIC_EXHAUSTION')k.policyBlocks=[{scope:'ORIGIN',value:'https://provider.example'}];refreshCatalog(k,evaluate(k));assert.equal(k.catalog.state,stop.reason==='CAPACITY_BOUND_REACHED'?'CAPACITY':'ACCESS');}
 const k=knowledge(complete([offer('A')]));k.observations[0].truncated=true;refreshCatalog(k,evaluate(k));assert.equal(k.catalog.state,'CATALOG_UNRESOLVED');
});
test('catalog inventory remains bounded and checkpoint-reproducible',()=>{const k=knowledge({serviceId:'lumen',offers:Array.from({length:200},(_,i)=>offer(String(i)))});refreshCatalog(k,evaluate(k));assert.equal(k.catalog.offerings.length,catalogLimits.offerings);assert.equal(k.catalog.state,'CAPACITY');assert.deepEqual(restore(checkpoint(k)).catalog,k.catalog);});
test('retained Norway source processes all four offerings through production selection and evidence admission',async()=>{
 const body=readFileSync(new URL('fixtures/spotify-norway-retained.html',import.meta.url),'utf8'),notes=JSON.parse(readFileSync(new URL('fixtures/spotify-norway-annotations.json',import.meta.url),'utf8'));
 const target={kind:'PRICE',serviceId:'spotify',serviceName:'Spotify',providerHosts:['www.spotify.com'],markets:['NO'],seeds:['https://www.spotify.com/no-nb/premium/']};let calls=0;
 const interpret=createEvidenceInterpreter({native:false,complete:r=>{calls++;const selected=notes.offers.filter(v=>r.unit.presentationIds.includes(v.presentation));return {...notes,observationId:r.observation.id,observationSha256:r.observation.sha256,offers:selected};}});
 const k=await runResearch({objective:target,permissions:{DECODO:true},bounds:{modelCalls:4},interpret,capabilities:{DECODO:a=>({url:a.url,context:a.context,format:'WEB',contentType:'text/html',httpStatus:200,outcome:'OK',body,transport:{verification:'BRACKET_VERIFIED',requestedCountry:'NO',verifiedCountry:'NO'}})}});
 const t=evaluate(k),amounts=t.offers.filter(g=>g.propositions.PRICE_AMOUNT.state==='ESTABLISHED').map(g=>g.propositions.PRICE_AMOUNT.value).sort((a,b)=>a-b);
 assert.deepEqual(amounts,[75,139,189,219]);assert.equal(calls,4);assert.equal(t.eligibility.NO.result,'ELIGIBLE');assert.notEqual(k.catalog.state,'CATALOG_EXHAUSTED');assert.equal(t.offers.filter(g=>g.propositions.PRICE_AMOUNT.value===0).length,0);assert.deepEqual(evaluate(restore(checkpoint(k))),t);
});
test('more than one semantic batch processes independent unknown offerings after a first established result',async()=>{
 const notes=JSON.parse(readFileSync(new URL('fixtures/spotify-norway-annotations.json',import.meta.url),'utf8'));
 const objects=Array.from({length:8},(_,i)=>{const v=JSON.parse(notes.offers[i%4].support[0].quote);v.header='Unseen offering '+i;return v;});
 const body='<title>Spotify</title><script type="application/json">'+JSON.stringify({collections:objects})+'</script>';
 const target={kind:'PRICE',serviceId:'spotify',serviceName:'Spotify',providerHosts:['www.spotify.com'],markets:['NO'],seeds:['https://www.spotify.com/controlled']};
 const calls=[];const interpret=createEvidenceInterpreter({native:false,complete:r=>{
   calls.push(r.unit.id);const s=r.material.segments.find(s=>s.text.startsWith('{')),p=r.material.presentations.find(p=>p.start===s.start&&p.end===s.end),index=objects.findIndex(v=>JSON.stringify(v)===s.text);
   // Mock semantic understanding only: the engine receives no plan names or answers.
   const v=structuredClone(notes.offers[index%4]),support={start:s.start,end:s.end,quote:s.text,translated:null};v.presentation=p.id;v.name=objects[index].header;
   v.support=[support];for(const c of v.charges){c.support=[support];c.monetary.support=[support];c.temporal.billingSupport=c.temporal.billingSupport.length?[support]:[];c.payment.support=c.payment.support.length?[support]:[];const at=s.text.indexOf(c.money.amountText);c.money.amountSpan={start:s.start+at,end:s.start+at+c.money.amountText.length,quote:c.money.amountText};}
   for(const t of v.transitions)t.support=[support];
   return {...notes,observationId:r.observation.id,observationSha256:r.observation.sha256,service:{...notes.service,support:[{start:7,end:14,quote:'Spotify',translated:null}]},offers:[v]};
 }});
 const k=await runResearch({objective:target,permissions:{DECODO:true},bounds:{acquisitions:1},interpret,capabilities:{DECODO:a=>({url:a.url,context:a.context,outcome:'OK',format:'WEB',contentType:'text/html',httpStatus:200,body,transport:{verification:'BRACKET_VERIFIED',requestedCountry:'NO',verifiedCountry:'NO'}})}});
 assert.equal(calls.length,8);assert.equal(new Set(calls).size,8);assert.equal(k.usage.acquisitions,1);assert.equal(k.usage.inspections,1);assert.equal(evaluate(k).offers.filter(g=>g.propositions.PRICE_AMOUNT.state==='ESTABLISHED').length,8);assert.equal(k.catalog.state,'CAPACITY');
});
