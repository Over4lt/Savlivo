import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {initializeAdaptiveState,targetExecutionContext} from '../inventory/adaptive-campaign.mjs';
import {executableAction} from './execution-capabilities.mjs';
import {OpenWebResearch} from './open-web-discovery.mjs';

const url='https://provider.example/';
const target=(service,extra={})=>({id:service+'-DE',service,serviceName:service.toUpperCase(),market:'DE',researchObjective:'SERVICE_COVERAGE',smartResearch:{version:2},urls:[url],authorities:[{hostname:'provider.example',provider:service.toUpperCase(),sourceType:'OFFICIAL_PROVIDER',sourceUrl:url,checkedAt:'2026-10-11T00:00:00.000Z'}],capabilities:{direct:true,tavily:false,decodo:false,browser:false,groq:false},reads:[],queries:[],decisions:[],verified:[],blockedOrigins:[],gaps:['amount'],...extra});
const initial=bytes=>({actions:0,reads:0,searches:0,acquisitions:0,retainedReviews:0,bytes});
const temp=t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'campaign-byte-accounting-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;};

test('adversarial 18: parent exhaustion leaves a KNOWN_SERVICE child no aggregate bytes',()=>{
 const child=target('orbit'),state=initializeAdaptiveState({targets:[child],conditionalFollowupTargets:[]},{limits:{bytes:10},budgetScope:'CAMPAIGN',initialUsage:initial(10)}),context=targetExecutionContext(state,state.targets[child.id]);
 assert.equal(context.bounds.bytes,0);assert.equal(context.bounds.bytesPerPage,0);assert.deepEqual(context.usage.bytes,0);assert.equal(executableAction(state.targets[child.id],{route:'DIRECT',url},{bounds:context.bounds,usage:context.usage}).reason,'BYTE_BUDGET_EXHAUSTED');
});

test('adversarial 19: sibling children receive only the one shared remaining allowance',()=>{
 const first=target('orbit',{reads:[{requestedUrl:url,url,outcome:'OK',acquisitionBytes:3}]}),second=target('pulse'),state=initializeAdaptiveState({targets:[target('orbit'),second],conditionalFollowupTargets:[]},{limits:{bytes:10},budgetScope:'CAMPAIGN',initialUsage:initial(6),retainedStates:[first]}),context=targetExecutionContext(state,state.targets[second.id]);
 assert.equal(state.services.orbit.used.bytes,3);assert.equal(context.bounds.bytes,1);assert.equal(context.bounds.bytesPerPage,1);assert.equal(context.usage.bytes,0);
});

test('adversarial 20: restart retains charged bytes, overflow receives no refund, and reuse charges zero',t=>{
 const directory=temp(t),bounds={bytes:4,bytesPerPage:4},subject=target('orbit'),first=new OpenWebResearch(directory,[subject],bounds);first.state.pending={id:'one',type:'READ',target:subject.id,url,lead:{url}};first.accept('one',{url,outcome:'OK',httpStatus:200,contentType:'text/html',body:'abc',sourceIntegrity:{},accessDecisions:[{decision:'ALLOWED'}]});assert.equal(first.state.usage.bytes,3);
 const resumed=new OpenWebResearch(directory,[subject],bounds);assert.equal(resumed.state.usage.bytes,3);resumed.state.pending={id:'reuse',type:'READ',target:subject.id,url:url+'cached',lead:{url:url+'cached'}};resumed.accept('reuse',{url:url+'cached',outcome:'OK',httpStatus:200,contentType:'text/html',body:'abc',sourceIntegrity:{},accessDecisions:[{decision:'ALLOWED'}]},{charge:false});assert.equal(resumed.state.usage.bytes,3);
 resumed.state.pending={id:'overflow',type:'READ',target:subject.id,url:url+'next',lead:{url:url+'next'}};assert.throws(()=>resumed.accept('overflow',{url:url+'next',outcome:'OK',httpStatus:200,contentType:'text/html',body:'de',sourceIntegrity:{},accessDecisions:[{decision:'ALLOWED'}]}),/CAMPAIGN_BYTE_BOUND/);assert.equal(resumed.state.usage.bytes,4);assert.equal(new OpenWebResearch(directory,[subject],bounds).state.usage.bytes,4);
});
