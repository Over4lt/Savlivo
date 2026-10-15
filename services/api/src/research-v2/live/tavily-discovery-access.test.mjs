import test from 'node:test';
import assert from 'node:assert/strict';
import {nonObservedDirectProviderPage} from './tavily-discovery.mjs';

test('robots-denied provider read remains target research uncertainty without a geo escalation',()=>{
 const url='https://provider.example/register?returnUrl=/',page={url,outcome:'ACCESS_CONTROL_STOP',failure:{code:'ROBOTS_ACCESS_STOP'},accessDecisions:[{decision:'DISALLOWED',reason:'MATCHED_RULE'}]};
 assert.deepEqual(nonObservedDirectProviderPage(page,url),{url,classification:'DIRECT_ACCESS_BLOCKED',verified:[],needsGeo:false,blockers:['ROBOTS_ACCESS_STOP'],channel:'DIRECT_FAILED'});
 assert.equal(nonObservedDirectProviderPage({...page,outcome:'OK'},url),null);
});
