import '../offline-replay/offline-guard.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {reviewV2CandidateAuthority,v2CandidateAuthorityBoundary} from '../../research-v3/v2-candidate-authority-adapter.mjs';
import {reviewCandidateAuthority} from '../../research-v3/provider-authority-review.mjs';
import {authorityBinding} from '../../research-v3/discovery-authority.mjs';
import {digest} from '../../research-v3/model.mjs';
import {evaluate} from '../../research-v3/truth.mjs';
import {refreshCatalog} from '../../research-v3/subscription-catalog.mjs';
import {adaptV2CurrentSource} from '../../research-v3/v2-current-source-adapter.mjs';
import {hasProviderRoutingAuthority,installRunScopedV3ProviderAuthority,providerRoutingAuthority,runScopedV3ProviderBindings} from './provider-routing-authority.mjs';
import {destinationInformation} from './information-routing.mjs';
import {executableAction} from './execution-capabilities.mjs';
import {planResearch} from './research-planner.mjs';
import {runOpenWebResearch} from './open-web-discovery.mjs';

const name='Aurora Club',service='aurora-club',host='aurora.example',url=`https://${host}/membership`;
const owned=`<html><main><h1>${name} membership</h1><p>We operate ${name} membership and provide our own classes.</p><a href="/pricing">Pricing</a></main><footer>© ${name} 2026. All rights reserved.</footer></html>`;
const target=()=>({id:'aurora-us',service,serviceName:name,market:'US',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[],authorities:[],gaps:['amount'],reads:[],queries:[],decisions:[],capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false}});
function input(body=owned,extra={}){
 const sha256=digest(body),page={url,requestedUrl:url,outcome:'OK',httpStatus:200,contentType:'text/html',truncated:false,bodyHash:sha256,sourceIntegrity:{sha256},rawSource:{text:body},accessDecisions:[{decision:'ALLOWED'}],...(extra.page??{})};
 return {contractVersion:1,observationId:'v2-candidate-1',target:{service,serviceName:name},page,...extra.root};
}
function native(body=owned){
 const o={id:'v2-candidate-1',kind:'CANDIDATE',authority:'UNREVIEWED_CANDIDATE',url,context:{transport:'DIRECT',networkGeography:'UNBOUND',representation:'CANDIDATE_PAGE'},outcome:'OK',truncated:false,completeness:'COMPLETE',format:'WEB',contentType:'text/html',httpStatus:200,access:[{decision:'ALLOWED'}],body,sha256:digest(body)};
 const objective={kind:'PRICE',serviceId:service,serviceName:name,providerHosts:[],candidateHosts:[host],markets:[],seeds:[url]};return {o,objective,binding:reviewCandidateAuthority(o,objective)};
}

test('contract is frozen and equivalent V2 material produces the exact native V3 binding',()=>{
 assert.equal(Object.isFrozen(v2CandidateAuthorityBoundary),true);
 const a=reviewV2CandidateAuthority(input()),n=native();assert.deepEqual(a.candidateObservation,n.o);assert.deepEqual(a.providerAuthorityBinding,n.binding);
 assert.equal(a.providerAuthorityBinding.host,host);assert.equal(a.providerAuthorityBinding.scope,'EXACT_HOST_PROVIDER_SOURCING');
});

for(const [label,body] of [
 ['brand mention',`<main>${name} is a popular subscription service.</main>`],
 ['search snippet',`<main>Search result: ${name} official site and pricing.</main>`],
 ['domain similarity','<main>Welcome to our subscription page.</main>'],
 ['title branding and copyright',`<title>${name}</title><main>Memberships available.</main><footer>© ${name} 2026</footer>`],
 ['acquisition success alone','<main>Successful public page response.</main>'],
])test(label+' cannot establish autonomous provider authority',()=>assert.equal(reviewV2CandidateAuthority(input(body)).providerAuthorityBinding,null));

test('failed truncated and hash-invalid candidate material fails closed',()=>{
 const failed=input();failed.page.outcome='ERROR';assert.equal(reviewV2CandidateAuthority(failed).providerAuthorityBinding,null);
 const truncated=input();truncated.page.truncated=true;assert.equal(reviewV2CandidateAuthority(truncated).providerAuthorityBinding,null);
 const changed=input();changed.page.rawSource.text+=' changed';assert.equal(reviewV2CandidateAuthority(changed).providerAuthorityBinding,null);
});

