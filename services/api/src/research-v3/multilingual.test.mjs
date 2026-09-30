import test from 'node:test';
import assert from 'node:assert/strict';
import {createSemanticInterpreter,projectSemantic,semanticSchema} from './semantic.mjs';
import {semanticMaterial} from './source.mjs';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {runResearch} from './engine.mjs';
import {evaluate} from './truth.mjs';
import {checkpoint,restore,context,digest} from './model.mjs';

const url='https://provider.example/plans';
const defaults={consumer:true,relationship:'SUBSCRIPTION',cadence:'MONTHLY',role:'ORDINARY',amountDerivation:'EXPLICIT'};
// Annotated model completions, NOT language parsers. Different source expressions
// share one contract and evaluator. No live-model accuracy claim is made here.
const fixtures=[
    {language:'English',market:'US',name:'Harbor',text:'Harbor Personal is a consumer subscription for residents of the United States. The regular charge is USD 14.99 each month and renews monthly until cancelled.',offer:{amount:14.99,currency:'USD',market:'US'}},
    {language:'Norwegian',market:'NO',name:'Fjord',text:'For privatpersoner bosatt i Norge: Fjord-abonnementet koster 149 kroner (NOK) i måneden. Dette er ordinær pris, og abonnementet fornyes hver måned til du sier opp.',offer:{amount:149,currency:'NOK',market:'NO'}},
    {language:'German',market:'DE',name:'Leseraum',text:'Sie wohnen in Deutschland? Unsere Mitgliedschaft Leseraum für Privatkunden verlängert sich monatlich. Der reguläre Mitgliedsbeitrag beträgt 12,90 EUR pro Monat; keine Einführungsaktion.',offer:{amount:12.9,currency:'EUR',market:'DE',relationship:'MEMBERSHIP'}},
    {language:'French',market:'FR',name:'Atelier',text:'Atelier est réservé aux particuliers résidant en France. Sans promotion : 16,50 EUR sont prélevés chaque mois pour votre abonnement, renouvelé mensuellement sauf résiliation.',offer:{amount:16.5,currency:'EUR',market:'FR'}},
    {language:'Portuguese',market:'BR',name:'Leitura',text:'A assinatura Leitura para pessoas físicas residentes no Brasil tem renovação mensal. Após cada mês, a cobrança regular é de R$ 29,90 (BRL). Não se trata de uma oferta de teste.',offer:{amount:29.9,currency:'BRL',market:'BR'}},
    {language:'Japanese',market:'JP',name:'読書室',text:'日本国内にお住まいの個人向け「読書室」定期購読です。通常料金は月額1,400円（JPY）で、解約まで毎月自動更新されます。初回限定料金ではありません。',offer:{amount:1400,currency:'JPY',market:'JP'}},
    {language:'Korean',market:'KR',name:'책마루',text:'대한민국 거주 개인을 위한 책마루 정기 구독입니다. 체험 할인이 아닌 정상 요금은 매월 9,900원(KRW)이며, 해지 전까지 매달 자동 갱신됩니다.',offer:{amount:9900,currency:'KRW',market:'KR'}}
];
const html=f=>`<html><head><title>${f.name}</title></head><body><p>${f.text}</p>${f.extra?'<p>'+f.extra+'</p>':''}</body></html>`;
function inputFor(f,{geo=false,perspective='UNBOUND'}={}) {
    const objective={kind:'PRICE',serviceId:'fixture-service',serviceName:f.name,providerHosts:['provider.example'],markets:[f.market],seeds:[url]};
    return {objective,provider:{reviewed:true,serviceId:objective.serviceId,hosts:objective.providerHosts},permissions:{DIRECT:true,DECODO:geo,TAVILY:false},planning:{initialPerspective:perspective}};
}
function completion(request,f,mutate=x=>x) {
    const support=quote=>{
        const segment=request.material.segments.find(s=>s.text.includes(quote));assert.ok(segment,'fixture quotation is in original material');
        const start=segment.start+segment.text.indexOf(quote);return [{start,end:start+quote.length,quote}];
    };
    const span=support(f.text)[0];
    const presentation=request.material.presentations.filter(p=>p.start<=span.start&&p.end>=span.end).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0].id;
    const claims=[{scope:'SERVICE',field:'serviceId',value:f.serviceId??'fixture-service',status:'EXPLICIT',support:support(f.name)}];
    for(const [field,value] of Object.entries({...defaults,...f.offer}))claims.push({scope:'OFFER',presentation,field,value,status:f.ambiguous?.includes(field)?'AMBIGUOUS':'EXPLICIT',support:support(f.text)});
    for(const [field,value] of Object.entries(f.service??{}))claims.push({scope:'SERVICE',field,value,status:'EXPLICIT',support:support(f.extra)});
    return mutate({schema:semanticSchema,observationId:request.observation.id,observationSha256:request.observation.sha256,language:f.language,claims});
}
async function execute(f,{geoFixture,mutate,config={},extraInput={}}={}) {
    const input={...inputFor(f,config),...extraInput};
    input.fixtures=[{url:'https://provider.example/robots.txt',transport:'DIRECT',contentType:'text/plain',body:'User-agent: *\nAllow: /'},{url,transport:'DIRECT',body:html(f)}];
    if(config.geo)input.fixtures.push({url:'https://provider.example/robots.txt',transport:'DECODO',country:f.market,contentType:'text/plain',body:'User-agent: *\nAllow: /'},{url,transport:'DECODO',country:f.market,body:html(geoFixture??f)});
    const calls=[];
    const interpret=createSemanticInterpreter({model:'offline-annotated',complete:async request=>{calls.push(request);return completion(request,request.observation.context.transport==='DECODO'?geoFixture??f:f,mutate);}});
    if(input.objective.kind==='SERVICE_QUALIFICATION') {
        const knowledge=await runResearch({objective:input.objective,permissions:input.permissions,capabilities:offlineCapabilities(input),interpret});
        return {knowledge,result:{truth:evaluate(knowledge),stop:knowledge.stop},calls};
    }
    return {...await runTarget({input,capabilities:offlineCapabilities(input),interpret}),calls};
}
for(const f of fixtures)test(f.language+': original provider material -> semantic candidates -> one sufficient price',async()=>{
    const {result,knowledge,calls}=await execute(f);
    assert.equal(result.stop.reason,'OBJECTIVE_ESTABLISHED');assert.equal(result.usage.acquisitions,1);
    assert.equal(result.truth.prices[f.market].propositions.PRICE_AMOUNT.value,f.offer.amount);
    assert.equal(calls.length,1);
    const ref=result.truth.prices[f.market].propositions.PRICE_AMOUNT.evidence[0].reference;
    assert.ok(ref.source.fields.every(field=>field.support.every(s=>knowledge.observations[0].body.slice(s.start,s.end)===s.quote&&s.sha256===knowledge.observations[0].sha256)));
    assert.ok(JSON.stringify(ref).includes(f.text));
    assert.ok(result.trace.some(t=>t.event==='SEMANTIC_INTERPRETATION'));
    assert.ok(result.trace.some(t=>t.event==='OBSERVATION'&&t.changes.some(c=>c.to.state==='ESTABLISHED')));
    assert.equal(knowledge.observations[0].interpretation.metadata.language,f.language);
});
const negatives=[
    {label:'German annual / 12',base:2,text:'Leseraum kostet jährlich 120 EUR für Privatkunden in Deutschland. Rechnerisch entspricht das 10 EUR pro Monat, bezahlt wird ausschließlich jährlich.',offer:{amount:10,currency:'EUR',market:'DE',cadence:'YEARLY',amountDerivation:'ARITHMETIC'}},
    {label:'French benefit credit',base:3,text:'En France, les particuliers abonnés à Atelier reçoivent un crédit cadeau de 15 EUR chaque mois. Cette valeur est un avantage et non le prix de l’abonnement.',offer:{amount:15,currency:'EUR',market:'FR',role:'CREDIT'}},
    {label:'Korean installment',base:6,text:'대한민국 개인 고객: 책마루 기기 대금은 매월 9,900원(KRW)씩 12회 분할 납부합니다. 기기 할부이며 정기 구독료가 아닙니다.',offer:{amount:9900,currency:'KRW',market:'KR',relationship:'INSTALLMENT',amountDerivation:'ARITHMETIC'}},
    {label:'Portuguese trial only',base:4,text:'No Brasil, a assinatura pessoal Leitura custa apenas 1 BRL no primeiro mês de teste. O preço regular após o teste não está indicado.',offer:{amount:1,currency:'BRL',market:'BR',role:'TRIAL'}},
    {label:'Japanese zero recurring',base:5,text:'日本国内の個人向け読書室は月額0円（JPY）です。毎月自動更新される無料の定期購読です。',offer:{amount:0,currency:'JPY',market:'JP'}},
    {label:'Norwegian ambiguous cadence',base:1,text:'Fjord tilbyr abonnement for privatpersoner i Norge til ordinær pris 149 NOK. Hvor ofte beløpet trekkes, er ikke oppgitt.',offer:{amount:149,currency:'NOK',market:'NO',cadence:null},ambiguous:['cadence']},
    {label:'English benefit value',base:0,text:'Harbor consumer subscribers in the United States receive benefits worth USD 99 each month. This is a benefit value, not the subscription charge.',offer:{amount:99,currency:'USD',market:'US',role:'BENEFIT'}},
    {label:'German wrong market',base:2,text:'Leseraum für Privatkunden in Österreich kostet regulär 12,90 EUR monatlich. Die Mitgliedschaft verlängert sich jeden Monat.',offer:{amount:12.9,currency:'EUR',market:'AT'}},
    {label:'French unrelated service',base:3,text:'AutreClub propose aux particuliers en France un abonnement mensuel au tarif normal de 16,50 EUR.',offer:{amount:16.5,currency:'EUR',market:'FR'},serviceId:'other-service'}
];
for(const n of negatives)test(n.label+' stays unestablished',async()=>{
    const f={...fixtures[n.base],...n};const {result}=await execute(f);
    assert.equal(result.truth.prices[f.market].established,false);
    assert.notEqual(result.stop.reason,'OBJECTIVE_ESTABLISHED');
});
for(const n of [
    {base:2,text:'Leseraum: Mitgliedschaft für Privatkunden. Regulär 12,90 EUR pro Monat, monatlich erneuert.'},
    {base:4,text:'Leitura: assinatura para pessoas físicas por 29,90 BRL ao mês, com renovação mensal. Preço regular.'},
    {base:5,text:'読書室は個人向け定期購読です。通常月額1,400円（JPY）で毎月自動更新されます。'}
])test(fixtures[n.base].language+' is not market proof, including matching geo',async()=>{
    const f={...fixtures[n.base],text:n.text,offer:{...fixtures[n.base].offer,market:null}};
    const {result}=await execute(f,{config:{geo:true,perspective:'COUNTRY'}});
    assert.equal(result.truth.prices[f.market].propositions.TARGET_MARKET.state,'UNRESOLVED');
    assert.equal(result.truth.prices[f.market].propositions.PRICE_AMOUNT.state,'ESTABLISHED');
});
test('Japanese Direct HTTP 200 -> only market unknown -> same URL Decodo JP -> established; resume retains interpretation',async()=>{
    const full=fixtures[5],partial={...full,text:'読書室は個人向け定期購読です。通常月額1,400円（JPY）で毎月自動更新されます。',offer:{...full.offer,market:null}};
    const {result,knowledge}=await execute(partial,{config:{geo:true},geoFixture:full});
    assert.equal(result.stop.reason,'OBJECTIVE_ESTABLISHED');
    assert.deepEqual(knowledge.attempts[1].action.needs,['JP:TARGET_MARKET']);
    assert.deepEqual(knowledge.observations.map(o=>o.context),[context('DIRECT'),context('DECODO','JP')]);
    assert.deepEqual(evaluate(restore(checkpoint(knowledge))),result.truth);
    let calls=0;const resumed=await runResearch({knowledge:restore(checkpoint(knowledge)),capabilities:{DIRECT:()=>{calls++;},DECODO:()=>{calls++;}}});
    assert.equal(calls,0);assert.equal(resumed.usage.acquisitions,2);
});
test('semantic interpreter does not change Decodo-first policy',async()=>{
    const {knowledge,result}=await execute(fixtures[6],{config:{geo:true,perspective:'COUNTRY'}});
    assert.equal(knowledge.attempts[0].action.context.transport,'DECODO');assert.equal(result.usage.acquisitions,1);
});
test('Norwegian independent service propositions from source-bound candidates',async()=>{
    const f={...fixtures[1],extra:'Fjord har over 120 000 abonnenter totalt for denne tjenesten. Abonnenter kan logge inn på sin konto og administrere abonnementet etter innlogging.',service:{population:{scope:'SERVICE_TOTAL',measure:'SUBSCRIBERS',kind:'LOWER_BOUND',count:120000},login:true,management:true}};
    const input=inputFor(f);input.objective.kind='SERVICE_QUALIFICATION';input.objective.markets=[];
    const {result}=await execute(f,{extraInput:input});
    assert.equal(result.truth.admitted,true);assert.equal(Object.keys(result.truth.service).length,5);
});
for(const [label,mutate] of [
    ['missing source support',r=>{r.claims.find(c=>c.field==='amount').support=[];return r;}],
    ['invented quote',r=>{r.claims.find(c=>c.field==='amount').support[0].quote='not in source';return r;}],
    ['wrong observation hash',r=>({...r,observationSha256:'wrong'})],
    ['wrong observation identity',r=>({...r,observationId:'other'})],
    ['ambiguous conflicting interpretation',r=>{const c=structuredClone(r.claims.find(c=>c.field==='amount'));c.value=100;r.claims.push(c);return r;}],
    ['malformed truth authority',r=>{r.claims[0].state='ESTABLISHED';return r;}],
    ['unsupported arithmetic qualifier cannot disappear',r=>{r.claims.find(c=>c.field==='amountDerivation').support=[];return r;}]
])test(label+' cannot establish price',async()=>{
    const {result}=await execute(fixtures[0],{mutate});assert.equal(result.truth.established,false);
});
test('original body binding is rechecked during evaluation, not only interpretation',async()=>{
    const {knowledge}=await execute(fixtures[0]);knowledge.observations[0].semantic.claims.find(c=>c.field==='amount').support[0].quote='forged';
    assert.equal(evaluate(knowledge).established,false);
});
test('hidden/script source cannot support a candidate; support cannot cross offer presentations',()=>{
    const f=fixtures[0],body=html(f).replace('</body>','<p hidden>secret monthly 1 USD</p><script>fabricated monthly 2 USD</script><p>Different offer</p></body>');
    const o={id:'o',sha256:digest(body),body,contentType:'text/html'};
    const req={observation:o,material:semanticMaterial(o)};
    for(const quote of ['secret monthly 1 USD','fabricated monthly 2 USD','Different offer']) {
        const envelope=completion(req,f);const c=envelope.claims.find(c=>c.field==='amount');c.support=[{quote,start:body.indexOf(quote),end:body.indexOf(quote)+quote.length}];
        const p=projectSemantic(o,{},envelope);assert.equal(p.source.offers[0].amount,null);
    }
});
test('interpretation metadata never stores a model reasoning transcript',async()=>{
    const {knowledge}=await execute(fixtures[0],{mutate:r=>({...r,reasoning:'PRIVATE_TRANSCRIPT',metadata:{reasoning:'PRIVATE_TRANSCRIPT'}})});
    assert.equal(JSON.stringify(knowledge).includes('PRIVATE_TRANSCRIPT'),false);
});
test('bounded async model response rejects oversized, malformed and timeout completions',async()=>{
    for(const complete of [async()=> 'x'.repeat(65537),async()=>'{']) {
        await assert.rejects(createSemanticInterpreter({complete})({body:'',contentType:'text/plain'},{}));
    }
    await assert.rejects(createSemanticInterpreter({complete:()=>new Promise(()=>{}),timeoutMs:5})({body:'',contentType:'text/plain'},{}),/TIMEOUT/);
});
test('Tavily snippets never enter semantic interpretation or establish truth',async()=>{
    const f=fixtures[0],input=inputFor(f);input.objective.seeds=[];input.permissions={DIRECT:false,TAVILY:true,DECODO:false};
    input.discoveries=[{url,content:f.text}];let calls=0;
    const {result}=await runTarget({input,capabilities:offlineCapabilities(input),interpret:()=>{calls++;throw Error('must not interpret search');}});
    assert.equal(calls,0);assert.equal(result.truth.established,false);
});
test('model errors and unsupported support metadata do not enter stored research trace',async()=>{
    await assert.rejects(createSemanticInterpreter({complete:async()=>{throw Error('PRIVATE_PROVIDER_DETAIL');}})({body:'',contentType:'text/plain'},{}),e=>e.message==='SEMANTIC_INTERPRETATION_FAILED');
    const {knowledge,result}=await execute(fixtures[0],{mutate:r=>{r.claims[0].support[0].reasoning='PRIVATE_TRANSCRIPT';return r;}});
    assert.equal(result.truth.established,false);assert.equal(JSON.stringify(knowledge).includes('PRIVATE_TRANSCRIPT'),false);
});
test('discovered French provider destination must be acquired before semantic interpretation',async()=>{
    const f=fixtures[3],input=inputFor(f);input.objective.seeds=[];input.permissions.TAVILY=true;
    input.discoveries=[{url,content:'A search snippet claiming a different price: 1 EUR'}];
    const {result,knowledge,calls}=await execute(f,{extraInput:input});
    assert.equal(result.truth.established,true);assert.equal(result.truth.prices.FR.propositions.PRICE_AMOUNT.value,16.5);
    assert.equal(calls.length,1);assert.equal(knowledge.attempts[0].action.kind,'DISCOVER');assert.equal(knowledge.attempts[1].action.kind,'ACQUIRE');
});
