import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveSemanticInterpreter} from './live-semantic.mjs';
import {runTarget,offlineCapabilities} from './runner.mjs';
import {checkpoint,restore} from './model.mjs';
import {evaluate} from './truth.mjs';

test('many native links use the deterministic frontier without model advice',async()=>{
 const objective={kind:'PRICE',serviceId:'club',serviceName:'Aurora',providerHosts:['provider.example'],markets:['US'],seeds:['https://provider.example/']};
 const body='<title>Aurora</title><main><nav>'+Array.from({length:12},(_,i)=>`<a href="/resource/${i}">Aurora resource ${i}</a>`).join('')+'</nav><p>Membership information</p></main>';
 const input={objective,provider:{reviewed:true,serviceId:'club',hosts:objective.providerHosts},permissions:{DECODO:true},bounds:{actions:1,modelCalls:3},semantic:{mode:'LIVE'},fixtures:[{url:'https://provider.example/robots.txt',transport:'DECODO',country:'US',status:404,contentType:'text/plain',body:''},{url:objective.seeds[0],transport:'DECODO',country:'US',body}]};
 let calls=0;
 const interpret=await createLiveSemanticInterpreter({env:{SAVLIVO_V3_SEMANTIC_MODEL:'offline'},client:{chat:{completions:{create:async()=>{calls++;throw Error('MODEL_SHOULD_NOT_RUN');}}}}});
 const run=await runTarget({input,interpret,capabilities:offlineCapabilities(input)});
 assert.equal(calls,0);assert.equal(run.result.usage.modelCalls,0);
 assert.ok(run.knowledge.destinations.length>1);
 assert.ok(run.result.trace.some(t=>t.event==='PROVIDER_FRONTIER'&&t.candidates.length>0));
 assert.ok(!run.result.trace.some(t=>t.event?.startsWith('NAVIGATION_ADVICE')));
 assert.deepEqual(evaluate(restore(checkpoint(run.knowledge))),run.result.truth);
});
