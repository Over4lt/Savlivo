import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {digest} from '../../research-v3/model.mjs';
import {reviewV2CandidateAuthority} from '../../research-v3/v2-candidate-authority-adapter.mjs';
import {lifecycleServiceView} from '../../v2-operations/artifacts.mjs';
import {publishHistory} from '../storage/history.mjs';
import {writeLifecycleDisposition} from './lifecycle-continuation.mjs';

const service='nimbus',serviceName='Nimbus',market='DE',id='nimbus-price-DE',url='https://nimbus.example/about';
const base=extra=>({id,service,serviceName,market,researchObjective:'SERVICE_COVERAGE',authorities:[],reads:[],verified:[],...extra});
const handoff=target=>({cohort:{manifest:{serviceIds:[service]}},targets:[target]});
function output(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lifecycle-authority-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return directory;}
const disposition=(directory,target)=>writeLifecycleDisposition({directory,handoff:handoff(target),phases:{pricing:{targets:{[target.id]:target},services:{}}},events:[],bootstrap:[],researchMarkets:{[service]:[market]},executionComplete:true})[0];
function retained(directory,{tamperBody=false,tamperBinding=false}={}){
 const body=`<script type="application/ld+json">${JSON.stringify({'@type':'Organization',name:serviceName,url:'https://nimbus.example/'})}</script>`,sha256=digest(body),input={contractVersion:1,observationId:'retained-candidate',target:{service,serviceName},page:{url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType:'text/html',truncated:false,bodyHash:sha256,sourceIntegrity:{sha256},rawSource:{text:body},accessDecisions:[{decision:'ALLOWED'}]}},review=reviewV2CandidateAuthority(input),bodyFile=`bodies/${sha256}.txt`,root=path.join(directory,'pricing','targets',id,'open-web-discovery');
 fs.mkdirSync(path.join(root,'bodies'),{recursive:true});fs.writeFileSync(path.join(root,bodyFile),tamperBody?body+'changed':body);
 const binding=structuredClone(review.providerAuthorityBinding);if(tamperBinding)binding.reason='TAMPERED';
 return base({reads:[{url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType:'text/html',truncated:false,bodyHash:sha256,bodyFile,sourceIntegrity:{sha256},accessDecisions:[{decision:'ALLOWED'}],researchRole:'CANDIDATE_AUTHORITY_SOURCE',v3AuthorityReview:{status:'PROVIDER_BOUND',reason:null,binding}}]});
}

test('handoff membership remains visible but cannot establish provider authority',t=>{
 const directory=output(t),target=base(),row=disposition(directory,target);
 assert.equal(row.servicePresence.status,'INCLUDED_IN_HANDOFF');assert.equal(row.providerAuthority.status,'HUMAN_REVIEW_REQUIRED');assert.equal(row.providerAuthority.reason,'PROVIDER_AUTHORITY_UNRESOLVED');assert.equal(row.finalStatus,'HUMAN_REVIEW_REQUIRED');assert(row.humanReview.includes('PROVIDER_AUTHORITY_UNRESOLVED'));
});

test('valid retained autonomous V3 proof is revalidated before lifecycle authority is established',t=>{
 const directory=output(t),row=disposition(directory,retained(directory));
 assert.equal(row.providerAuthority.status,'ESTABLISHED');assert.equal(row.providerAuthority.reason,'V3_AUTONOMOUS_CANDIDATE_REVIEW');assert.deepEqual(row.providerAuthority.hosts,['nimbus.example']);assert.equal(row.servicePresence.status,'INCLUDED_IN_HANDOFF');
});

test('stale body or invalid retained binding cannot project established authority',t=>{
 for(const mutation of [{tamperBody:true},{tamperBinding:true}]){const directory=output(t),row=disposition(directory,retained(directory,mutation));assert.equal(row.providerAuthority.status,'HUMAN_REVIEW_REQUIRED');assert.deepEqual(row.providerAuthority.hosts,[]);}
});

test('historical reviewed authority continues through the existing exact-host predicate',t=>{
 const directory=output(t),target=base({authorities:[{hostname:'nimbus.example',provider:serviceName,sourceType:'OFFICIAL_PROVIDER',checkedAt:'2026-10-10'}]}),row=disposition(directory,target);
 assert.equal(row.providerAuthority.status,'ESTABLISHED');assert.equal(row.providerAuthority.reason,'HISTORICAL_REVIEWED_PROVIDER');assert.deepEqual(row.providerAuthority.hosts,['nimbus.example']);
});

test('report API and history keep service presence separate from exact-host authority',t=>{
 const directory=output(t),row=disposition(directory,base()),view=lifecycleServiceView(row),markdown=fs.readFileSync(path.join(directory,'final-dispositions.md'),'utf8');
 assert.equal(view.servicePresence,'INCLUDED_IN_HANDOFF');assert.equal(view.authority,'HUMAN_REVIEW_REQUIRED');assert.match(markdown,/\| Service \| Presence \| Authority \|/);assert.match(markdown,/INCLUDED_IN_HANDOFF \| HUMAN_REVIEW_REQUIRED/);
 const run='run',runDirectory=path.join(directory,run);fs.mkdirSync(runDirectory);fs.copyFileSync(path.join(directory,'final-dispositions.json'),path.join(runDirectory,'final-dispositions.json'));fs.writeFileSync(path.join(runDirectory,'summary.json'),JSON.stringify({executionComplete:true}));fs.writeFileSync(path.join(runDirectory,'lineage.json'),JSON.stringify({cohort:[service]}));const published=publishHistory(directory,{directory:run}),history=JSON.parse(fs.readFileSync(path.join(directory,published.observations.path),'utf8'));
 assert.equal(history.servicePresence,'INCLUDED_IN_HANDOFF');assert.equal(history.authority,'HUMAN_REVIEW_REQUIRED');
});
