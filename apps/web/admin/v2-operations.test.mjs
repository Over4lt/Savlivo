import fs from 'node:fs';
import {liveStatusView,statusTone} from './live-status.js';
import test from 'node:test';import assert from 'node:assert/strict';import {mountOperations,capabilityGuidance,capabilityControl,availablePermissions,previewTargeting,monitorJob} from './v2-operations.js';
class Element{children=[];listeners={};textContent='';value='';append(...n){for(const child of n){if(child.parentElement)child.parentElement.children=child.parentElement.children.filter(c=>c!==child);child.parentElement=this;this.children.push(child);}}replaceChildren(...n){this.replacements=(this.replacements??0)+1;this.children=n;}addEventListener(k,v){this.listeners[k]=v;}dispatchEvent(e){return this.listeners[e.type]?.(e);}setAttribute(k,v){this[k]=v;}remove(){this.removed=true;if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);}set innerHTML(_){throw Error('Unsafe HTML');}}
const descendants=n=>[n,...n.children.flatMap(descendants)],text=n=>descendants(n).map(x=>x.textContent).join(' '),button=(n,name)=>descendants(n).find(x=>x.textContent===name&&x.listeners.click);
function setup(){globalThis.document={createElement:()=>new Element()};globalThis.window={confirm:()=>false};return new Element();}
const summary={flags:{read:true,control:false,scheduling:false},worker:{at:new Date().toISOString()},metrics:{catalog:2,complete:1,noPrice:1},refresh:null,health:{running:0,resumable:0,nextAutomatic:null,enabledSchedules:0},timezone:'Europe/Oslo'};
const workspaceDetails=root=>descendants(root).find(n=>n.textContent==='View details'&&n.listeners.click&&!descendants(root).filter(x=>x.className?.startsWith('ops-live-card')).some(card=>descendants(card).includes(n)));
const request=async p=>p.endsWith('/summary')?summary:{rows:[],total:0};
test('operations empty/read-only state preserves price independence',async()=>{const root=setup();const dispose=await mountOperations(root,request);assert(text(root).includes('V2 Operations'));assert(text(root).includes('No provider price is not a catalog failure'));assert(button(root,'Preflight').disabled);dispose();});
test('operations loading state before response',async()=>{const root=setup();let resolve;const pending=mountOperations(root,()=>new Promise(r=>{resolve=r;}));assert(text(root).includes('Loading operations'));resolve(summary);const dispose=await pending;dispose();});
test('operations error state allows retry',async()=>{const root=setup(),dispose=await mountOperations(root,async()=>{throw Error('fixture unavailable');});assert(text(root).includes('Operations unavailable'));assert(button(root,'Retry'));dispose();});
test('empty schedules and scheduling-disabled controls',async()=>{const root=setup(),dispose=await mountOperations(root,request);await button(root,'Schedules').listeners.click();assert(text(root).includes('No automatic schedules'));assert(button(root,'Create schedule').disabled);dispose();});
for(const enabled of [true,false])test('schedule '+(enabled?'enabled':'disabled')+' display',async()=>{const root=setup(),dispose=await mountOperations(root,async p=>p.endsWith('/summary')?{...summary,flags:{read:true,control:true,scheduling:true}}:p.endsWith('/schedules')?{rows:[{id:'fixture',config:{objective:'LOGIN_MANAGE',scope:'UNRESOLVED_ONLY',reads:2,discovery:true,totalRequests:50,services:[]},enabled,frequency:'WEEKLY',nextRunAt:enabled?'2026-10-01':null,lastResult:'SKIPPED_CONFLICT'}]}:{rows:[],total:0});await button(root,'Schedules').listeners.click();assert(text(root).includes('SKIPPED_CONFLICT'));assert(button(root,enabled?'Disable':'Enable'));assert(button(root,'Run now'));dispose();});
for(const status of ['RUNNING','COMPLETE','INTERRUPTED','RESUMABLE','SKIPPED_CONFLICT'])test('run status '+status+' visible',async()=>{const root=setup(),dispose=await mountOperations(root,async p=>p.endsWith('/summary')?summary:{rows:[{id:'a'.repeat(24),name:'Fixture',objective:'LOGIN_MANAGE',origin:'CLI',status,requests:3}],total:1});await button(root,'Runs').listeners.click();assert(text(root).includes(status));dispose();});
test('session invalidation prevents operations rendering',async()=>{const root=setup();await mountOperations(root,request,()=>false);assert(!text(root).includes('Current knowledge'));});


test('storage panel shows unknown metrics honestly and exposes no cleanup action',async()=>{const root=setup(),dispose=await mountOperations(root,async p=>p.endsWith('/summary')?summary:p.endsWith('/storage')?{disk:{available:false,admissionAllowed:false,reason:'STORAGE_METRICS_UNAVAILABLE'},inventory:null}:{rows:[],total:0});await button(root,'Storage').listeners.click();assert(text(root).includes('Destructive GC is disabled'));assert(text(root).includes('inventory unavailable'));assert(!button(root,'Delete'));dispose();});
test('compact history panel reads durable projection instead of reconstructing status',async()=>{const root=setup(),dispose=await mountOperations(root,async p=>p.endsWith('/summary')?summary:p.includes('/history?')?{rows:[{runId:'fixture',serviceCount:188,researchComplete:false,finalizationHash:'abc'}]}:{rows:[],total:0});await button(root,'History').listeners.click();assert(text(root).includes('fixture'));assert(text(root).includes('188'));dispose();});