test('cross-host redirect grants neither requested nor destination authority',()=>{
 const redirected=input();redirected.page.url='https://redirect.example/membership';const r=reviewV2CandidateAuthority(redirected);assert.equal(r.providerAuthorityBinding,null);assert.equal(r.reason,'CANDIDATE_REDIRECT_HOST_CHANGED');
});

test('installed autonomous authority is exact-host routing permission only',()=>{
 const t=target(),review=reviewV2CandidateAuthority(input());installRunScopedV3ProviderAuthority(t,review);
 assert.equal(hasProviderRoutingAuthority(t),true);assert.equal(providerRoutingAuthority(t,url).provenance,'V3_AUTONOMOUS_CANDIDATE_REVIEW');
 for(const sibling of ['https://example.com/','https://shop.aurora.example/','https://support.aurora.example/','https://another-aurora.example/'])assert.equal(providerRoutingAuthority(t,sibling),null);
 assert.deepEqual(runScopedV3ProviderBindings(t),[review.providerAuthorityBinding]);
});

test('authority carries no market country price subscription currency or catalog fact',()=>{
 const review=reviewV2CandidateAuthority(input()),binding=review.providerAuthorityBinding;
 for(const field of ['market','country','price','amount','currency','billingCadence','subscription','catalog'])assert.equal(Object.hasOwn(binding,field),false);
 assert.deepEqual(review.candidateObservation.context,{transport:'DIRECT',networkGeography:'UNBOUND',representation:'CANDIDATE_PAGE'});
 const objective={kind:'PRICE',serviceId:service,serviceName:name,providerHosts:[host],markets:['US'],seeds:[url]},k={objective,observations:[review.candidateObservation],attempts:[],policyBlocks:[],stop:null},truth=evaluate(k);
 assert.equal(truth.established,false);assert.equal(truth.service.SERVICE_IDENTITY.state,'UNRESOLVED');assert.equal(refreshCatalog(k,truth).state,'CATALOG_UNRESOLVED');
});

test('candidate stays candidate while a later exact-host provider page satisfies Phase 1',()=>{
 const review=reviewV2CandidateAuthority(input()),t=target();installRunScopedV3ProviderAuthority(t,review);
 assert.equal(review.candidateObservation.kind,'CANDIDATE');assert.equal(evaluate({objective:{kind:'PRICE',serviceId:service,serviceName:name,providerHosts:[host],markets:['US'],seeds:[url]},observations:[review.candidateObservation]}).established,false);
 const providerUrl=`https://${host}/pricing`,objective={kind:'PRICE',serviceId:service,serviceName:name,providerHosts:[host],markets:['US'],seeds:[providerUrl]},body=JSON.stringify({serviceId:service,offers:[{id:'monthly',amount:12,currency:'USD',cadence:'MONTHLY',billingCadence:'MONTHLY',consumer:true,relationship:'SUBSCRIPTION',role:'ORDINARY',market:'US'}]}),sha256=digest(body);
 const phase1={contractVersion:1,observationId:'later-provider',target:{service,serviceName:name,market:'US'},page:{url:providerUrl,requestedUrl:providerUrl,outcome:'OK',httpStatus:200,contentType:'application/json',bodyHash:sha256,sourceIntegrity:{sha256},rawSource:{text:body},accessDecisions:[{decision:'ALLOWED'}]},providerAuthority:{status:'AUTHORITATIVE_PROVIDER',binding:authorityBinding(objective,providerUrl)},acquisition:{route:'DIRECT'}};
 const provider=adaptV2CurrentSource(phase1,objective);assert.equal(provider.kind,'PROVIDER');assert.equal(evaluate({objective,observations:[provider]}).established,true);
 const sibling={...phase1,page:{...phase1.page,url:'https://support.aurora.example/pricing',requestedUrl:'https://support.aurora.example/pricing'}};assert.throws(()=>adaptV2CurrentSource(sibling,objective),/V2_V3_AUTHORITY_INVALID/);
});

test('old V2 answer and reviewed metadata cannot manufacture autonomous authority',()=>{
 for(const field of ['verified','finalStatus','confidence','authorities','priceConclusion','marketConclusion']){const x=input();x.target[field]=field==='confidence'?1:true;assert.throws(()=>reviewV2CandidateAuthority(x),/V2_V3_CANDIDATE_TARGET_INVALID/);}
 const body=`<title>${name}</title><footer>© ${name} 2026</footer>`,r=reviewV2CandidateAuthority(input(body));assert.equal(r.providerAuthorityBinding,null);
});

