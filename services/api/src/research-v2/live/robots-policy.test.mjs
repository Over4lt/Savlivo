import test from 'node:test';
import assert from 'node:assert/strict';
import {parseV2Robots,evaluateV2Robots} from './robots-policy.mjs';

const root='https://provider.example/';
const decision=(policy,url=root)=>evaluateV2Robots(parseV2Robots(policy),url);

test('unrelated numeric-prefixed robot token cannot ambiguously match Savlivo',()=>{
 const policy='User-agent: 360spider\nDisallow: /\nUser-agent: *\nAllow: /';
 const result=decision(policy);
 assert.equal(result.decision,'ALLOWED');
 assert.deepEqual(result.nonApplicableParseProblems.map(row=>row.reason),['NONSTANDARD_AGENT']);
});

test('malformed agent that could apply to Savlivo remains blocked',()=>{
 const result=decision('User-agent: SavlivoCatalogResearch2\nDisallow: /\nUser-agent: *\nAllow: /');
 assert.equal(result.decision,'ROBOTS_INVALID');
 assert.equal(result.reason,'AMBIGUOUS_APPLICABLE_AGENT');
});

test('explicit wildcard and exact-agent disallows remain blocked',()=>{
 for(const policy of ['User-agent: *\nDisallow: /','User-agent: SavlivoCatalogResearch\nDisallow: /','User-agent: *\nDisallow: /\nUser-agent: 360spider\nDisallow: /']){
  const result=decision(policy);
  assert.equal(result.decision,'DISALLOWED');
 }
});
