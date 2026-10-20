import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {openMarketRunStore,readMarketRunRecords} from '../../research-v1/market-run-store.mjs';
import {retainSharedSourceBody} from '../storage/shared-body.mjs';
import {interpretRun} from './runner.mjs';
import {verifyRetainedRun} from './module-stage.mjs';
import {interpretDirectProvider,validateDirectProviderPage,evaluateDirectProviderTruth} from './direct-provider-evidence.mjs';

const hash=text=>createHash('sha256').update(text).digest('hex');
const url='https://provider.example/us/pricing';
const body='<html><head><meta property="og:locale" content="en-US"></head><body><article><h2>Personal</h2><p>USD 12/month</p></article><script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{basePageProps:{country:'US',market:'us'},metadata:{country:'US',market:'us',locale:'en-US'}}},query:{market:'us'}})+'</script><!--'+'x'.repeat(1200000)+'--></body></html>';
const target={id:'lumen-price-US',service:'lumen',serviceName:'Lumen',market:'US',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[url],authorities:[{hostname:'provider.example',provider:'Lumen',sourceType:'OFFICIAL_PROVIDER',sourceUrl:url,checkedAt:'2026-10-20T00:00:00.000Z'}],gaps:['amount'],reads:[],queries:[],decisions:[],capabilities:{direct:true,tavily:false,decodo:false,browser:false,groq:false}};
function source(directory){
 fs.mkdirSync(directory,{recursive:true});
 const retained=retainSharedSourceBody(directory,body,hash(body));
 return {url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType:'text/html',truncated:false,...retained,sourceIntegrity:{sha256:hash(body)},accessDecisions:[{decision:'ALLOWED'}],authority:{status:'CONFIGURED_REVIEWED',hostname:'provider.example',provider:'Lumen'}};
}
async function inlineRun(directory,page){
 const retained=validateDirectProviderPage({target,page,directory}),v3=evaluateDirectProviderTruth({target,retained});
 const runDirectory=path.join(directory,'direct-acquisitions','direct-inline');fs.mkdirSync(runDirectory,{recursive:true});
 fs.writeFileSync(path.join(runDirectory,'manifest.json'),JSON.stringify({version:'RESEARCH_V2_LIVE_V1',id:'direct-inline',createdAt:'2026-10-20T00:00:00.000Z',inventory:[target],capabilities:{decodo:false,groq:false,browser:false,providerContact:false,productionVerified:false},productionVerified:false}));
 const store=openMarketRunStore(path.join(runDirectory,'journal'));
 try{store.append('V2_ACQUISITION_RESULT',{target,result:{outcome:'OBSERVED',attempts:[{id:'direct-inline',method:'DIRECT_PUBLIC',outcome:'OBSERVED',page:retained}]}});}finally{store.close();}
 await interpretRun(runDirectory);const verification=await verifyRetainedRun(runDirectory);
 return {runDirectory,v3,verification};
}
function measured(root,runDirectories){
 const paths=[];
 const visit=directory=>{if(!fs.existsSync(directory))return;for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())visit(file);else if(entry.isFile())paths.push(file);}};
 visit(path.join(root,'research-v2','storage','blobs'));
 visit(path.join(root,'research-v1','shared-checkpoint-objects'));
 for(const directory of runDirectories){visit(path.join(directory,'bodies'));visit(path.join(directory,'direct-acquisitions',fs.readdirSync(path.join(directory,'direct-acquisitions'))[0],'journal'));
 }
 const inodes=new Map();for(const file of paths){const stat=fs.statSync(file);inodes.set(`${stat.dev}:${stat.ino}`,stat.blocks*512);}
 return {allocatedBytes:[...inodes.values()].reduce((sum,n)=>sum+n,0),uniqueInodes:inodes.size,paths:paths.length};
}
test('Direct journal object mode preserves replay and V3 results while sharing identical source bytes',async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'direct-journal-objects-'));t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const baselineRoot=path.join(temp,'baseline','.savlivo'),newRoot=path.join(temp,'object-mode','.savlivo');
 const baselineDirectories=[],newDirectories=[];
 for(let i=0;i<2;i++){
  const baselineDirectory=path.join(baselineRoot,'runs',String(i)),newDirectory=path.join(newRoot,'runs',String(i));
  const before=await inlineRun(baselineDirectory,source(baselineDirectory));
  const after=await interpretDirectProvider({target,page:source(newDirectory),directory:newDirectory});
  baselineDirectories.push(baselineDirectory);newDirectories.push(newDirectory);
  const beforeRecord=readMarketRunRecords(path.join(before.runDirectory,'journal'))[0];
  const afterRecord=readMarketRunRecords(path.join(after.runDirectory,'journal'))[0];
  const beforePage=beforeRecord.payload.result.attempts[0].page,afterPage=afterRecord.payload.result.attempts[0].page;
  assert.equal(afterPage.rawSource.text,body);assert.equal(afterPage.bodyHash,hash(body));
  assert.deepEqual({url:afterPage.url,hash:afterPage.sourceIntegrity.sha256,market:afterRecord.payload.target.market,authority:afterPage.authority},
   {url:beforePage.url,hash:beforePage.sourceIntegrity.sha256,market:beforeRecord.payload.target.market,authority:beforePage.authority});
  assert.deepEqual(after.v3Truth,before.v3.v3Truth);assert.deepEqual(after.v3Observation,before.v3.v3Observation);
  const semantic=rows=>rows.map(({monthlyPlanId,canonicalKey,market,service,plan,amount,currency,cadenceFamily,billingInterval,commercialType,sourceHashes,blockers,status})=>({monthlyPlanId,canonicalKey,market,service,plan,amount,currency,cadenceFamily,billingInterval,commercialType,sourceHashes,blockers,status}));
  assert.deepEqual(semantic(after.verified),semantic(before.verification.verified));
  assert.equal(after.verified.length,1);assert.equal(after.verified[0].amount,'12');assert.equal(after.verified[0].currency,'USD');
  assert.equal(after.v3Truth.established,false,'Direct does not fabricate a country-bound G1 receipt');
  const raw=JSON.parse(fs.readFileSync(path.join(after.runDirectory,'journal','record-00000001.json')));
  assert.equal(raw.payload.$checkpointObjects,1);assert.equal(JSON.stringify(raw).includes(body),false);
 }
 const before=measured(baselineRoot,baselineDirectories),after=measured(newRoot,newDirectories);
 assert(after.allocatedBytes<before.allocatedBytes,JSON.stringify({before,after}));
 const shared=path.join(newRoot,'research-v1','shared-checkpoint-objects');const objectFiles=[];
 const visit=directory=>{for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())visit(file);else objectFiles.push(file);}};visit(shared);
 const localObjects=newDirectories.map(directory=>{const child=path.join(directory,'direct-acquisitions',fs.readdirSync(path.join(directory,'direct-acquisitions'))[0],'journal','.objects');return fs.readdirSync(child).map(name=>path.join(child,name));});
 assert(localObjects[0].length>0);assert.deepEqual(localObjects[0].map(file=>path.basename(file)),localObjects[1].map(file=>path.basename(file)));
 for(const [index,file] of localObjects[0].entries()){const a=fs.statSync(file),b=fs.statSync(localObjects[1][index]);assert.equal(a.ino,b.ino);assert.equal(a.dev,b.dev);assert.equal(a.mode&0o222,0);}
 t.diagnostic(JSON.stringify({baseline:before,objectMode:after,physicalSavedBytes:before.allocatedBytes-after.allocatedBytes,sharedObjects:objectFiles.length}));
});