// Targeting API fixture supplies facts; UI never invents cohort/market/category membership.
const targetRows=[{service:'film',name:'Film House',eligible:true,selectable:true,markets:['NO','SE'],categories:['video'],reviewed:true,humanReview:false,retainedTargets:2,aliases:[],providerNames:[],researchComplete:null},{service:'music',name:'Music Club',eligible:true,selectable:true,markets:['SE'],categories:['audio'],reviewed:false,humanReview:true,retainedTargets:0,aliases:[],providerNames:[],researchComplete:null}];
const targetModel={revision:'fixture',rows:targetRows,counts:{eligible:2,baselineExcluded:275,reviewed:1,humanReview:1,retainedServices:1,retainedTargets:2},facets:{markets:[{id:'NO',name:'Norway',services:1},{id:'SE',name:'Sweden',services:2}],categories:[{id:'video',name:'Video & TV',services:1},{id:'audio',name:'Music & Audio',services:1}]},presets:[{id:'ALL',name:'All eligible',services:2},{id:'UNRESOLVED',name:'Unresolved',services:2},{id:'HUMAN_REVIEW',name:'Needs human review',services:1},{id:'REVIEWED',name:'Reviewed providers',services:1},{id:'RETAINED',name:'Retained work',services:1}],marketMeaning:'Investigation scopes, not availability.',categoryMeaning:'Frozen categories.'};
const availability=Object.fromEntries(['direct','tavily','decodo','browser','groq'].map(k=>[k,{available:k!=='browser',reason:k==='browser'?'DOCKER_UNAVAILABLE':null}]));
const checkbox=(root,label)=>descendants(root).find(n=>n.textContent===label&&n.children.some(c=>c.type==='checkbox'))?.children.find(c=>c.type==='checkbox');
async function builder(t,overrides={},history=[],starts=[],jobStatus=null,availabilityOverride=availability){const availability=availabilityOverride;const {selectTargeting}=await import('../../../services/api/src/v2-operations/targeting.mjs');const root=setup(),calls=[];const dispose=await mountOperations(root,async(p,options)=>{const body=options?.body?JSON.parse(options.body):null;calls.push({p,body});if(p.endsWith('/summary'))return {...summary,lifecycleConfigured:true,flags:{read:true,control:true,scheduling:false},capabilityAvailability:availability};if(p.endsWith('/targeting'))return {...targetModel,...selectTargeting(targetModel,body??{})};if(p.endsWith('/preflight'))return {id:'fixture-operation',status:'SUCCEEDED',result:{token:'safe-token',servicesConsidered:body.services.length,totalSafetyCeiling:100,liveReady:true,conflicts:[],storage:{admissionAllowed:true,researchDisk:{admissionAllowed:true}},capabilityCheck:{capabilities:body.capabilities,availability},preflight:{retainedTargets:2},...overrides}};if(p.endsWith('/preflights'))return {rows:history};if(p.endsWith('/starts'))return {rows:starts};if(p.includes('/jobs/')){const id=p.split('/').at(-1);if(jobStatus)return jobStatus(id);return {id,status:'COMPLETE',terminal:true,services:['music'],maximumRequests:10};}if(p.endsWith('/start'))return {id:'start-operation',status:'SUCCEEDED',result:{id:'job',status:'QUEUED'}};return {rows:[],total:0};});t.after(dispose);return {root,calls};}
test('builder immediately browses eligible names and separates baseline and retained target counts',async t=>{const {root,calls}=await builder(t);assert(text(root).includes('Film House'));assert(text(root).includes('Music Club'));assert(text(root).includes('Existing catalog: 275 — excluded'));assert(text(root).includes('1 services / 2 targets'));assert(text(root).includes('2 selected services · 3 service-market targets'));assert(!text(root).includes('FULL_CATALOG'));assert(!button(root,'Preflight').disabled);assert.equal(calls.filter(c=>c.p.endsWith('/targeting')).length,1);assert.equal(checkbox(root,'Direct').checked,true);assert.equal(checkbox(root,'Tavily').checked,true);for(const k of ['Decodo','Browser/Web','Groq'])assert.equal(checkbox(root,k).checked,false);assert.equal(checkbox(root,'Browser/Web').disabled,true);assert(text(root).includes('Docker runtime unavailable on this server'));assert(!text(root).includes('DOCKER_UNAVAILABLE'));});
test('market/category filters, zero results, clear filters and dynamic all matching update preview',async t=>{const {root}=await builder(t);const no=checkbox(root,'Norway (1)');no.checked=true;await no.listeners.change();assert(text(root).includes('1 selected services · 1 service-market targets'));const audio=checkbox(root,'Music & Audio (1)');audio.checked=true;await audio.listeners.change();assert(text(root).includes('No eligible services selected'));assert(button(root,'Preflight').disabled);assert(text(root).includes('Norway · Music & Audio'));await button(root,'Clear filters').listeners.click();assert(text(root).includes('2 selected services'));await button(root,'Clear selection').listeners.click();assert(button(root,'Preflight').disabled);await button(root,'Select all matching (2)').listeners.click();assert(!button(root,'Preflight').disabled);});
test('manual checkboxes select/deselect and filter change explicitly returns to all matching',async t=>{const {root}=await builder(t);const row=()=>descendants(root).find(n=>n.className==='ops-service-row'&&text(n).includes('Film House'));let c=row().children[0];c.checked=false;await c.listeners.change();assert(text(root).includes('1 selected services'));assert(text(root).includes('Manual selection'));c=row().children[0];c.checked=true;await c.listeners.change();assert(text(root).includes('2 selected services'));const no=checkbox(root,'Norway (1)');no.checked=true;await no.listeners.change();assert(text(root).includes('All matching services (follows filters)'));assert(text(root).includes('1 selected services'));});
test('name search previews exact preflight set; preflight never calls start; changes invalidate confirmation',async t=>{const {root,calls}=await builder(t);const search=descendants(root).find(n=>n.placeholder==='Browse below, or type a name');search.value='Music';await search.listeners.input();assert(text(root).includes('1 selected services'));await button(root,'Preflight').listeners.click();const sent=calls.find(c=>c.p.endsWith('/preflight'));assert.deepEqual(sent.body.services,['music']);assert.equal(sent.body.targeting.q,'Music');assert.equal(sent.body.targetingRevision,'fixture');assert.deepEqual(sent.body.capabilities,{direct:true,tavily:true,decodo:false,browser:false,groq:false});assert(text(root).includes('research has not started'));assert(!calls.some(c=>c.p.endsWith('/start')));await button(root,'Confirm and queue run').listeners.click();assert(!calls.some(c=>c.p.endsWith('/start')));checkbox(root,'Decodo').checked=true;checkbox(root,'Decodo').listeners.change();assert(!button(root,'Confirm and queue run'));});
test('start sends only token and deliberate confirmation after successful preflight',async t=>{const {root,calls}=await builder(t);await button(root,'Preflight').listeners.click();globalThis.window.confirm=()=>true;await button(root,'Confirm and queue run').listeners.click();assert.deepEqual(calls.find(c=>c.p.endsWith('/start')).body,{token:'safe-token',confirmed:true});});
test('presets and All dimensions reset correctly without enabling scheduling',async t=>{const {root,calls}=await builder(t);await button(root,'Needs human review (1)').listeners.click();assert(text(root).includes('1 selected services'));await button(root,'Reviewed providers (1)').listeners.click();assert(text(root).includes('Film House'));await button(root,'Retained work (1)').listeners.click();assert(text(root).includes('1 selected services'));await button(root,'All eligible (2)').listeners.click();await button(root,'All markets').listeners.click();await button(root,'All categories').listeners.click();assert(text(root).includes('2 selected services'));assert(!calls.some(c=>c.p.includes('schedules')&&c.body));});
test('unavailable preflight/conflicts expose no Start; changing filters invalidates prior Start',async t=>{for(const overrides of [{liveReady:false},{conflicts:[{name:'Active job'}]}]){const {root}=await builder(t,overrides);await button(root,'Preflight').listeners.click();assert(!button(root,'Confirm and queue run'));assert(text(root).includes('Starting is blocked'));}const {root}=await builder(t);await button(root,'Preflight').listeners.click();assert(button(root,'Confirm and queue run'));await button(root,'Clear selection').listeners.click();assert(!button(root,'Confirm and queue run'));assert(button(root,'Preflight').disabled);});
test('pending Preflight cannot enable Start after instant local filter changes',async t=>{
 const {selectTargeting}=await import('../../../services/api/src/v2-operations/targeting.mjs');const root=setup();let resolve;
 const dispose=await mountOperations(root,async(p,options)=>{if(p.endsWith('/summary'))return {...summary,lifecycleConfigured:true,flags:{control:true,scheduling:false},capabilityAvailability:availability};if(options)return new Promise(r=>{resolve=r;});return {...targetModel,...selectTargeting(targetModel)};});t.after(dispose);
 const pending=button(root,'Preflight').listeners.click();const search=descendants(root).find(n=>n.placeholder==='Browse below, or type a name');search.value='Music';await search.listeners.input();
 assert(text(root).includes('Music Club'));assert(!text(root).includes('Film House'));
 resolve({liveReady:true,conflicts:[],capabilityCheck:{capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false},availability}});await pending;assert(!button(root,'Confirm and queue run'));
});
test('reference-only baseline row cannot be manually checked even if returned alongside preview',async t=>{
 const {selectTargeting}=await import('../../../services/api/src/v2-operations/targeting.mjs');const root=setup(),calls=[];const data={...targetModel,...selectTargeting(targetModel)};data.matching=[...data.matching,{service:'netflix',name:'Netflix',eligible:false,selectable:false,markets:['NO'],categories:['video'],reviewed:false}];
 const dispose=await mountOperations(root,async(p,options)=>{if(p.endsWith('/summary'))return {...summary,lifecycleConfigured:true,flags:{control:true,scheduling:false},capabilityAvailability:availability};if(options)calls.push(JSON.parse(options.body));return data;});t.after(dispose);
 assert(!descendants(root).some(n=>n.className==='ops-service-row'&&text(n).includes('Netflix')));assert.equal(calls.length,0);
});

