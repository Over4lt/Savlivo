import test from 'node:test';
import assert from 'node:assert/strict';
import {providerStop} from './online-discovery-stage.mjs';
import {discoveryActivation} from './online-discovery.mjs';
const target={id:'fixture-price-DE'};
const tokens=['CAPTCHA','CHALLENGE','AUTH_REQUIRED','PROVIDER_BLOCKED','HTTP_FORBIDDEN','PROVIDER_HTTP_403','EXPLICIT_PROVIDER_PROHIBITION','DISALLOWED','ROBOTS_DISALLOW','PACING','ROBOTS_INVALID'];
function fixture(text='This website is protected by reCAPTCHA. Privacy and terms apply.'){
 return [{type:'RESPONSE_CAPTURED',payload:{target:{taskId:target.id},status:200}},
 {type:'V2_ACQUISITION_RESULT',payload:{target,result:{outcome:'OBSERVED',reason:'GEO_OBSERVATION_REQUIRES_FACT_REVIEW',attempts:[{outcome:'OBSERVED',failure:null,page:{outcome:'OK',rawSource:{text},accessDecisions:[{decision:'ALLOWED',reason:'NO_APPLICABLE_RESTRICTION',boundary:'SAFE_TO_EVALUATE',httpStatus:200,rule:null}]}}]}}}];
}
const attempt=r=>r[1].payload.result.attempts[0];
test('production-shaped observed HTTP 200 with legal CAPTCHA notice is not restricted',()=>assert.equal(providerStop(fixture(),target),null));
for(const token of tokens)test('ordinary content cannot grant policy authority: '+token,()=>{
 const r=fixture(token);Object.assign(attempt(r).page,{url:'https://provider.example/'+token,bodyDiagnostic:{message:token},structured:{failure:{code:token}},raw:{body:token}});
 attempt(r).failure={code:'NETWORK_FAILED',message:token};assert.equal(providerStop(r,target),null);
});
for(const token of tokens.slice(0,7))test('typed provider restriction persists despite acquired bytes: '+token,()=>{
 const r=fixture();attempt(r).failure={code:token};const stop=providerStop(r,target);assert.equal(stop,'PROVIDER_RESTRICTED');
 assert.equal(discoveryActivation({ordinaryComplete:true,interpretationComplete:true,hardStop:stop}).active,false);
});
for(const status of [401,403])test('matching captured '+status+' still restricts, unrelated target does not',()=>{
 const r=fixture();r[0].payload.status=status;assert.equal(providerStop(r,target),'PROVIDER_RESTRICTED');r[0].payload.target.taskId='other';assert.equal(providerStop(r,target),null);
});
test('typed explicit access prohibition preserves provider priority',()=>{
 const r=fixture();attempt(r).page.accessDecisions=[{decision:'REVIEW_REQUIRED',reason:'EXPLICIT_PROVIDER_PROHIBITION'}];attempt(r).failure='ROBOTS_ACCESS_STOP';assert.equal(providerStop(r,target),'PROVIDER_RESTRICTED');
});
for(const decision of ['DISALLOWED','ROBOTS_INVALID'])test('robots decision remains policy stop: '+decision,()=>{
 const r=fixture();attempt(r).page.accessDecisions=[{decision,reason:'APPLICABLE_POLICY'}];assert.equal(providerStop(r,target),'POLICY_BLOCKED');
});
for(const code of ['UNSUPPORTED_PACING_DIRECTIVE','ACCESS_POLICY_STOP','ACCESS_CONTROL_STOP','ROBOTS_ACCESS_STOP'])test('typed policy failure: '+code,()=>{
 const r=fixture();attempt(r).failure=code;assert.equal(providerStop(r,target),'POLICY_BLOCKED');
});
test('read and transport admission decisions remain authoritative',()=>{
 const r=fixture();attempt(r).reads=[{failure:{code:'AUTH_REQUIRED'}}];assert.equal(providerStop(r,target),'PROVIDER_RESTRICTED');
 attempt(r).reads=[];attempt(r).transportVerification={accessAdmission:{decisions:[{decision:'DISALLOWED'}]}};assert.equal(providerStop(r,target),'POLICY_BLOCKED');
});
test('unrelated acquisition restriction cannot stop this target',()=>{const r=fixture();r[1].payload.target={id:'other'};attempt(r).failure='CAPTCHA';assert.equal(providerStop(r,target),null);});
