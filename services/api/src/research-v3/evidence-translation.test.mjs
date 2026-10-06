import test from 'node:test';
import assert from 'node:assert/strict';
import {digest} from './model.mjs';
import {translationRequest} from './translation.mjs';
import {createEvidenceInterpreter,evidenceRequest,projectEvidence} from './evidence.mjs';
import {projectObservation} from './projection.mjs';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {evaluate} from './truth.mjs';
import {evidenceFixtures,fixtureInput,evidenceCompletion} from './evidence-fixtures.test-support.mjs';
const f=evidenceFixtures.find(f=>f.key==='norwegian');
async function setup() {
 const input=fixtureInput(f),interpret=createEvidenceInterpreter({complete:r=>evidenceCompletion(r,f)});
 const run=await runTarget({input,interpret,capabilities:offlineCapabilities(input)});const o=run.knowledge.observations[0];
 const r=translationRequest(o),envelope={schema:r.schema,observationId:o.id,observationSha256:o.sha256,language:f.language,segments:r.material.segments.map(s=>({start:s.start,end:s.end,original:s.text,text:s.text.includes('Privat abonnement:')?'Personal subscription: NOK 149 per month, ordinary price.':s.text,status:'FAITHFUL'}))};
 o.translation={envelope};const e=evidenceCompletion(evidenceRequest(o,input.objective),f);e.translationArtifact=digest(envelope);
 const map=s=>({...s,translated:{segment:envelope.segments.findIndex(t=>t.start===s.start&&t.end===s.end),text:envelope.segments.find(t=>t.start===s.start&&t.end===s.end).text}});
 e.service.support=e.service.support.map(map);
 for(const offer of e.offers){offer.support=offer.support.map(map);for(const c of offer.charges)c.support=c.support.map(map);}
 o.evidence.envelope=e;o.candidates=projectObservation(o,input.objective).candidates;
 return {run,o,input,e};
}
test('derived understanding retains translation artifact -> exact original source binding',async()=>{
 const {o,input,e}=await setup(),p=projectEvidence(o,input.objective,e);assert.equal(p.error,undefined);
 assert.equal(p.bindings['/offers/0'].translationArtifact,digest(o.translation.envelope));
 assert.ok(p.bindings['/offers/0'].support.some(s=>s.translated&&o.body.slice(s.start,s.end)===s.quote));
});
test('forged translated span/artifact is rejected while valid native/translation evidence survives',async()=>{
 const {o,input,e}=await setup();e.offers[0].charges[0].support[0].translated.text='forged';
 assert.equal(projectEvidence(o,input.objective,e).source.offers.length,0);
 e.translationArtifact='forged';assert.equal(projectEvidence(o,input.objective,e).error,'EVIDENCE_TRANSLATION_BINDING_INVALID');
});
test('already usable translated evidence avoids an unnecessary second model request',async()=>{
 const {o,input}=await setup();let calls=0;
 const interpret=createEvidenceInterpreter({complete:()=>{calls++;throw Error('offline unavailable');}});
 assert.equal(interpret.requiresModel(o,input.objective),true);await assert.rejects(interpret(o,input.objective),/offline unavailable/);assert.equal(calls,1);
});
test('unreliable translated meaning cannot masquerade as original provenance',async()=>{
 const {o,input,e}=await setup();o.translation.envelope.segments.at(-1).status='UNCERTAIN';e.translationArtifact=digest(o.translation.envelope);
 assert.equal(projectEvidence(o,input.objective,e).source.offers.length,0);
 o.body+='altered';assert.equal(projectEvidence(o,input.objective,e).error,'EVIDENCE_ENVELOPE_INVALID');
});