for(const [key,label]of Object.entries({direct:'Direct',tavily:'Tavily',decodo:'Decodo',browser:'Browser/Web',groq:'Groq'}))test(`independent ${key} permission reaches Preflight without substitutes and invalidates Start`,async t=>{
 const {root,calls}=await builder(t,{},[],[],null,{...availability,browser:{available:true,readiness:'CONDITIONAL'}}),defaults={direct:true,tavily:true,decodo:false,browser:false,groq:false};
 const check=checkbox(root,label);check.checked=!defaults[key];await check.listeners.change();
 await button(root,'Preflight').listeners.click();
 assert.deepEqual(calls.find(c=>c.p.endsWith('/preflight')).body.capabilities,{...defaults,[key]:!defaults[key]});
 const stale=button(root,'Confirm and queue run');
 check.checked=defaults[key];await check.listeners.change();
 assert(!button(root,'Confirm and queue run'));
 globalThis.window.confirm=()=>true;if(stale)await stale.listeners.click();
 assert(!calls.some(c=>c.p.endsWith('/start')));
});
test('unavailable tools cannot be enabled; permission and actual usage remain separate',async t=>{
 const {root,calls}=await builder(t,{liveReady:false});assert(text(root).includes('Actual usage is reported in run details separately from permission'));
 const check=checkbox(root,'Browser/Web');assert.equal(check.disabled,true);check.checked=true;await check.listeners.change();assert.equal(check.checked,false);
 await button(root,'Preflight').listeners.click();assert(text(root).includes('Docker runtime unavailable on this server'));assert(!button(root,'Confirm and queue run'));assert.equal(calls.find(c=>c.p.endsWith('/preflight')).body.capabilities.browser,false);
});
test('server permission substitution fails closed before Start',async t=>{
 const {root}=await builder(t,{capabilityCheck:{capabilities:{direct:true,tavily:true,decodo:true,browser:false,groq:false},availability}});
 await button(root,'Preflight').listeners.click();assert(text(root).includes('tool permissions differ'));assert(!button(root,'Confirm and queue run'));
});

test('research tools remain native labelled switch controls with decorative tracks and separate availability',async t=>{
 const {root}=await builder(t);
 for(const name of ['Direct','Tavily','Decodo','Browser/Web','Groq']){
  const input=checkbox(root,name),label=descendants(root).find(n=>n.className==='ops-tool-switch'&&n.children.includes(input));
  assert(label);assert.equal(input.type,'checkbox');assert.equal(input.role,'switch');
  assert.equal(input['aria-label'],name+' — allowed for this run');
  assert.equal(input.disabled,name==='Browser/Web');
  const track=label.children[label.children.indexOf(input)+1];
  assert.equal(track.className,'ops-tool-switch-track');assert.equal(track['aria-hidden'],'true');
  assert(label.children.some(n=>n.className?.split(' ').includes('ops-tool-switch-availability')));
  assert.equal(label.listeners.click,undefined,'native label toggles once; no duplicate scripted click handler');
 }
});

test('readiness is explicit for ready, conditional, missing configuration and stored ON',()=>{
 for(const allowed of [false,true])for(const key of ['direct','tavily','groq']){const x=capabilityControl(key,{available:true,readiness:'AVAILABLE'},allowed);assert.equal(x.checked,allowed);assert.equal(x.disabled,false);assert.match(x.text,/Ready/);}
 for(const key of ['decodo','browser'])assert.match(capabilityGuidance(key,{available:true,readiness:'CONDITIONAL'}),/Conditional/);
 for(const [reason,copy]of Object.entries({GROQ_KEY_REQUIRED:'API key not configured',GROQ_MODEL_REQUIRED:'Model not configured',GROQ_MODEL_INVALID:'Model configuration is invalid',DECODO_CREDENTIALS_REQUIRED:'Credentials not configured',DOCKER_UNAVAILABLE:'Docker runtime unavailable on this server'})){
  const status={available:false,reason,readiness:'UNAVAILABLE'},before=JSON.stringify(status),x=capabilityControl('groq',status,true);assert.equal(x.checked,true);assert.equal(x.disabled,false,'stored ON may be switched OFF');assert(x.text.includes(copy));assert.match(x.text,/Cannot run/);assert.equal(capabilityControl('groq',status,false).disabled,true);assert.equal(JSON.stringify(status),before);
 }
});
test('bulk enable includes conditional and excludes unavailable server capabilities',async t=>{
 const statuses={direct:{available:true},tavily:{available:true},decodo:{available:true,readiness:'CONDITIONAL'},browser:{available:false,reason:'DOCKER_UNAVAILABLE'},groq:{available:false,reason:'GROQ_MODEL_REQUIRED'}},expected={direct:true,tavily:true,decodo:true,browser:false,groq:false};
 assert.deepEqual(availablePermissions(statuses),expected);const {root,calls}=await builder(t,{},[],[],null,statuses);await button(root,'Enable all available capabilities').listeners.click();await button(root,'Preflight').listeners.click();assert.deepEqual(calls.find(c=>c.p.endsWith('/preflight')).body.capabilities,expected);assert(text(root).includes('Conditional'));assert(text(root).includes('Model not configured'));
});

test('ordinary interactions use one snapshot; explicit refresh alone reloads it',async t=>{
 const {root,calls}=await builder(t);
 await button(root,'Reviewed providers (1)').listeners.click();await button(root,'All eligible (2)').listeners.click();
 const market=checkbox(root,'Norway (1)');market.checked=true;await market.listeners.change();
 await button(root,'All markets').listeners.click();await button(root,'All categories').listeners.click();
 await button(root,'Clear selection').listeners.click();await button(root,'Select all matching (2)').listeners.click();
 const search=descendants(root).find(n=>n.placeholder==='Browse below, or type a name');search.value='Music';await search.listeners.input();
 checkbox(root,'Decodo').checked=true;await checkbox(root,'Decodo').listeners.change();
 assert.equal(calls.filter(c=>c.p.endsWith('/targeting')).length,1);assert(!calls.some(c=>c.p.endsWith('/targeting')&&c.body));
 await button(root,'Preflight').listeners.click();assert.deepEqual(calls.find(c=>c.p.endsWith('/preflight')).body.services,['music']);
 await button(root,'Refresh targeting').listeners.click();assert.equal(calls.filter(c=>c.p.endsWith('/targeting')).length,2);
});
test('local preview matches server selection semantics across facets and presets',async()=>{
 const {selectTargeting}=await import('../../../services/api/src/v2-operations/targeting.mjs');const model={...targetModel,...selectTargeting(targetModel)};
 for(const preset of ['ALL','UNRESOLVED','HUMAN_REVIEW','REVIEWED','RETAINED'])for(const markets of [[],...targetModel.facets.markets.map(f=>[f.id]),targetModel.facets.markets.map(f=>f.id)])for(const categories of [[],...targetModel.facets.categories.map(f=>[f.id])])for(const services of [null,[],['music']]){
 const filters={preset,markets,categories,services,q:''},server=selectTargeting(targetModel,filters),local=previewTargeting(model,filters);
 for(const key of Object.keys(server))assert.deepEqual(local[key],server[key],key);
 }
});

test('selection and capability edits preserve the existing service list nodes',async t=>{
 const {root,calls}=await builder(t);const row=descendants(root).find(n=>n.className==='ops-service-row'),check=row.children[0];
 check.checked=false;await check.listeners.change();assert(descendants(root).includes(row));
 const capability=checkbox(root,'Tavily');capability.checked=false;await capability.listeners.change();assert(descendants(root).includes(row));
 assert.equal(calls.filter(c=>c.p.endsWith('/targeting')).length,1);
 await button(root,'Preflight').listeners.click();assert.equal(calls.find(c=>c.p.endsWith('/preflight')).body.services.length,1);
});

test('long preflight polls short authenticated status requests without Start or a held HTTP request',async()=>{
 const {awaitPreflight}=await import('./v2-operations.js');let polls=0,elapsed=0;
 const result=await awaitPreflight({id:'opaque',status:'RUNNING'},async path=>{
  assert.equal(path,'v2-operations/preflights/opaque');polls++;
  return polls===68?{status:'SUCCEEDED',result:{token:'sealed',expiresAt:'unchanged'}}:{id:'opaque',status:'RUNNING'};
 },()=>true,async ms=>{elapsed+=ms;});
 assert.equal(elapsed,340000);assert.equal(result.token,'sealed');assert.equal(polls,68);
});
test('polling stops on logout/view change, failure or transport loss; never treats these as completion',async()=>{
 const {awaitPreflight}=await import('./v2-operations.js');let calls=0;
 await assert.rejects(awaitPreflight({id:'x',status:'RUNNING'},async()=>{calls++;},()=>false,async()=>{}),/view changed/);assert.equal(calls,0);
 await assert.rejects(awaitPreflight({status:'FAILED',error:'PREFLIGHT_VALIDATION_FAILED'},async()=>{}),/VALIDATION_FAILED/);
 await assert.rejects(awaitPreflight({id:'x',status:'RUNNING'},async()=>{throw Error('offline');},()=>true,async()=>{}),/offline/);
 await assert.rejects(awaitPreflight({status:'EXPIRED'},async()=>{}),/expired/);
});


