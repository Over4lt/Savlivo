import test from 'node:test';import assert from 'node:assert/strict';import {mountOperations,capabilityGuidance,previewTargeting} from './v2-operations.js';
class Element{children=[];listeners={};textContent='';value='';append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}addEventListener(k,v){this.listeners[k]=v;}setAttribute(k,v){this[k]=v;}remove(){this.removed=true;}set innerHTML(_){throw Error('Unsafe HTML');}}
const descendants=n=>[n,...n.children.flatMap(descendants)],text=n=>descendants(n).map(x=>x.textContent).join(' '),button=(n,name)=>descendants(n).find(x=>x.textContent===name&&x.listeners.click);
function setup(){globalThis.document={createElement:()=>new Element()};globalThis.window={confirm:()=>false};return new Element();}
const summary={flags:{read:true,control:false,scheduling:false},worker:{at:new Date().toISOString()},metrics:{catalog:2,complete:1,noPrice:1},refresh:null,health:{running:0,resumable:0,nextAutomatic:null,enabledSchedules:0},timezone:'Europe/Oslo'};
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
async function builder(t,overrides={},history=[]){const {selectTargeting}=await import('../../../services/api/src/v2-operations/targeting.mjs');const root=setup(),calls=[];const dispose=await mountOperations(root,async(p,options)=>{const body=options?.body?JSON.parse(options.body):null;calls.push({p,body});if(p.endsWith('/summary'))return {...summary,lifecycleConfigured:true,flags:{read:true,control:true,scheduling:false},capabilityAvailability:availability};if(p.endsWith('/targeting'))return {...targetModel,...selectTargeting(targetModel,body??{})};if(p.endsWith('/preflight'))return {id:'fixture-operation',status:'SUCCEEDED',result:{token:'safe-token',servicesConsidered:body.services.length,totalSafetyCeiling:100,liveReady:true,conflicts:[],storage:{admissionAllowed:true,researchDisk:{admissionAllowed:true}},capabilityCheck:{capabilities:body.capabilities,availability},preflight:{retainedTargets:2},...overrides}};if(p.endsWith('/preflights'))return {rows:history};if(p.endsWith('/start'))return {id:'job',status:'QUEUED'};return {rows:[],total:0};});t.after(dispose);return {root,calls};}
test('builder immediately browses eligible names and separates baseline and retained target counts',async t=>{const {root,calls}=await builder(t);assert(text(root).includes('Film House'));assert(text(root).includes('Music Club'));assert(text(root).includes('Existing catalog: 275 — excluded'));assert(text(root).includes('1 services / 2 targets'));assert(text(root).includes('2 selected services · 3 service-market targets'));assert(!text(root).includes('FULL_CATALOG'));assert(!button(root,'Preflight').disabled);assert.equal(calls.filter(c=>c.p.endsWith('/targeting')).length,1);assert.equal(checkbox(root,'Direct').checked,true);assert.equal(checkbox(root,'Tavily').checked,true);for(const k of ['Decodo','Browser/Web','Groq'])assert.equal(checkbox(root,k).checked,false);assert.equal(checkbox(root,'Browser/Web').disabled,false);assert(text(root).includes('Unavailable on this server'));assert(!text(root).includes('DOCKER_UNAVAILABLE'));});
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
 const {root,calls}=await builder(t),defaults={direct:true,tavily:true,decodo:false,browser:false,groq:false};
 const check=checkbox(root,label);check.checked=!defaults[key];await check.listeners.change();
 await button(root,'Preflight').listeners.click();
 assert.deepEqual(calls.find(c=>c.p.endsWith('/preflight')).body.capabilities,{...defaults,[key]:!defaults[key]});
 const stale=button(root,'Confirm and queue run');
 check.checked=defaults[key];await check.listeners.change();
 assert(!button(root,'Confirm and queue run'));
 globalThis.window.confirm=()=>true;if(stale)await stale.listeners.click();
 assert(!calls.some(c=>c.p.endsWith('/start')));
});
test('permissions, server availability and actual usage are separate; unavailable permission is editable',async t=>{
 const {root,calls}=await builder(t,{liveReady:false});
 assert(!text(root).includes('Allowed:'));assert(!text(root).includes('Available: Yes'));
 assert(text(root).includes('Actually used: no run started'));
 const check=checkbox(root,'Browser/Web');assert.equal(check.disabled,false);check.checked=true;await check.listeners.change();assert(descendants(root).some(n=>n.className==='ops-tool-switch-availability ops-tool-switch-warning'&&n.textContent==='Unavailable on this server'));
 await button(root,'Preflight').listeners.click();assert(text(root).includes('Unavailable on this server'));assert(!button(root,'Confirm and queue run'));
 assert.equal(calls.find(c=>c.p.endsWith('/preflight')).body.capabilities.browser,true);
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
  assert.equal(input.disabled,false);
  const track=label.children[label.children.indexOf(input)+1];
  assert.equal(track.className,'ops-tool-switch-track');assert.equal(track['aria-hidden'],'true');
  assert(label.children.some(n=>n.className==='ops-tool-switch-availability'));
  assert.equal(label.listeners.click,undefined,'native label toggles once; no duplicate scripted click handler');
 }
});

 test('capability guidance is silent when healthy and precise only with supported diagnostics',()=>{
 for(const key of ['direct','tavily','decodo','browser','groq'])for(const allowed of [false,true])assert.equal(capabilityGuidance(key,{available:true},allowed),'');
 assert.equal(capabilityGuidance('decodo',{available:false,reason:'DECODO_CONFIGURATION_VALIDATED_AT_USE'},false),'');
 assert.match(capabilityGuidance('decodo',{available:false,reason:'DECODO_CONFIGURATION_VALIDATED_AT_USE'},true),/Preflight/);
 for(const [reason,copy]of Object.entries({GROQ_KEY_REQUIRED:'API key not configured',GROQ_MODEL_REQUIRED:'Model not configured',GROQ_MODEL_INVALID:'Model configuration is invalid',DOCKER_UNAVAILABLE:'Unavailable on this server'}))assert.equal(capabilityGuidance('groq',{available:false,reason}),copy);
 assert.equal(capabilityGuidance('groq',{reason:'GROQ_KEY_AND_MODEL_REQUIRED'}),'API key or model not configured');
 assert.equal(capabilityGuidance('groq',{reason:'GROQ_KEY_AND_MODEL_REQUIRED',keyConfigured:false,modelConfigured:false}),'API key and model not configured');
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
