import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {openMarketRunStore} from '../../research-v1/market-run-store.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const renewal='Plan Basic for 3 months total 5 €; Plan Plus for 3 months total 8 €. After the first 3 months the membership renews monthly at 11.99 EUR/month (Plan Basic) or 21.99 EUR/month (Plan Plus) unless cancelled.';
const intro='Plan Basic for 3 months total 5 €, then 11.99 €/month; Plan Plus for 3 months total 8 €, then 21.99 €/month';
const extra='Plan Plus is included with Membership Other at 0 €/month; Membership Other sold separately at 39 €/month';
const legal=(text,offerMarket)=>({fields:{content:{fields:{legalText:[{fields:{variations:[{fields:{text,...(offerMarket?{country:offerMarket}:{})}}]}}]}}}});
const script=value=>'<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify(value)+'</script>';
function body({visible=false,market=false,offerMarket=null}={}){return (market?'<meta property="og:locale" content="de-DE">':'')+script({props:{pageProps:{...(market?{basePageProps:{country:'DE',market:'de'},metadata:{country:'DE',market:'de',locale:'de-DE'}}:{}),...legal(renewal,offerMarket),repeat:legal(renewal,offerMarket),intro:legal(intro,offerMarket),disclaimer:{officialDisclaimer:extra,...(offerMarket?{country:offerMarket}:{})},noise:{text:renewal,value:renewal,description:'Contact our support team.'},raw:[{amount:0},{amount:11.99}],ambiguous:legal('11.99 €/month (Plan Basic or Plan Plus)')}},...(market?{query:{market:'de'}}:{})})+(visible?[renewal,intro,extra].map(t=>'<p>'+t+'</p>').join(''):'');}
const reported='Nach Ablauf der ersten 3 Monate verlängert sich die Mitgliedschaft automatisch um jeweils 1 Monat zu 12,99 €/Monat (App One) bzw. 28,99 €/Monat (App+), sofern sie nicht zuvor gekündigt wurde.';
for(const scenario of ['embedded','missing-market','missing-authority','valid','reported-exact','reported-prefixed','contractual'])test('real retained interpreter and targeted verifier: '+scenario,()=>{
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'content-model-e2e-')));
 const real=scenario.startsWith('reported-'),values=real?['12.99','28.99']:['11.99','21.99'],names=real?['App One','App+']:['Plan Basic','Plan Plus'],paid=c=>values.includes(c.amountNormalized);
 try{let html=body({visible:!['embedded','contractual'].includes(scenario),market:!['missing-market','contractual'].includes(scenario),offerMarket:scenario==='contractual'?'DE':null});if(real)html=html.replaceAll(renewal,(scenario==='reported-prefixed'?'Informationen zur Mitgliedschaft. ':'')+reported).replaceAll('11.99','12.99').replaceAll('21.99','28.99').replaceAll('Plan Basic','App One').replaceAll('Plan Plus','App+');const bodyHash=hash(html),target={id:'fixture-price-DE',service:'fixture',serviceName:'Fixture',market:'DE',dimension:'pricing',authorities:[{hostname:'provider.example',provider:'Fixture',sourceType:'OFFICIAL_PROVIDER'}]};
 fs.writeFileSync(dir+'/manifest.json',JSON.stringify({version:'RESEARCH_V2_LIVE_V1',id:'synthetic',capabilities:{groq:false,browser:false,providerContact:false},inventory:[target]}));const store=openMarketRunStore(dir+'/journal');try{store.append('V2_ACQUISITION_RESULT',{target,result:{attempts:[{page:{url:'https://provider.example/de/plans',authority:{status:scenario==='missing-authority'?'UNKNOWN':'CONFIGURED_REVIEWED',hostname:'provider.example',provider:'Fixture'},sourceIntegrity:{sha256:bodyHash},rawSource:{text:html}}}]}});}finally{store.close();}
 execFileSync(process.execPath,[path.resolve('services/api/src/research-v2/live/interpret.mjs'),dir],{stdio:'pipe',cwd:dir});execFileSync(process.execPath,[path.resolve('docs/catalog/global-47/research-v2/targeted-frontier-worker.mjs'),dir],{stdio:'pipe',cwd:dir});
 const out=dir+'/interpretation-0001',read=n=>JSON.parse(fs.readFileSync(out+'/'+n+'.json')),discovery=read('discovery/candidates'),monthly=read('monthly/candidates'),plans=read('monthly/monthly-plan-inventory'),report=read('targeted-verification');assert(discovery.filter(paid).length>=2);assert(monthly.filter(c=>paid(c)&&c.prosePriceRelationship).every(c=>names.includes(c.product)));assert(report.sourceChecks.every(s=>s.status==='HASH_VERIFIED'));assert.equal(report.offline.externalNetwork,0);
 if(scenario==='valid'||real||scenario==='contractual'){if(!real&&scenario!=='contractual')for(const amount of ['11.99','21.99'])assert.deepEqual([...new Set(discovery.filter(c=>c.sourceType==='HTML'&&c.amountNormalized===amount).map(c=>c.currencyRaw))].sort(),['EUR','€']);assert.equal(read('complete').monthlyStrong,3);assert.deepEqual(report.verified.map(v=>v.amount).sort(),[...values,'39']);assert(plans.filter(p=>p.strongRecurringMonthly).every(p=>p.monthlyPlanId));}else assert.equal(report.verified.length,0);
 if(scenario==='contractual'){
  const projection=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',`
   import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
   const [dir,repo]=process.argv.slice(1),load=p=>import(pathToFileURL(path.join(repo,p)).href);
   const {retainedPriceReview}=await load('services/api/src/research-v2/live/open-web-discovery.mjs');
   const {writeLifecycleDisposition}=await load('services/api/src/research-v2/inventory/lifecycle-continuation.mjs');
   const {initializeAdaptiveState,assessAdaptiveService}=await load('services/api/src/research-v2/inventory/adaptive-campaign.mjs');
   const observations=JSON.parse(fs.readFileSync(dir+'/interpretation-0001/provider-price-intelligence.json')).observations;
   const verified=JSON.parse(fs.readFileSync(dir+'/interpretation-0001/targeted-verification.json')).verified;
   const t={id:'fixture-price-DE',service:'fixture',serviceName:'Fixture',market:'DE',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},authorities:[{hostname:'provider.example',provider:'Fixture',sourceType:'OFFICIAL_PROVIDER'}],urls:[],verified,reads:[],queries:[],decisions:[],capabilities:{direct:false,tavily:false,decodo:false,browser:false,groq:false}};
   t.retainedPriceReview=retainedPriceReview(dir,t);
   const assessment=assessAdaptiveService(initializeAdaptiveState({targets:[t],conditionalFollowupTargets:[]}),t.service);
   const final=dir+'/final';fs.mkdirSync(final);
   const row=writeLifecycleDisposition({directory:final,handoff:{cohort:{manifest:{serviceIds:['fixture']}},targets:[t]},phases:{pricing:{targets:{[t.id]:t},services:{}}},events:[],bootstrap:[],researchMarkets:{fixture:['DE']},executionComplete:true})[0];
   console.log(JSON.stringify({stop:assessment.stop?.reason,status:row.pricing[0].status,service:row.service_id,observations:observations.filter(o=>['11.99','21.99'].includes(o.amount)&&['Plan Basic','Plan Plus'].includes(o.plan)).map(o=>({amount:o.amount,confidence:o.confidence,suggestion:o.suggestion})),zeroHigh:observations.some(o=>Number(o.amount)===0&&['HIGH','MEDIUM'].includes(o.confidence))}));
  `,dir,process.cwd()],{cwd:dir,encoding:'utf8'}));
  assert.equal(projection.status,'ESTABLISHED');assert.equal(projection.stop,'HIGH_SUFFICIENT');assert.equal(projection.service,'fixture');assert.equal(projection.zeroHigh,false);assert.deepEqual([...new Set(projection.observations.map(o=>o.amount))].sort(),['11.99','21.99']);assert(projection.observations.every(o=>o.confidence==='HIGH'&&o.suggestion.optional&&o.suggestion.editable&&o.suggestion.market==='DE'));
 }
 console.log(JSON.stringify({scenario,discoveryPaid:discovery.filter(paid).length,monthlyPaid:monthly.filter(paid).length,strong:read('complete').monthlyStrong,paidPlans:plans.filter(p=>p.amounts.some(([a])=>values.includes(a))).map(p=>({plan:p.plan,amounts:p.amounts,strong:p.strongRecurringMonthly})),verified:report.verified.map(v=>v.amount)}));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