test('relogin recovery restores exact selection and permissions before reviewing the saved token',async t=>{
 const caps={direct:true,tavily:true,decodo:false,browser:false,groq:false};
 const prior={id:'operation',status:'SUCCEEDED',input:{objective:'MATURE_LIFECYCLE',services:['music'],targetingRevision:'fixture',targeting:{preset:'ALL',markets:[],categories:[],services:['music'],q:''},capabilities:caps},result:{token:'recovered-token',liveReady:true,conflicts:[],totalSafetyCeiling:10,capabilityCheck:{capabilities:caps,availability},storage:{admissionAllowed:true,researchDisk:{admissionAllowed:true}}}};
 const {root,calls}=await builder(t,{},[prior]);await button(root,'Recover Preflight').listeners.click();
 assert(text(root).includes('1 selected services'));assert(button(root,'Confirm and queue run'));
 assert(!calls.some(c=>c.p.endsWith('/preflight')));assert(!calls.some(c=>c.p.endsWith('/start')));
 globalThis.window.confirm=()=>true;await button(root,'Confirm and queue run').listeners.click();assert.deepEqual(calls.find(c=>c.p.endsWith('/start')).body,{token:'recovered-token',confirmed:true});
});


test('long confirmed Start polls without resubmitting and handles disconnect with recovery guidance',async()=>{
 const {awaitStart}=await import('./v2-operations.js');let polls=0,elapsed=0;
 const job=await awaitStart({id:'start',status:'RUNNING'},async url=>{assert.equal(url,'v2-operations/starts/start');return ++polls===68?{status:'SUCCEEDED',result:{id:'one-job'}}:{id:'start',status:'RUNNING'};},()=>true,async ms=>{elapsed+=ms;});
 assert.equal(elapsed,340000);assert.equal(job.id,'one-job');
 await assert.rejects(awaitStart({id:'start',status:'RUNNING'},async()=>{throw Error('disconnect');},()=>true,async()=>{}),/Recover Start/);
 await assert.rejects(awaitStart({status:'RUNNING'},async()=>{},()=>false),/Recover Start/);
 await assert.rejects(awaitStart({status:'FAILED',error:'PREFLIGHT_STALE'},async()=>{}),/PREFLIGHT_STALE/);
});


test('Recover Start after relogin displays the committed job without submitting any new Start',async t=>{
 const {root,calls}=await builder(t,{},[],[{id:'confirmation',kind:'START',status:'SUCCEEDED',result:{id:'existing-job',status:'RUNNING',config:{services:['music']}}}]);
 await button(root,'Recover Start').listeners.click();assert(text(root).includes('Job existing-job: COMPLETE'));
 assert(!calls.some(c=>c.p.endsWith('/start')));assert(!calls.some(c=>c.p.endsWith('/preflight')));
});

for(const [status,message]of [['EXPIRED','Preflight expired. Run Preflight again before Start.'],['FAILED','Preflight failed. Run Preflight again before Start. No research has started.'],[null,'No recoverable Preflight. No research has started.']])test(`recovery ${status??'without a record'} clears stale Start permission and explains outcome`,async t=>{
 const history=status?[{id:'latest',status,input:{objective:'MATURE_LIFECYCLE'}},{id:'older',status:'SUCCEEDED',input:{objective:'MATURE_LIFECYCLE'}}]:[];
 const {root,calls}=await builder(t,{},history);await button(root,'Preflight').listeners.click();const staleStart=button(root,'Confirm and queue run');assert(staleStart);
 await button(root,'Recover Preflight').listeners.click();assert(text(root).includes(message));assert(!button(root,'Confirm and queue run'));
 globalThis.window.confirm=()=>true;await staleStart.listeners.click();assert(!calls.some(c=>c.p.endsWith('/start')));assert.equal(calls.filter(c=>c.p.endsWith('/preflight')).length,1);
});

test('live monitor replaces queued receipt through preparation/running/complete without targeting or Start calls',async()=>{
 const requests=[],updates=[],pending=[];const rows=[{status:'QUEUED',phase:'Validating execution'},{status:'RUNNING'},{status:'COMPLETE',terminal:true}];
 monitorJob('job',async p=>{requests.push(p);return {id:'job',terminal:false,...rows.shift()};},(job,error)=>updates.push(job??error),()=>true,(fn,ms)=>{assert.equal(ms,10000);pending.push(fn);return fn;},()=>{});
 await Promise.resolve();assert.equal(updates[0].phase,'Validating execution');await pending.shift()();await pending.shift()();
 assert.deepEqual(updates.map(j=>j.status),['QUEUED','RUNNING','COMPLETE']);assert.equal(pending.length,0);assert(requests.every(p=>p==='v2-operations/jobs/job'));
});
test('live monitoring temporary failure preserves status and cancellation discards in-flight results',async()=>{
 let resolve;const updates=[],pending=[];let calls=0;
 const stop=monitorJob('job',async()=>{if(++calls===1)throw Error('offline');return new Promise(r=>resolve=r);},(job,error)=>updates.push(job??error),()=>true,fn=>{pending.push(fn);return fn;},()=>{});
 await Promise.resolve();assert.match(updates[0],/temporarily unavailable/);const running=pending.shift()();stop();resolve({id:'job',status:'RUNNING',terminal:false});await running;assert.equal(updates.length,1);
});
for(const status of ['COMPLETE','FAILED','STOPPED','INTERRUPTED','SKIPPED_CONFLICT','SKIPPED_NOT_DUE'])test('live monitoring stops at '+status,async()=>{
 let displayed;monitorJob('job',async()=>({id:'job',status,terminal:true}),(job)=>displayed=job,()=>true,()=>{throw Error('Must not poll terminal job');},()=>{});await Promise.resolve();assert.equal(displayed.status,status);
});

test('confirmed Start automatically replaces QUEUED receipt with authoritative COMPLETE',async t=>{
 const {root,calls}=await builder(t);await button(root,'Preflight').listeners.click();globalThis.window.confirm=()=>true;await button(root,'Confirm and queue run').listeners.click();await Promise.resolve();
 assert(text(root).includes('Job job: COMPLETE'));assert(!text(root).includes('Job job: QUEUED'));
 assert.equal(calls.filter(c=>c.p.includes('/jobs/')).length,1);assert.equal(calls.filter(c=>c.p.endsWith('/targeting')).length,1);
 await button(root,'Coverage').listeners.click();assert(text(root).includes('Job job: COMPLETE'));
});
test('replacing a monitor prevents an older in-flight request from updating the new job',async()=>{
 let finishOld;const seen=[];const stop=monitorJob('old',()=>new Promise(r=>finishOld=r),job=>seen.push(job.id),()=>true,()=>{throw Error('old timer');},()=>{});
 stop();monitorJob('new',async()=>({id:'new',status:'COMPLETE',terminal:true}),job=>seen.push(job.id),()=>true,()=>{throw Error('terminal timer');},()=>{});
 finishOld({id:'old',status:'RUNNING',terminal:false});await Promise.resolve();await Promise.resolve();assert.deepEqual(seen,['new']);
});

test('logout prevents further live status requests and repeated failures have a fixed bound',async()=>{
 let active=true,requests=0;const pending=[];
 monitorJob('job',async()=>{requests++;throw Error('offline');},()=>{},()=>active,fn=>{pending.push(fn);return fn;},()=>{});
 await Promise.resolve();active=false;await pending.shift()();assert.equal(requests,1);
 active=true;monitorJob('job',async()=>{requests++;throw Error('offline');},()=>{},()=>active,fn=>{pending.push(fn);return fn;},()=>{});
 await Promise.resolve();while(pending.length)await pending.shift()();assert.equal(requests,6);
});

