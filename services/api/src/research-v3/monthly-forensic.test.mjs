import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {digest,checkpoint,restore} from './model.mjs';import {evaluate} from './truth.mjs';
import {runTarget,offlineCapabilities} from './runner.mjs';import {createLiveSemanticInterpreter} from './live-semantic.mjs';
const f=JSON.parse(readFileSync(new URL('monthly-forensic.test-fixtures.json',import.meta.url)));
test('retained annual-commitment excerpt does not prove either monthly or annual payment',async()=>{
 assert.equal(digest(f.excerpt),f.excerptSha256);const name='Proton Unlimited',url='https://provider.example/resource',body='<title>'+name+'</title><main>'+f.excerpt+'</main>';
 const objective={kind:'PRICE',serviceId:'fixture',serviceName:name,providerHosts:['provider.example'],markets:['CH'],seeds:[url]},input={objective,provider:{reviewed:true,serviceId:'fixture',hosts:objective.providerHosts},permissions:{DECODO:true},bounds:{actions:1},fixtures:[{url:'https://provider.example/robots.txt',transport:'DECODO',country:'CH',status:404,body:'',contentType:'text/plain'},{url,transport:'DECODO',country:'CH',body}]};
 const interpret=await createLiveSemanticInterpreter({env:{SAVLIVO_V3_SEMANTIC_MODEL:'offline'},client:{chat:{completions:{create:async p=>{
  const r=JSON.parse(p.messages[1].content),n=r.numbers.find(n=>n.values.includes(9.99)),presentation=r.presentations.find(p=>p.segments.includes(n.segment)),u=r.currencies.find(u=>u.segment===n.segment&&u.candidates.includes('EUR'));
  // The historical response omitted payment cadence. V5 must preserve UNKNOWN.
  const w={language:'en',serviceSources:[],serviceAmbiguous:false,offers:[{id:'o',presentation:presentation.id,name:'Unlimited',serviceRef:r.knownObservationService.reference,association:'PRIMARY_SERVICE',audience:'CONSUMER',relationship:'SUBSCRIPTION',marketStatements:[],qualifiers:[],ambiguous:false}],charges:[{id:'c',offer:'o',sources:presentation.segments,amountRef:n.id,amount:9.99,currencyRef:u.id,currency:'EUR',cadence:'MONTHLY',cadenceText:null,cadenceSources:[n.segment],cadenceKind:'RECURRENCE',role:'ORDINARY_RECURRING',durationText:f.duration,derivation:'EXPLICIT',qualifiers:[],ambiguous:false}],relations:[],accounts:[],populations:[],accountStatements:[]};return {choices:[{finish_reason:'stop',message:{content:JSON.stringify(w)}}]};
 }}}}});
 const r=await runTarget({input,interpret,capabilities:offlineCapabilities(input)});assert.equal(r.result.truth.established,false);assert.equal(r.result.truth.eligibility.CH.result,'UNRESOLVED');const c=r.knowledge.observations[0].evidence.envelope.offers[0].charges[0];assert.equal(c.temporal.billingCadence,'UNKNOWN');assert.equal(c.duration,f.duration);assert.deepEqual(evaluate(restore(checkpoint(r.knowledge))),r.result.truth);
});
