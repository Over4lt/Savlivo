import test from 'node:test';
import assert from 'node:assert/strict';
import {createKnowledge,context,digest,checkpoint,restore} from './model.mjs';
import {evidenceSchema,evidenceRequest,projectEvidence} from './evidence.mjs';
import {selectSemanticUnits} from './semantic-units.mjs';
import {projectObservation} from './projection.mjs';
import {evaluate} from './truth.mjs';
const objective={kind:'SERVICE_QUALIFICATION',serviceId:'generic',serviceName:'Library',providerHosts:['provider.example'],markets:[],seeds:['https://provider.example/plans']};
const node=(id,d,role,s)=>({id,destination:d.id,role,ambiguity:false,support:[s]});
function setup({cancel=false,external=false,edges=true,login=true,account=true,manage=true}={}) {
 const html='<title>Library</title><article>'+ (login?`<a href="${external?'https://identity.example/auth':'/login'}">Sign in</a>`:'')+(account?'<a href="/account">Account</a>':'')+(manage?'<a href="/billing">Subscription settings</a>':'')+(cancel?'<a href="/cancel">Cancel subscription</a>':'')+'<p>Sign in opens your account. From your account, open subscription settings to manage billing.'+(cancel?' Subscription settings include cancellation.':'')+'</p></article>';
 const o={id:'o',format:'WEB',kind:'PROVIDER',url:objective.seeds[0],body:html,sha256:digest(html),contentType:'text/html',outcome:'OK',context:context('DIRECT'),httpStatus:200};
 const unit=selectSemanticUnits(o,objective)[0],r=evidenceRequest(o,objective,unit),span=s=>({start:s.start,end:s.end,quote:s.text,translated:null}),service=r.material.segments.find(s=>s.text==='Library');
 const nodes=r.material.destinations.map(d=>node(d.id,d,d.label==='Sign in'?(external?'AUTH':'LOGIN'):d.label==='Account'?'ACCOUNT':d.label==='Subscription settings'?'MANAGE':'CANCEL',span(r.material.segments.find(s=>s.start>=d.start&&s.end<=d.end))));
 const byRole=role=>nodes.find(n=>n.role===role),relation=r.material.segments.find(s=>s.text.startsWith('Sign in opens'));
 const edge=(from,to,kind)=>({id:kind,from:from.id,to:to.id,kind,ambiguity:false,support:[...from.support,...to.support,span(relation)]});
 const relationships=[];
 if(edges&&login&&account)relationships.push(edge(byRole(external?'AUTH':'LOGIN'),byRole('ACCOUNT'),'AUTHENTICATES_TO'));
 if(edges&&account&&manage)relationships.push(edge(byRole('ACCOUNT'),byRole('MANAGE'),'MANAGES_SUBSCRIPTION'));
 if(edges&&manage&&cancel)relationships.push(edge(byRole('MANAGE'),byRole('CANCEL'),'CANCELS_SUBSCRIPTION'));
 const e={schema:evidenceSchema,observationId:o.id,observationSha256:o.sha256,language:'en',translationArtifact:null,service:{name:'Library',ambiguity:false,support:[span(service)],populations:[],account:[]},offers:[],accountGraph:{nodes,edges:relationships}};
 o.evidence={unit,envelope:e};o.candidates=projectObservation(o,objective).candidates;const k=createKnowledge({objective});k.observations=[o];return {o,k,e,unit,r};
}
test('explicit provider login and account remain separate source-bound destinations',()=>{
 const {k,o}=setup({manage:false});const t=evaluate(k);assert.equal(t.service.ACCOUNT_LOGIN_EXISTS.state,'ESTABLISHED');assert.equal(t.accountAccess.ACCOUNT.state,'ESTABLISHED');assert.equal(t.accountAccess.MANAGE.state,'UNRESOLVED');assert.equal(t.accountAccess.CANCEL.state,'UNRESOLVED');assert.ok(projectObservation(o,objective).source.accountGraphs[0].nodes.some(n=>n.role==='LOGIN'&&n.url.endsWith('/login')));
});
test('account alone does not establish login, management or cancellation',()=>{
 const {k}=setup({login:false,manage:false});const t=evaluate(k);assert.equal(t.accountAccess.ACCOUNT.state,'ESTABLISHED');for(const role of ['LOGIN','MANAGE','CANCEL'])assert.equal(t.accountAccess[role].state,'UNRESOLVED');
});
test('login -> account -> subscription management has grounded independent edges',()=>{
 const {k}=setup();const t=evaluate(k);assert.equal(t.accountAccess.LOGIN.state,'ESTABLISHED');assert.equal(t.accountAccess.MANAGE.state,'ESTABLISHED');assert.equal(t.service.MEMBERSHIP_MANAGEMENT_EXISTS.state,'ESTABLISHED');assert.equal(t.accountAccess.CANCEL.state,'UNRESOLVED');
});
test('management label without account-management relationship remains unresolved',()=>{
 const {k}=setup({edges:false});assert.equal(evaluate(k).service.MEMBERSHIP_MANAGEMENT_EXISTS.state,'UNRESOLVED');
});
test('explicit cancellation stays distinct from generic management',()=>{
 const {k}=setup({cancel:true});const t=evaluate(k);assert.equal(t.accountAccess.CANCEL.state,'ESTABLISHED');assert.notEqual(t.accountAccess.CANCEL.evidence[0].reference.destination,t.accountAccess.MANAGE.evidence[0].reference.destination);
});
test('provider-bound account relationship preserves third-party authentication provenance',()=>{
 const {k}=setup({external:true});const t=evaluate(k);assert.equal(t.service.ACCOUNT_LOGIN_EXISTS.state,'ESTABLISHED');assert.equal(t.accountAccess.LOGIN.evidence[0].reference.destination,'https://identity.example/auth');assert.equal(t.accountAccess.ACCOUNT.evidence[0].reference.destination,'https://provider.example/account');
});
test('unrelated external authentication alone does not establish provider account access',()=>{
 const {k}=setup({external:true,account:false,manage:false});assert.equal(evaluate(k).service.ACCOUNT_LOGIN_EXISTS.state,'UNRESOLVED');
});
test('invented destination and unsupported relationship fail closed',()=>{
 const {o,e,unit,k}=setup();e.accountGraph.nodes[0].destination='invented';let p=projectEvidence(o,objective,e,unit);assert.ok(p.rejected.some(r=>r.reason==='DESTINATION_SUPPORT_INVALID'));assert.equal(evaluate(k).accountAccess.LOGIN.state,'UNRESOLVED');
 e.accountGraph.edges[1].from='unseen-fragment-node';assert.equal(evaluate(k).accountAccess.MANAGE.state,'UNRESOLVED');
});
test('compatible endpoint labels do not manufacture an account relationship',()=>{
 const {k,e}=setup();const edge=e.accountGraph.edges[1];edge.support=e.accountGraph.nodes.flatMap(n=>n.support);assert.equal(evaluate(k).accountAccess.MANAGE.state,'UNRESOLVED');
});
test('service-wide account access does not imply market availability and survives checkpoint',()=>{
 const {k,o}=setup();k.objective={...objective,kind:'PRICE',markets:['FR']};assert.equal(evaluate(k).accountAccess.LOGIN.state,'ESTABLISHED');assert.equal(evaluate(k).prices.FR.propositions.TARGET_MARKET.state,'UNRESOLVED');assert.equal(evaluate(restore(checkpoint(k))).accountAccess.MANAGE.state,'ESTABLISHED');o.body+='changed';assert.equal(evaluate(k).accountAccess.LOGIN.state,'UNRESOLVED');
});
test('normal engine -> bounded adapter -> validation -> account truth uses the same general path',async()=>{
 const {runResearch}=await import('./engine.mjs');const {createEvidenceInterpreter}=await import('./evidence.mjs');const prepared=setup({cancel:true});let calls=0;
 const interpret=createEvidenceInterpreter({complete:r=>{calls++;assert.ok(r.unit);assert.ok(r.material.destinations.some(d=>d.url==='/billing'));return {...prepared.e,observationId:r.observation.id,observationSha256:r.observation.sha256};}});
 const k=await runResearch({objective,permissions:{DIRECT:true},bounds:{actions:1},interpret,capabilities:{DIRECT:a=>({url:a.url,context:a.context,format:'WEB',contentType:'text/html',body:prepared.o.body,httpStatus:200,outcome:'OK'})}});
 const t=evaluate(k);assert.equal(calls,1);assert.equal(t.service.ACCOUNT_LOGIN_EXISTS.state,'ESTABLISHED');assert.equal(t.service.MEMBERSHIP_MANAGEMENT_EXISTS.state,'ESTABLISHED');assert.equal(t.accountAccess.CANCEL.state,'ESTABLISHED');assert.equal(t.admitted,false);
});