test('live polls mutate stable fields without resetting targeting, focus, expanded sections or shell',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let status='QUEUED';
 const {root,calls}=await builder(t,{},[],[],id=>({id,status,terminal:status==='COMPLETE',services:['music'],maximumRequests:20,updatedAt:status}));
 const search=descendants(root).find(n=>n.placeholder==='Browse below, or type a name');search.value='Music';await search.listeners.input();
 const market=checkbox(root,'Sweden (2)');market.checked=true;await market.listeners.change();
 const groq=checkbox(root,'Groq');groq.checked=true;groq.listeners.change();
 await button(root,'Preflight').listeners.click();globalThis.window.confirm=()=>true;await button(root,'Confirm and queue run').listeners.click();
 document.activeElement=search;root.scrollTop=427;const panels=descendants(root).filter(n=>n.children.some(c=>c.textContent==='Markets — optional'));for(const p of panels)p.open=true;
 const before=descendants(root),counts=before.map(n=>n.replacements??0),requests=calls.length;
 for(const next of ['RUNNING','RUNNING','COMPLETE']){status=next;t.mock.timers.tick(10000);await Promise.resolve();await Promise.resolve();assert(text(root).includes('Job job: '+next));}
 assert.deepEqual(descendants(root),before);assert.deepEqual(before.map(n=>n.replacements??0),counts);
 assert.equal(document.activeElement,search);assert.equal(search.value,'Music');assert.equal(root.scrollTop,427);assert(market.checked);assert(groq.checked);assert(panels.every(p=>p.open));assert(text(root).includes('1 selected services'));
 assert(calls.slice(requests).every(c=>!c.body&&(c.p==='v2-operations/jobs/job'||c.p.startsWith('v2-operations/runs'))));assert.equal(calls.filter(c=>c.p.endsWith('/targeting')).length,1);
 const done=calls.length;t.mock.timers.tick(60000);await Promise.resolve();assert.equal(calls.length,done);
});

test('run Inspect polls only exact job fields; open artifacts, service inspection and typed inputs remain',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const root=setup(),calls=[];let status='QUEUED';
 const run={id:'run-projection',jobId:'owned-job',owned:true,name:'Fixture run',objective:'MATURE_LIFECYCLE',origin:'ADMIN',status:'QUEUED',actor:'owner'};
 const dispose=await mountOperations(root,async(p)=>{calls.push(p);
  if(p.endsWith('/summary'))return summary;
  if(p.includes('/jobs/'))return {id:'owned-job',status,terminal:status==='COMPLETE',services:['music'],maximumRequests:20};
  if(p==='v2-operations/runs/run-projection')return {run,efficiency:{},events:[]};
  if(p.includes('/artifacts/'))return {status:'QUEUED'};
  if(p.startsWith('v2-operations/services?'))return {rows:[{service:'music',name:'Music Club'}],total:1};
  if(p.startsWith('v2-operations/services/music'))return {name:'Music Club',evidence:[],priceEvidence:[]};
  if(p.startsWith('v2-operations/runs?'))return {rows:[run],total:1};return {rows:[],total:0};
 });t.after(dispose);
 await button(root,'Runs').listeners.click();await workspaceDetails(root).listeners.click();
 const firstJobReads=calls.filter(p=>p==='v2-operations/jobs/owned-job').length;
 await button(root,'Runs').listeners.click();await workspaceDetails(root).listeners.click();
 assert.equal(calls.filter(p=>p==='v2-operations/jobs/owned-job').length,firstJobReads,'reopening the tracked job shares the existing poll loop');
 await button(root,'checkpoint').listeners.click();await workspaceDetails(root).listeners.click();
 const search=descendants(root).find(n=>n.textContent==='Search services').children[0];
 // Set an existing control's draft value and focus; polling must not replace it.
 search.value='unsaved draft';document.activeElement=search;root.scrollTop=620;
 const nodes=descendants(root),replacements=nodes.map(n=>n.replacements??0),requestCount=calls.length;
 assert(text(root).includes('Structured checkpoint'));assert(text(root).includes('Music Club'));
 status='RUNNING';t.mock.timers.tick(10000);await Promise.resolve();await Promise.resolve();
 status='COMPLETE';t.mock.timers.tick(10000);await Promise.resolve();await Promise.resolve();
 assert.deepEqual(descendants(root),nodes);assert.deepEqual(nodes.map(n=>n.replacements??0),replacements);assert.equal(search.value,'unsaved draft');assert.equal(document.activeElement,search);assert.equal(root.scrollTop,620);
 assert(!text(root).includes('MATURE_LIFECYCLE · ADMIN · COMPLETE'));assert(calls.slice(requestCount).every(p=>p==='v2-operations/jobs/owned-job'));assert(text(root).includes('Job owned-job: COMPLETE'));
 assert(nodes.filter(n=>n.open).length>=2);const done=calls.length;t.mock.timers.tick(30000);await Promise.resolve();assert.equal(calls.length,done);
});

test('service summaries use responsive cards, readable reasons; Inspect retains full dimensions and safe lead form',async t=>{
 const root=setup(),calls=[],leads=[];const service={service:'film',name:'Film House',state:'PARTIAL',authority:'ESTABLISHED',identity:'ESTABLISHED',markets:'UNRESOLVED',login:'ESTABLISHED',management:'UNRESOLVED',cancellation:'UNRESOLVED',requests:0,evidenceCount:0,evidence:[],pricing:[],unresolvedReasons:[{kind:'BUDGET_LIMITED',reason:'BUDGET_EXHAUSTED',scope:'KNOWN_REVIEWED_ACTION_SPACE_ONLY'}]};
 const dispose=await mountOperations(root,async(p,o)=>{calls.push(p);if(p.endsWith('/summary'))return summary;if(p.endsWith('/leads')){if(o?.method==='POST'){const body=JSON.parse(o.body);leads.push({...body,leadId:'fixture',status:'UNVERIFIED',createdBy:'You',createdAt:'2026-09-23',canDeactivate:true});return leads.at(-1);}return {rows:leads,outcomes:[],types:['GENERAL','PRICING'],markets:['NO','SE'],canCreate:true};}if(p==='v2-operations/services/film')return service;if(p.startsWith('v2-operations/services?'))return {rows:[service],total:1};return {rows:[],total:0};});t.after(dispose);
 await button(root,'Services').listeners.click();assert(descendants(root).some(n=>n.className==='ops-result-card'));assert(text(root).includes('Budget exhausted'));assert(!text(root).includes('KNOWN_REVIEWED_ACTION_SPACE_ONLY'));
 await button(root,'View details').listeners.click();assert(text(root).includes('KNOWN_REVIEWED_ACTION_SPACE_ONLY'));for(const label of ['Provider / authority','Account access','Pricing','Research gaps','Human Review · Research leads'])assert(text(root).includes(label));
 const field=name=>descendants(root).find(n=>n.textContent===name).children[0],url=field('Source URL'),note=field('Operator note (optional)');url.value='https://provider.example/pricing';note.value='<script>bad()</script>';document.activeElement=url;root.scrollTop=321;
 const operations=descendants(root).find(n=>n.id==='v2-operations'),replacements=operations.replacements,requests=calls.length;
 await button(root,'Save research lead').listeners.click();assert.equal(operations.replacements,replacements);assert.equal(document.activeElement,url);assert.equal(root.scrollTop,321);assert(text(root).includes('<script>bad()</script>'));assert(text(root).includes('Unverified'));assert(calls.slice(requests).every(p=>p.endsWith('/leads')));assert(!calls.some(p=>p.includes('/targeting')));
});
test('Preflight displays frozen human leads without trusting them or changing Start payload',async t=>{const {root,calls}=await builder(t,{humanLeads:[{serviceId:'film',type:'PRICING',url:'https://example.com/pricing',marketScope:[],status:'UNVERIFIED'}]});await button(root,'Preflight').listeners.click();assert(text(root).includes('Human research leads: 1'));assert(text(root).includes('https://example.com/pricing'));assert(text(root).includes('V2 must acquire and verify'));assert(!calls.some(c=>c.p.endsWith('/start')));});