test('historical reviewed V2 authority keeps its distinct routing behavior',()=>{
 const t=target();t.urls=[url];t.authorities=[{hostname:host,provider:name,sourceType:'OFFICIAL_PROVIDER',checkedAt:'2026-01-01'}];
 assert.equal(providerRoutingAuthority(t,url).provenance,'HISTORICAL_REVIEWED_PROVIDER');assert.equal(destinationInformation(t,url).eligible,true);assert.equal(planResearch(t).route,'DIRECT');
});

test('V2 cold start performs search then candidate acquisition and enables only later provider routing',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'phase2-authority-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const calls=[];
 const state=await runOpenWebResearch({directory,targets:[target()],maxActions:2,search:async()=>{calls.push('SEARCH');return {results:[{url,title:`${name} official membership`,content:'ignored snippet'}]};},read:async()=>{calls.push('CANDIDATE_READ');return {url,outcome:'OK',httpStatus:200,contentType:'text/html',body:owned,sourceIntegrity:{sha256:digest(owned)},accessDecisions:[{decision:'ALLOWED'}]};}});
 const current=state.targets[0],candidate=current.reads[0];assert.deepEqual(calls,['SEARCH','CANDIDATE_READ']);assert.equal(candidate.researchRole,'CANDIDATE_AUTHORITY_SOURCE');assert.equal(candidate.v3AuthorityReview.status,'PROVIDER_BOUND');assert.equal(hasProviderRoutingAuthority(current),true);
 assert.equal(current.leads.some(lead=>lead.url===`https://${host}/pricing`),true);const plan=planResearch(current,{unreadUrls:current.leads.map(lead=>lead.url)});assert.equal(plan.route,'DIRECT',JSON.stringify(plan));assert.equal(new URL(plan.url).hostname,host);assert.equal(executableAction(current,{route:'DIRECT',url:plan.url}).executable,true);
 assert.equal(providerRoutingAuthority(current,'https://support.aurora.example/pricing'),null);assert.equal(destinationInformation(current,'https://support.aurora.example/pricing').reason,'AUTHORITY_UNRESOLVED');
});

test('bounded run resume revalidates retained candidate proof before the later provider read',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'phase2-authority-resume-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const calls=[],args={directory,targets:[target()],maxActions:1,search:async()=>{calls.push('SEARCH');return {results:[{url,title:`${name} official membership`}]};},read:async({url:requested})=>{if(requested===url){calls.push('CANDIDATE_READ');return {url:requested,outcome:'OK',httpStatus:200,contentType:'text/html',body:owned,sourceIntegrity:{sha256:digest(owned)},accessDecisions:[{decision:'ALLOWED'}]};}calls.push('PROVIDER_READ');const body='<html><title>Aurora Club plans</title></html>';return {url:requested,outcome:'OK',httpStatus:200,contentType:'text/html',body,sourceIntegrity:{sha256:digest(body)},accessDecisions:[{decision:'ALLOWED'}]};},classify:async()=>assert.fail('old V2 authority must not replace the V3 autonomous binding')};
 await runOpenWebResearch(args);await runOpenWebResearch(args);const state=await runOpenWebResearch(args);
 assert.deepEqual(calls,['SEARCH','CANDIDATE_READ','PROVIDER_READ']);assert.equal(state.targets[0].reads[0].researchRole,'CANDIDATE_AUTHORITY_SOURCE');assert.equal(state.targets[0].reads[1].requestedUrl,`https://${host}/pricing`);assert.equal(state.targets[0].reads[1].researchRole,'PROVIDER_SOURCE');assert.equal(state.targets[0].reads[1].providerAuthority.binding.host,host);
});

test('changed retained candidate body cannot restore run-scoped authority',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'phase2-authority-tamper-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const calls=[],args={directory,targets:[target()],maxActions:1,search:async()=>{calls.push('SEARCH');return {results:[{url,title:`${name} official membership`}]};},read:async()=>{calls.push('CANDIDATE_READ');return {url,outcome:'OK',httpStatus:200,contentType:'text/html',body:owned,sourceIntegrity:{sha256:digest(owned)},accessDecisions:[{decision:'ALLOWED'}]};}};
 await runOpenWebResearch(args);const bound=await runOpenWebResearch(args),page=bound.targets[0].reads[0];fs.writeFileSync(path.join(directory,page.bodyFile),owned+' changed');await runOpenWebResearch(args);
 assert.deepEqual(calls.slice(0,2),['SEARCH','CANDIDATE_READ']);
 assert.notEqual(calls[2],'PROVIDER_READ');
});
