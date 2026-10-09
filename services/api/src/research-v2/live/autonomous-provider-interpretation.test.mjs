import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {digest} from '../../research-v3/model.mjs';
import {reviewV2CandidateAuthority} from '../../research-v3/v2-candidate-authority-adapter.mjs';
import {runOpenWebResearch} from './open-web-discovery.mjs';
import {interpretDirectProvider} from './direct-provider-evidence.mjs';
import {admittedDiscoveryCandidate} from './tavily-discovery.mjs';
import {autonomousProviderAuthorityDecision,installRunScopedV3ProviderAuthority} from './provider-routing-authority.mjs';

const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'autonomous-provider-stack-')));after(()=>fs.rmSync(root,{recursive:true,force:true}));
const name='Lumen',service='lumen',host='provider.example',candidateUrl=`https://${host}/membership`,providerUrl=`https://${host}/us/pricing`;
const candidateBody=`<html><script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@type':'Organization',name,url:`https://${host}`})}</script><main><h1>${name} membership</h1><a href="/us/pricing">Pricing</a></main></html>`;
const providerBody='<html><head><meta property="og:locale" content="en-US"></head><body><article><h2>Personal</h2><p>USD 12/month</p></article><script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{pageProps:{basePageProps:{country:'US',market:'us'},metadata:{country:'US',market:'us',locale:'en-US'}}},query:{market:'us'}})+'</script></body></html>';
const target=()=>({id:'lumen-price-US',service,serviceName:name,market:'US',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[],authorities:[],gaps:['amount'],reads:[],queries:[],decisions:[],capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false}});
const ok=(url,body)=>({url,outcome:'OK',httpStatus:200,contentType:'text/html',body,sourceIntegrity:{sha256:digest(body)},accessDecisions:[{decision:'ALLOWED'}]});
const events=directory=>fs.readFileSync(path.join(directory,'journal.jsonl'),'utf8').trim().split('\n').map(JSON.parse);

function coldStart(directory,extra={}){
 const calls=[];
 return {calls,args:{directory,targets:[target()],maxActions:1,search:async()=>{calls.push('SEARCH');return {results:[{url:candidateUrl,title:`${name} official membership`}]};},read:async({url})=>{if(url===candidateUrl){calls.push('CANDIDATE_READ');return ok(url,candidateBody);}calls.push('PROVIDER_READ');assert.equal(url,providerUrl);return ok(url,providerBody);},classify:async()=>assert.fail('historical classifier must not replace autonomous authority'),...extra}};
}

test('autonomous exact-host provider source enters the existing interpretation and verifier stack',async t=>{
 const directory=fs.mkdtempSync(path.join(root,'autonomous-provider-interpretation-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const f=coldStart(directory,{consumeProvider:interpretDirectProvider});
 const searched=await runOpenWebResearch(f.args);assert.equal(searched.targets[0].verified.length,0);
 const bound=await runOpenWebResearch(f.args);assert.equal(bound.targets[0].verified.length,0,'candidate authority is not price Truth');
 const state=await runOpenWebResearch(f.args),current=state.targets[0],interpretation=current.providerInterpretations[0];
 assert.deepEqual(f.calls,['SEARCH','CANDIDATE_READ','PROVIDER_READ']);assert.equal(current.authorities.length,0,'run-scoped authority does not become historical target authority');assert.equal(current.reads[1].researchRole,'PROVIDER_SOURCE');assert.equal(current.decisions.at(-1).reason,'V3_AUTONOMOUS_FIRST_PARTY_PRESENTATION');
 const verification=JSON.parse(fs.readFileSync(path.join(interpretation.runDirectory,'interpretation-0001','targeted-verification.json')));assert.equal(current.verified.length,1,JSON.stringify({interpretation,verification}));assert.equal(current.verified[0].amount,'12');assert.equal(current.verified[0].currency,'USD');assert.equal(interpretation.classification,'VERIFIED_OUTPUT');assert(interpretation.runDirectory);
 const manifest=JSON.parse(fs.readFileSync(path.join(interpretation.runDirectory,'manifest.json')));assert.equal(manifest.inventory[0].authorities.length,1);assert.equal(manifest.inventory[0].authorities[0].discoveryDomainBinding.authorityScope,'EXACT_HOST_PROVIDER_SOURCING');
 const journal=events(directory);assert(journal.some(e=>e.type==='V3_PROVIDER_SOURCE_RETAINED'));assert(journal.some(e=>e.type==='PROVIDER_INTERPRETATION'&&e.outcome.classification==='VERIFIED_OUTPUT'));assert(journal.some(e=>e.type==='ACQUISITION_ESCALATION_REVIEW'&&e.decision.eligible===false));
});

test('autonomous provider transient failure uses the existing bounded acquisition escalation review',async t=>{
 const directory=fs.mkdtempSync(path.join(root,'autonomous-provider-escalation-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));let acquisitions=0;const f=coldStart(directory);
 f.args.targets[0].capabilities.decodo=true;f.args.read=async({url})=>url===candidateUrl?ok(url,candidateBody):{url,outcome:'UNRESOLVED',failure:{code:'TIMEOUT'},accessDecisions:[{decision:'ALLOWED'}]};
 f.args.consumeProvider=async({target,candidate,page})=>{const admitted=admittedDiscoveryCandidate(candidate,target);assert.equal(admitted.url,providerUrl);return {url:admitted.url,classification:'DIRECT_ACCESS_GAP',verified:[],needsGeo:true,blockers:[page.failure.code],channel:'DIRECT_FAILED'};};
 f.args.acquire=async({target,candidate,direct})=>{acquisitions++;assert.equal(admittedDiscoveryCandidate(candidate,target).url,providerUrl);assert.equal(direct.acquisitionEscalation.eligible,true);return {classification:'ACQUISITION_FAILED',verified:[],blockers:['FIXTURE_STOP']};};
 await runOpenWebResearch(f.args);await runOpenWebResearch(f.args);const state=await runOpenWebResearch(f.args);assert.equal(acquisitions,1);assert.equal(state.usage.acquisitions,1);assert.equal(state.targets[0].acquisitionOutcomes[0].classification,'ACQUISITION_FAILED');
 assert(events(directory).some(e=>e.type==='ACQUISITION_ESCALATION_REVIEW'&&e.decision.eligible===true&&e.decision.primaryFailureReason==='DIRECT_ACCESS_FAILED'));
});

test('autonomous adapter admission revalidates binding integrity and exact host',()=>{
 const t=target(),sha256=digest(candidateBody),review=reviewV2CandidateAuthority({contractVersion:1,observationId:'adapter-admission',target:{service,serviceName:name},page:{url:candidateUrl,requestedUrl:candidateUrl,outcome:'OK',httpStatus:200,contentType:'text/html',truncated:false,bodyHash:sha256,sourceIntegrity:{sha256},rawSource:{text:candidateBody},accessDecisions:[{decision:'ALLOWED'}]}});installRunScopedV3ProviderAuthority(t,review);
 const decision=autonomousProviderAuthorityDecision(t,candidateUrl);assert.equal(admittedDiscoveryCandidate({url:candidateUrl,authority:decision},t).url,candidateUrl);
 const changed=structuredClone(decision);changed.providerAuthorityBinding.reason='TAMPERED';assert.throws(()=>admittedDiscoveryCandidate({url:candidateUrl,authority:changed},t),/DISCOVERY_AUTHORITY_URL_MISMATCH/);
 assert.equal(autonomousProviderAuthorityDecision(t,'https://support.aurora.example/pricing'),null);
});