test('stored unavailable ON remains visible until explicitly switched off; viewing never rewrites schedule',async t=>{
 const root=setup(),schedule={id:'fixture',config:{objective:'MATURE_LIFECYCLE',scope:'UNRESOLVED_ONLY',services:[],capabilities:{direct:true,tavily:true,decodo:false,browser:true,groq:false}},enabled:false,frequency:'MANUAL'},before=JSON.stringify(schedule),writes=[];
 const dispose=await mountOperations(root,async(p,options)=>{if(options)writes.push(p);if(p.endsWith('/summary'))return {...summary,lifecycleConfigured:true,capabilityAvailability:availability};if(p.endsWith('/schedules'))return {rows:[schedule]};return {rows:[],total:0};});t.after(dispose);
 await button(root,'Schedules').listeners.click();const check=checkbox(root,'Browser / JavaScript');assert(check,text(root));assert.equal(check.checked,true);assert.equal(check.disabled,false);assert(text(root).includes('Permission ON · Unavailable'));assert(text(root).includes('Cannot run'));
 check.checked=false;await check.listeners.change();assert.equal(check.disabled,true);assert.equal(JSON.stringify(schedule),before);assert.deepEqual(writes,[]);
});

test('live projection uses measured accounting and final service states, never readiness as usage',()=>{
 const job={id:'job',status:'COMPLETE',terminal:true,services:['fixture'],startedAt:'2026-01-01T00:00:00Z',finishedAt:'2026-01-01T00:02:05Z',maximumRequests:36};
 const run={requests:5,capabilities:{browser:true,groq:true},routes:{BROWSER:0},acquisitionMetrics:{directPageRequests:2,robotsRequests:2,tavilySearches:1,decodoRequests:0},lifecycle:{executionComplete:true,researchComplete:false,humanReviewRequired:1}};
 const v=liveStatusView(job,run,{total:1,rows:[{marketScope:['DE'],pricing:[{market:'DE',status:'UNRESOLVED'}]}]});
 assert.equal(v.title,'Execution result');assert.equal(v.budget,'Requests: 5 / 36');assert.match(v.usage,/Direct requests: 4/);assert.match(v.usage,/Tavily searches: 1/);assert.match(v.usage,/Decodo requests: 0/);assert(!v.usage.includes('Browser'));assert(!v.usage.includes('Groq'));assert.match(v.review,/required: 1/);assert.match(v.pricing,/DE: UNRESOLVED/);assert.equal(v.research,'Research remains incomplete');assert.match(v.elapsed,/2m 5s/);assert.match(v.markets,/DE/);
 const actual=liveStatusView(job,{...run,capabilityUsage:{browserExecutions:2,groqCalls:3}});assert.match(actual.usage,/Browser executions: 2/);assert.match(actual.usage,/Groq calls: 3/);
 assert.equal(liveStatusView(job).research,'Research completion not reported');assert.equal(liveStatusView(job).usage,'Measured tool usage not reported');assert.equal(liveStatusView(job,{lifecycle:{researchComplete:true}}).research,'Research complete');
});
test('pipeline never invents validation or detailed research activity',()=>{
 for(const status of ['QUEUED','RUNNING','COMPLETE','FAILED','INTERRUPTED','UNKNOWN']){const v=liveStatusView({id:'x',status,terminal:status==='COMPLETE'});assert(!v.pipeline.some(([label])=>label==='Validation'));assert(!v.activity.includes('Verifying offer'));assert.equal(v.tone,statusTone(status));}
 const v=liveStatusView({id:'x',status:'QUEUED',phase:'Validating execution'});assert.equal(v.activity,'Queued — waiting to start execution');assert.equal(v.pipeline[0][1],'current');assert.equal(v.pipeline[1][1],'unknown');
 assert.equal(liveStatusView({id:'x',status:'RUNNING'}).activity,'Running');
});
test('active job is above history; completion updates stable nodes, preserves Preflight and opens results',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const root=setup();let status='RUNNING',requests=2;const calls=[];
 const run=()=>({id:'run',jobId:'job',owned:true,name:'Fixture',status,origin:'ADMIN',objective:'MATURE_LIFECYCLE',requests,lifecycle:{executionComplete:status==='COMPLETE',researchComplete:false,humanReviewRequired:status==='COMPLETE'?1:0}});
 const dispose=await mountOperations(root,async(p,o)=>{calls.push(p);if(p.endsWith('/summary'))return {...summary,health:{...summary.health,latest:run()}};if(p.includes('/jobs/'))return {id:'job',status,terminal:status==='COMPLETE',services:['fixture'],maximumRequests:36};if(p.startsWith('v2-operations/runs?'))return {rows:[run(),{id:'legacy',name:'Legacy',status:'UNKNOWN',origin:'UNKNOWN/HISTORICAL'}],total:2};if(p==='v2-operations/runs/run')return {run:run(),services:{total:1,rows:[{service:'fixture',pricing:[{market:'DE',status:'UNRESOLVED'}],humanReview:['RETAINED_REVIEW']}]},events:[]};return {rows:[],total:0};});t.after(dispose);
 const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};await flush();await button(root,'Runs').listeners.click();await flush();
 const card=descendants(root).find(n=>n.className?.startsWith('ops-live-card'));const all=descendants(root);assert(all.indexOf(card)<all.findIndex(n=>n.textContent==='Legacy'));assert(all.some(n=>n.className==='ops-historical'));assert(!button(root,'Inspect'));
 const input=descendants(root).find(n=>n.type==='number');input.value='42 draft';document.activeElement=input;root.scrollTop=500;const preflight=button(root,'Preflight'),preflightDisabled=preflight.disabled,nodes=descendants(root),replacements=nodes.map(n=>n.replacements??0);
 requests=5;status='COMPLETE';t.mock.timers.tick(10000);await flush();assert.deepEqual(descendants(root),nodes);assert.deepEqual(nodes.map(n=>n.replacements??0),replacements);assert.equal(document.activeElement,input);assert.equal(input.value,'42 draft');assert.equal(root.scrollTop,500);assert.equal(button(root,'Preflight'),preflight);assert.equal(preflight.disabled,preflightDisabled);
 assert(text(card).includes('Execution result'));assert(text(card).includes('Requests: 2 / 36'));assert(!calls.includes('v2-operations/runs/run')); assert(text(card).includes('Research remains incomplete'));
 await button(root,'View results').listeners.click();const headings=descendants(root).filter(n=>n.className==='ops-inspect-section').map(n=>n.children[0].textContent);assert.deepEqual(headings.slice(0,6),['Summary','Research','Pricing','Evidence','Gaps','Human Review']);assert(text(root).includes('Technical'));assert(calls.includes('v2-operations/runs/run'));
});

