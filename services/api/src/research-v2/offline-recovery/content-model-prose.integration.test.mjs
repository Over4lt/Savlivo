import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {openMarketRunStore} from '../../research-v1/market-run-store.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const renewal='After the first 3 months the membership renews monthly at 11.99 EUR/month (Plan Basic) or 21.99 EUR/month (Plan Plus) unless cancelled.';
const intro='Plan Basic for 3 months total 5 €, then 11.99 €/month; Plan Plus for 3 months total 8 €, then 21.99 €/month';
const extra='Plan Plus is included with Membership Other at 0 €/month; Membership Other sold separately at 39 €/month';
const legal=text=>({fields:{content:{fields:{legalText:[{fields:{variations:[{fields:{text}}]}}]}}}});
const script=value=>'<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify(value)+'</script>';
function body({visible=false,market=false}={}){return (market?'<meta property="og:locale" content="de-DE">':'')+script({props:{pageProps:{...(market?{basePageProps:{country:'DE',market:'de'},metadata:{country:'DE',market:'de',locale:'de-DE'}}:{}),...legal(renewal),repeat:legal(renewal),intro:legal(intro),officialDisclaimer:extra,noise:{text:renewal,value:renewal,description:'Contact our support team.'},raw:[{amount:0},{amount:11.99}],ambiguous:legal('11.99 €/month (Plan Basic or Plan Plus)')}},...(market?{query:{market:'de'}}:{})})+(visible?[renewal,intro,extra].map(t=>'<p>'+t+'</p>').join(''):'');}
const paid=c=>['11.99','21.99'].includes(c.amountNormalized);
for(const scenario of ['embedded','missing-market','missing-authority','valid'])test('real retained interpreter and targeted verifier: '+scenario,()=>{
 const dir=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'content-model-e2e-')));
 try{const html=body({visible:scenario!=='embedded',market:scenario!=='missing-market'}),bodyHash=hash(html),target={id:'fixture-price-DE',service:'fixture',serviceName:'Fixture',market:'DE',dimension:'pricing',authorities:[{hostname:'provider.example',provider:'Fixture',sourceType:'OFFICIAL_PROVIDER'}]};
 fs.writeFileSync(dir+'/manifest.json',JSON.stringify({version:'RESEARCH_V2_LIVE_V1',id:'synthetic',capabilities:{groq:false,browser:false,providerContact:false},inventory:[target]}));const store=openMarketRunStore(dir+'/journal');try{store.append('V2_ACQUISITION_RESULT',{target,result:{attempts:[{page:{url:'https://provider.example/de/plans',authority:{status:scenario==='missing-authority'?'UNKNOWN':'CONFIGURED_REVIEWED',hostname:'provider.example',provider:'Fixture'},sourceIntegrity:{sha256:bodyHash},rawSource:{text:html}}}]}});}finally{store.close();}
 execFileSync(process.execPath,[path.resolve('services/api/src/research-v2/live/interpret.mjs'),dir],{stdio:'pipe',cwd:dir});execFileSync(process.execPath,[path.resolve('docs/catalog/global-47/research-v2/targeted-frontier-worker.mjs'),dir],{stdio:'pipe',cwd:dir});
 const out=dir+'/interpretation-0001',read=n=>JSON.parse(fs.readFileSync(out+'/'+n+'.json')),discovery=read('discovery/candidates'),monthly=read('monthly/candidates'),plans=read('monthly/monthly-plan-inventory'),report=read('targeted-verification');assert(discovery.filter(paid).length>=2);assert(monthly.filter(c=>paid(c)&&c.prosePriceRelationship).every(c=>['Plan Basic','Plan Plus'].includes(c.product)));assert(report.sourceChecks.every(s=>s.status==='HASH_VERIFIED'));assert.equal(report.offline.externalNetwork,0);
 if(scenario==='valid'){for(const amount of ['11.99','21.99'])assert.deepEqual([...new Set(discovery.filter(c=>c.sourceType==='HTML'&&c.amountNormalized===amount).map(c=>c.currencyRaw))].sort(),['EUR','€']);assert.equal(read('complete').monthlyStrong,3);assert.deepEqual(report.verified.map(v=>v.amount).sort(),['11.99','21.99','39']);assert(plans.filter(p=>p.strongRecurringMonthly).every(p=>p.monthlyPlanId));}else assert.equal(report.verified.length,0);
 console.log(JSON.stringify({scenario,discoveryPaid:discovery.filter(paid).length,monthlyPaid:monthly.filter(paid).length,strong:read('complete').monthlyStrong,paidPlans:plans.filter(p=>p.amounts.some(([a])=>['11.99','21.99'].includes(a))).map(p=>({plan:p.plan,amounts:p.amounts,strong:p.strongRecurringMonthly})),verified:report.verified.map(v=>v.amount)}));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
