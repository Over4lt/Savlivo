import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {openMarketRunStore} from '../../research-v1/market-run-store.mjs';
import {planResearch} from '../live/research-planner.mjs';
import {runOpenWebResearch} from '../live/open-web-discovery.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex'),repo=process.cwd();
const caps={direct:false,decodo:true,tavily:false,browser:false,groq:false};
const target={id:'fixture-price-DE',service:'fixture',serviceName:'Fixture',market:'DE',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},capabilities:caps,authorities:[{hostname:'provider.example',provider:'Fixture',sourceType:'OFFICIAL_PROVIDER',checkedAt:new Date().toISOString()}],urls:['https://provider.example/plans']};
const sentence='After the first 3 months the membership renews monthly at 11.99 EUR/month (Plan Basic) or 21.99 EUR/month (Plan Plus) unless cancelled.';
const price='<html lang="de"><body><script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({fields:{legalText:[{fields:{variations:[{fields:{text:sentence}}]}}]}})+'</script><a href="/membership-terms">Country availability and membership terms</a></body></html>';
const market=text=>'<html><body><section>'+text+'<a href="/plans">Membership pricing</a></section></body></html>';
function fixture(t){const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'market-proof-')));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));let n=0;
 return {root,run(body,{url='https://provider.example/plans',previous=null,age=0,change={}}={}){const dir=root+'/acq-'+(++n),tgt={...target,...change,...(previous?{marketProof:previous}:{})};fs.mkdirSync(dir);fs.writeFileSync(dir+'/manifest.json',JSON.stringify({version:'RESEARCH_V2_LIVE_V1',id:'test-'+n,inventory:[tgt],capabilities:{groq:false,browser:false,providerContact:false}}));const store=openMarketRunStore(dir+'/journal');try{store.append('V2_ACQUISITION_RESULT',{target:tgt,result:{attempts:[{page:{url,authority:{status:'CONFIGURED_REVIEWED',hostname:'provider.example',provider:'Fixture'},sourceIntegrity:{sha256:sha(body),checkedAt:new Date(Date.now()-1000-age).toISOString()},rawSource:{text:body}}}]}});}finally{store.close();}
 for(const entry of ['services/api/src/research-v2/live/interpret.mjs','docs/catalog/global-47/research-v2/targeted-frontier-worker.mjs'])execFileSync(process.execPath,entry.endsWith('/interpret.mjs')?['--input-type=module','-e',"import {interpret} from '"+repo+"/"+entry+"'; interpret(process.argv[1]);",dir]:[repo+'/'+entry,dir],{cwd:root,stdio:'pipe'});
 const out=dir+'/interpretation-0001',read=n=>JSON.parse(fs.readFileSync(out+'/'+n+'.json'));return {dir,read,proof:read('market-proof-research').targets[target.id],report:read('targeted-verification'),observations:read('provider-price-intelligence').observations};}};
}
const pending=x=>x.proof.objectives.filter(o=>o.status==='MARKET_NOT_VERIFIED');
test('real price → market objective → independent Decodo → joined verifier; no Direct/Tavily calls',async t=>{
 const f=fixture(t),a=f.run(price);assert.equal(a.report.verified.length,0);assert.equal(pending(a).length,2);assert(a.proof.leads.some(l=>l.url.endsWith('/membership-terms')));
 const next={...target,marketProof:a.proof,urls:a.proof.leads.map(l=>l.url),gaps:['market'],retainedPriceReview:{sourceBound:true,confidence:'HIGH',amount:'11.99',currency:'EUR',market:null,objective:'SERVICE_COVERAGE',sourceHash:sha(price)}};
 const plan=planResearch(next);assert.equal(plan.route,'DECODO');assert.equal(plan.objective,'MARKET_PROOF');assert.equal(plan.reason,'DIRECT_PROHIBITED_DECODO_PERMITTED');
 let calls=0;const forbidden=async()=>{throw Error('FORBIDDEN_NETWORK');};
 const state=await runOpenWebResearch({directory:f.root+'/controller',targets:[next],maxActions:1,read:forbidden,search:forbidden,classify:async()=>({eligible:true}),acquire:async args=>{calls++;assert.equal(args.route,'DECODO');const b=f.run(market('<p>Plan Basic is available in Germany.</p><p>Plan Plus is available in Germany.</p>'),{url:args.candidate.url,previous:args.target.marketProof});assert.deepEqual(b.report.verified.map(v=>v.amount).sort(),['11.99','21.99']);assert(b.report.verified.every(v=>v.fields.market.status==='VERIFIED'));return {runDirectory:b.dir,verified:b.report.verified,classification:'VERIFIED_OUTPUT'};}});
 assert.equal(calls,1);assert.equal(state.usage.reads,0);assert.equal(state.usage.searches,0);assert.equal(state.usage.acquisitions,1);assert.equal(state.targets[0].verified.length,2);
});
for(const [name,text,expected] of [
 ['locale and currency only','<p>EUR Deutsch DE</p>',[]],
 ['service only','<p>Fixture is available in Germany.</p>',[]],
 ['one plan only','<p>Plan Basic is available in Germany.</p>',['11.99']],
 ['negative','<p>Plan Basic is not available in Germany.</p><p>Plan Plus is not available in Germany.</p>',[]],
 ['wrong market','<p>Plan Basic is available in France.</p>',[]],
 ['conflict','<p>Plan Basic is available in Germany.</p><p>Plan Basic is not available in Germany.</p>',[]],
 ['qualified assertion cannot silently widen scope','<p>Plan Basic is available in Germany for selected customers.</p>',[]]
])test('persisted cross-source market proof: '+name,t=>{const f=fixture(t),a=f.run(price),b=f.run(market(text),{url:'https://provider.example/de-DE/membership-terms',previous:a.proof});assert.deepEqual(b.report.verified.map(v=>v.amount).sort(),expected);if(name==='negative'){assert(b.proof.objectives.every(o=>o.status==='MARKET_CONTRADICTED'));assert.equal(planResearch({...target,marketProof:b.proof}).reason,'MARKET_CONTRADICTED');}if(name==='locale and currency only')assert(b.observations.filter(o=>['11.99','21.99'].includes(o.amount)).every(o=>o.fields.market.blocker==='MARKET_NOT_INDEPENDENTLY_VERIFIED'));});
test('explicit same-source assertion and included zero do not merge products',t=>{const f=fixture(t),a=f.run(price+'<p>Plan Basic is available in Germany.</p><p>Plan Basic is included with Membership Other at 0 €/month</p>');assert.deepEqual(a.report.verified.map(v=>v.amount),['11.99']);assert(a.observations.filter(o=>Number(o.amount)===0).every(o=>o.confidence==='LOW'));});
test('stale or invalidated source cannot be joined',t=>{const f=fixture(t),a=f.run(price,{age:31*86400000});assert.equal(a.proof.objectives.length,0);const fresh=f.run(price),b=f.run(market('<p>Plan Basic is available in Germany.</p>'),{url:'https://provider.example/terms',previous:fresh.proof,change:{invalidatedEvidence:[sha(price)]}});assert.equal(b.report.verified.length,0);});
test('unlinked source cannot assert applicability of a same-named offer',t=>{const f=fixture(t),a=f.run(price),b=f.run('<p>Plan Basic is available in Germany.</p>',{url:'https://provider.example/terms',previous:a.proof});assert.equal(b.report.verified.length,0);});
test('annual and qualified commitments keep interval and terms after market joining',t=>{const f=fixture(t);
 for(const [name,text,amount,interval] of [['Premium','EUR 99/year','99','P1Y'],['Membership','29 € im Monat. 12 Monate Mindestlaufzeit','29','P1M']]){
  const a=f.run('<article><h2>'+name+'</h2><p>'+text+'</p></article><a href="/terms">Membership terms</a>');assert.equal(pending(a).length,1);
  const b=f.run(market('<p>'+name+' is available in Germany.</p>'),{url:'https://provider.example/terms',previous:a.proof});
  const o=b.observations.find(o=>o.plan===name&&o.amount===amount);assert.equal(o.confidence,'HIGH');assert.equal(o.market,'DE',JSON.stringify(o.fields.market));assert.equal(o.billingInterval.normalized,interval);if(name==='Membership')assert.equal(o.commitment.value,12);
 }
});
test('supporting market hash and freshness remain dependencies of retained eligibility',async t=>{const {currentlyEligibleProviderPrice,retainedPricingSummary}=await import('../intelligence/recurring-price-eligibility.mjs');const f=fixture(t),a=f.run(price),text=market('<p>Plan Basic is available in Germany.</p>'),b=f.run(text,{url:'https://provider.example/terms',previous:a.proof}),o=b.observations.find(o=>o.amount==='11.99');
 assert.equal(o.confidence,'HIGH');assert(o.sourceHashes.includes(sha(text)));const summary=retainedPricingSummary(target,[o],{});assert(summary);assert.equal(currentlyEligibleProviderPrice(summary,{...target,invalidatedEvidence:[sha(text)]}),false);assert.equal(currentlyEligibleProviderPrice({...summary,marketProofDependencies:[{sourceHash:sha(text),capturedAt:'2020-01-01'}]},target),false);
});
for(const [name,wrap] of [['hidden',s=>'<div hidden>'+s+'</div>'],['example',s=>'<blockquote>'+s+'</blockquote>'],['archived',s=>'<section><h2>Archived offers</h2>'+s+'</section>']])test('market statement in '+name+' context is not proof',t=>{const f=fixture(t),a=f.run(price),b=f.run(market(wrap('<p>Plan Basic is available in Germany.</p>')),{url:'https://provider.example/terms',previous:a.proof});assert.equal(b.report.verified.length,0);});