test('status styling has text alternatives, reduced motion and a narrow-screen layout',()=>{
 const css=fs.readFileSync(new URL('./admin.css',import.meta.url),'utf8');assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.ops-stage-current\{animation:none/);assert.match(css,/@media\(max-width:600px\)/);
 for(const [status,tone]of Object.entries({COMPLETE:'success',RUNNING:'active',QUEUED:'attention',FAILED:'error',UNKNOWN:'muted'}))assert.equal(statusTone(status),tone);
 const v=liveStatusView({id:'x',status:'COMPLETE',terminal:true},{lifecycle:{humanReviewRequired:1}},{rows:[{pricing:[{status:'UNRESOLVED'}]}],total:1});assert.equal(v.reviewTone,'attention');assert.equal(v.pricingTone,'attention');assert.match(v.status,/COMPLETE/);assert.match(v.review,/required: 1/);
});
test('local workflow persists from immediate Preflight through admission, polling and result',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const root=setup(),calls=[];let release,status='QUEUED';const pending=new Promise(r=>release=r);
 const run=()=>({id:'local-run',jobId:'local-job',status,owned:true,requests:3,lifecycle:{executionComplete:status==='COMPLETE',researchComplete:false,humanReviewRequired:1}});
 const dispose=await mountOperations(root,async(p,o)=>{
  calls.push(p);const body=o?.body?JSON.parse(o.body):null;
  if(p.endsWith('/summary'))return {...summary,lifecycleConfigured:true,flags:{read:true,control:true,scheduling:false},capabilityAvailability:availability};
  if(p.endsWith('/targeting'))return {...targetModel,matching:targetRows};
  if(p.endsWith('/preflight')){await pending;return {status:'SUCCEEDED',result:{token:'local-token',liveReady:true,conflicts:[],totalSafetyCeiling:36,capabilityCheck:{capabilities:body.capabilities,availability},storage:{admissionAllowed:true,researchDisk:{admissionAllowed:true}}}};}
  if(p.endsWith('/start'))return {status:'SUCCEEDED',result:{id:'local-job',status:'QUEUED'}};
  if(p.includes('/jobs/'))return {id:'local-job',status,phase:status==='QUEUED'?'Validating execution':status==='RUNNING'?'Recorded worker activity':null,terminal:status==='COMPLETE'};
  if(p==='v2-operations/runs/local-run')return {run:run(),services:{total:1,rows:[{pricing:[{market:'DE',status:'UNRESOLVED'}]}]},events:[]};
  if(p.startsWith('v2-operations/runs?limit='))return {rows:[run()],total:1};
  return {rows:[],total:0};
 });t.after(dispose);const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
 const preflight=button(root,'Preflight'),workflow=descendants(root).find(n=>n.className==='ops-workflow');assert.equal(preflight.parentElement.className,'ops-primary-actions');assert.equal(preflight.parentElement.parentElement,workflow.parentElement);
 const card=descendants(workflow).find(n=>n.className?.startsWith('ops-live-card'));assert(card);assert.equal(descendants(root).filter(n=>n.className?.startsWith('ops-live-card')).length,1);
 const checking=preflight.listeners.click();assert(text(workflow).includes('Preflight in progress'));assert(!text(workflow).includes('No research is running'));
 release();await checking;assert(text(workflow).includes('ready to confirm Start'));assert(text(workflow).includes('Film House'));assert(text(workflow).includes('Maximum new external requests'));assert(text(workflow).includes('36'));
 window.confirm=()=>true;await button(root,'Confirm and queue run').listeners.click();await flush();assert(text(workflow).includes('Admission recorded for job local-job'));assert(text(workflow).includes('Admitted Preflight snapshot'));assert(text(workflow).includes('Queued — waiting to start execution'));assert(!text(workflow).includes('Validating execution'));assert(!card.hidden);assert(button(root,'Confirm and queue run').hidden);
 const input=descendants(root).find(n=>n.placeholder==='Browse below, or type a name');input.value='unfinished draft';document.activeElement=input;root.scrollTop=550;const control=checkbox(root,'Direct');const open=descendants(root).find(n=>n.children.some(c=>c.textContent==='Markets — optional'));open.open=true;
 const nodes=descendants(root),replacements=nodes.map(n=>n.replacements??0);
 for(const next of ['RUNNING','COMPLETE']){status=next;t.mock.timers.tick(10000);await flush();if(next==='RUNNING')assert(text(workflow).includes('Recorded worker activity'));}
 assert.deepEqual(descendants(root),nodes);assert.deepEqual(nodes.map(n=>n.replacements??0),replacements);assert.equal(document.activeElement,input);assert.equal(input.value,'unfinished draft');assert.equal(root.scrollTop,550);assert(open.open);assert.equal(checkbox(root,'Direct'),control);assert.equal(button(root,'Preflight'),preflight);
 assert(text(workflow).includes('Execution complete'));assert(!calls.includes('v2-operations/runs/local-run')); assert(text(workflow).includes('Admitted Preflight snapshot'));assert(button(card,'View results'));assert.equal(calls.filter(p=>p.endsWith('/start')).length,1);
});

test('queued preparation and running integrity validation require authoritative phases',()=>{
 assert.equal(liveStatusView({id:'job',status:'QUEUED',phase:'Preparing execution'}).activity,'Preparing execution');
 assert.equal(liveStatusView({id:'job',status:'QUEUED'}).activity,'Queued — waiting to start execution');
 assert.equal(liveStatusView({id:'job',status:'RUNNING',phase:'Validating execution integrity'}).activity,'Validating execution integrity');
});

import {activeWorkflowAction,setWorkflowBusy,awaitPreflight,awaitStart} from './v2-operations.js';
for(const action of ['preflight','confirm','run'])test('workflow immediate pending selects only '+action,()=>{assert.equal(activeWorkflowAction({pending:action}),action);});
for(const [key,action]of [['preflight','preflight'],['start','confirm']]){
 test(action+' backend running and terminal mapping',()=>{assert.equal(activeWorkflowAction({[key]:{status:'RUNNING'}}),action);for(const status of ['SUCCEEDED','FAILED','EXPIRED'])assert.equal(activeWorkflowAction({[key]:{status}}),null);});
 test(action+' polling publishes authoritative state transitions',async()=>{const seen=[],wait=key==='preflight'?awaitPreflight:awaitStart;await wait({id:'op',status:'RUNNING'},async()=>({id:'op',status:'SUCCEEDED',result:{}}),()=>true,async()=>{},state=>seen.push(state.status));assert.deepEqual(seen,['RUNNING','SUCCEEDED']);});
}
for(const status of ['COMPLETE','FAILED','STOPPED','INTERRUPTED','SKIPPED_CONFLICT','SKIPPED_NOT_DUE'])test('Run stops for authoritative terminal '+status,()=>{assert.equal(activeWorkflowAction({job:{status,terminal:true}}),null);});
test('Run maps queued/running, not disabled controls or unknown state',()=>{for(const status of ['QUEUED','RUNNING'])assert.equal(activeWorkflowAction({job:{status,terminal:false}}),'run');assert.equal(activeWorkflowAction({job:{status:'RUNNING',terminal:true}}),null);assert.equal(activeWorkflowAction({disabled:true}),null);});
test('busy styling preserves button classes and provides reduced-motion static state',()=>{const b=new Element();b.className='existing';b.disabled=true;setWorkflowBusy(b,false);assert.equal(b.className,'existing');setWorkflowBusy(b,true);assert.equal(b['aria-busy'],'true');assert(b.className.includes('ops-action-busy'));setWorkflowBusy(b,false);assert.equal(b['aria-busy'],'false');assert.equal(b.className,'existing');const css=fs.readFileSync(new URL('./admin.css',import.meta.url),'utf8');assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{button\.ops-action-busy\{animation:none;outline:2px solid var\(--control-processing\)/);});
const flushPulse=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
async function pulseFixture(t,{history=[],starts=[],fail=false,activeJob=false,preflightResult=null}={}){
 const root=setup(),timers=[],saved=globalThis.setTimeout;globalThis.setTimeout=fn=>{timers.push(fn);return timers.length;};t.after(()=>{globalThis.setTimeout=saved;});
 let resolvePost,job={id:'pulse-job',status:'RUNNING',terminal:false};
 const request=async(p,options)=>{
  if(p.endsWith('/summary'))return {...summary,lifecycleConfigured:true,...(activeJob?{health:{latest:{owned:true,jobId:job.id,status:job.status}}}:{}),flags:{read:true,control:true,scheduling:false},capabilityAvailability:availability};
  if(p.endsWith('/targeting')){const {selectTargeting}=await import('../../../services/api/src/v2-operations/targeting.mjs');return {...targetModel,...selectTargeting(targetModel,{})};}
  if(p.endsWith('/preflights'))return {rows:history};if(p.endsWith('/starts'))return {rows:starts};
  if(options?.method==='POST'&&(p.endsWith('/preflight')||p.endsWith('/start')))return new Promise((resolve,reject)=>{resolvePost=fail?()=>reject(Error('fixture failure')):resolve;});
  if(p.includes('/preflights/'))return preflightResult??{status:'FAILED',error:'fixture done'};
  if(p.includes('/starts/'))return {status:'SUCCEEDED',result:job};
  if(p.includes('/jobs/'))return job;
  return {rows:[],total:0};
 };
 const dispose=await mountOperations(root,request);t.after(dispose);await flushPulse();
 return {root,timers,resolve:value=>resolvePost(value),setJob:value=>{job=value;},pre:{status:'SUCCEEDED',result:{token:'token',liveReady:true,conflicts:[],totalSafetyCeiling:10,storage:{},capabilityCheck:{capabilities:{direct:true,tavily:true,decodo:false,browser:false,groq:false},availability},preflight:{}}}};
}
test('mounted Preflight pulses immediately, then clears on completion',async t=>{const f=await pulseFixture(t),b=button(f.root,'Preflight'),pending=b.listeners.click();assert.equal(b['aria-busy'],'true');f.resolve(f.pre);await pending;assert.equal(b['aria-busy'],'false');assert(button(f.root,'Confirm and queue run'));});
test('mounted Preflight error clears pulse',async t=>{const f=await pulseFixture(t,{fail:true}),b=button(f.root,'Preflight'),pending=b.listeners.click();assert.equal(b['aria-busy'],'true');f.resolve();await pending;assert.equal(b['aria-busy'],'false');});
test('Confirm hands off to Run and terminal job stops pulse',async t=>{const f=await pulseFixture(t),preflight=button(f.root,'Preflight').listeners.click();f.resolve(f.pre);await preflight;window.confirm=()=>true;const confirm=button(f.root,'Confirm and queue run'),pending=confirm.listeners.click();assert.equal(confirm['aria-busy'],'true');f.resolve({id:'start',status:'RUNNING'});await flushPulse();assert.equal(confirm['aria-busy'],'true');await f.timers.shift()();await pending;await flushPulse();assert.equal(confirm['aria-busy'],'false');const run=button(f.root,'Run');assert.equal(run['aria-busy'],'true');assert.equal(button(f.root,'Preflight')['aria-busy'],'false');f.setJob({id:'pulse-job',status:'COMPLETE',terminal:true});await f.timers.shift()();await flushPulse();assert.equal(run['aria-busy'],'false');});
for(const key of ['history','starts'])test('refresh restores backend-active '+key,async t=>{const f=await pulseFixture(t,{[key]:[{id:'active',status:'RUNNING'}]});const b=button(f.root,key==='history'?'Preflight':'Confirm');assert.equal(b['aria-busy'],'true');await f.timers.shift()();await flushPulse();assert.equal(b['aria-busy'],'false');});

test('refresh restores Run from an already-active authoritative job',async t=>{const f=await pulseFixture(t,{activeJob:true});assert.equal(button(f.root,'Run')['aria-busy'],'true');assert.equal(button(f.root,'Preflight')['aria-busy'],'false');assert.equal(button(f.root,'Confirm')['aria-busy'],'false');});
test('failed backend confirmation clears Confirm without starting Run',async t=>{const f=await pulseFixture(t),preflight=button(f.root,'Preflight').listeners.click();f.resolve(f.pre);await preflight;window.confirm=()=>true;const b=button(f.root,'Confirm and queue run'),pending=b.listeners.click();assert.equal(b['aria-busy'],'true');f.resolve({id:'start',status:'FAILED',error:'rejected'});await pending;assert.equal(b['aria-busy'],'false');assert.equal(button(f.root,'Run')['aria-busy'],'false');});

test('eligible continuation is the single existing action beside Preflight',async t=>{const {root,calls}=await builder(t);const preflight=button(root,'Preflight');assert(!button(root,'Confirm and queue run'));await preflight.listeners.click();const next=button(root,'Confirm and queue run');assert.equal(next.parentElement,preflight.parentElement);assert.equal(next.parentElement.className,'ops-primary-actions');assert.equal(descendants(root).filter(n=>n.textContent==='Confirm and queue run').length,1);assert.equal(calls.filter(c=>c.p.endsWith('/start')).length,0);window.confirm=()=>true;await next.listeners.click();assert.deepEqual(calls.filter(c=>c.p.endsWith('/start')).map(c=>c.body),[{token:'safe-token',confirmed:true}]);});
test('completed Preflight automatically restores top continuation without another check',async t=>{
 const caps={direct:true,tavily:true,decodo:false,browser:false,groq:false},prior={id:'saved',status:'SUCCEEDED',input:{objective:'MATURE_LIFECYCLE',services:['music'],targetingRevision:'fixture',targeting:{preset:'ALL',markets:[],categories:[],services:['music'],q:''},capabilities:caps},result:{token:'saved-token',liveReady:true,conflicts:[],capabilityCheck:{capabilities:caps,availability},storage:{},totalSafetyCeiling:10}};
 const {root,calls}=await builder(t,{},[prior]);await flushPulse();const next=button(root,'Confirm and queue run');assert(next);assert.equal(next.parentElement,button(root,'Preflight').parentElement);assert(!calls.some(c=>c.p.endsWith('/preflight')||c.p.endsWith('/start')));
});
test('surfaced confirmation cannot submit twice while the backend operation is pending',async t=>{const f=await pulseFixture(t),preflight=button(f.root,'Preflight').listeners.click();f.resolve(f.pre);await preflight;let confirmations=0;window.confirm=()=>{confirmations++;return true;};const next=button(f.root,'Confirm and queue run'),first=next.listeners.click(),second=next.listeners.click();await second;assert.equal(confirmations,1);assert.equal(next['aria-busy'],'true');f.resolve({status:'SUCCEEDED',result:{id:'pulse-job',status:'RUNNING',terminal:false}});await first;assert.equal(next.hidden,true);assert.equal(button(f.root,'Run').parentElement,button(f.root,'Preflight').parentElement);assert.equal(button(f.root,'Run')['aria-busy'],'true');});
test('processing is light blue, ready mint, and keyboard focus remains separate',()=>{const css=fs.readFileSync(new URL('./admin.css',import.meta.url),'utf8');assert.match(css,/--control-outline: #87cba8/);assert.match(css,/--control-processing: #91ceff/);assert.match(css,/button\.ops-action-busy\{--control-outline:var\(--control-processing\)/);assert.match(css,/button\.ops-action-busy:focus-visible\{outline:3px double var\(--control-focus\);outline-offset:6px/);assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{button\.ops-action-busy\{animation:none;outline:2px solid var\(--control-processing\)/);});
test('recovered active Preflight finishes into the top confirmation without a new POST',async t=>{
 const caps={direct:true,tavily:true,decodo:false,browser:false,groq:false},input={objective:'MATURE_LIFECYCLE',services:['music'],targetingRevision:'fixture',targeting:{preset:'ALL',markets:[],categories:[],services:['music'],q:''},capabilities:caps};
 const f=await pulseFixture(t,{history:[{id:'recovered',status:'RUNNING',input}],preflightResult:{status:'SUCCEEDED',result:{token:'recovered-token',liveReady:true,conflicts:[],capabilityCheck:{capabilities:caps,availability},storage:{},totalSafetyCeiling:10}}});
 assert.equal(button(f.root,'Preflight')['aria-busy'],'true');await f.timers.shift()();await flushPulse();const next=button(f.root,'Confirm and queue run');assert(next);assert.equal(next.parentElement,button(f.root,'Preflight').parentElement);assert.equal(button(f.root,'Preflight')['aria-busy'],'false');
});

test('live status waits for each read and recovers after a transient failure without replacing last valid state',async()=>{
 const scheduled=[],calls=[];let release,displayed;
 const stop=monitorJob('bounded',p=>{calls.push(p);return new Promise((resolve,reject)=>release={resolve,reject});},job=>{if(job)displayed=job;},()=>true,fn=>{scheduled.push(fn);return fn;},()=>{});
 assert.equal(calls.length,1);assert.equal(scheduled.length,0);
 release.resolve({id:'bounded',status:'RUNNING',terminal:false});await Promise.resolve();assert.equal(displayed.status,'RUNNING');
 const failing=scheduled.shift()();assert.equal(scheduled.length,0);release.reject(Error('offline'));await failing;assert.equal(displayed.status,'RUNNING');
 const recovering=scheduled.shift()();assert.equal(scheduled.length,0);release.resolve({id:'bounded',status:'COMPLETE',terminal:true});await recovering;
 assert.equal(displayed.status,'COMPLETE');assert.equal(scheduled.length,0);assert.deepEqual(calls,Array(3).fill('v2-operations/jobs/bounded'));stop();
});
