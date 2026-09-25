import {liveStatusView,statusTone} from './live-status.js';

// Visual state only: operation records and job terminality remain authoritative.
export function activeWorkflowAction({pending=null,preflight=null,start=null,job=null}={}){
 if(pending)return pending;
 if(start?.status==='RUNNING')return 'confirm';
 if(preflight?.status==='RUNNING')return 'preflight';
 if(job?.terminal===false&&['QUEUED','RUNNING'].includes(job.status))return 'run';
 return null;
}
export function setWorkflowBusy(button,busy){
 button.className=(button.className??'').split(/\s+/).filter(c=>c&&c!=='ops-action-busy').concat(busy?['ops-action-busy']:[]).join(' ');
 button.setAttribute('aria-busy',String(busy));
}

export const readable=value=>typeof value==='string'&&value?value.toLowerCase().replaceAll('_',' ').replace(/^./,c=>c.toUpperCase()):'Unavailable';
export function reasonSummary(row){let reasons=row.unresolvedReasons??row.stop??row.reason;if(typeof reasons==='string'){try{reasons=JSON.parse(reasons);}catch{return readable(reasons.split('; ')[0]).slice(0,160);}}if(Array.isArray(reasons))reasons=reasons[0];if(reasons&&typeof reasons==='object')return readable(reasons.reason??reasons.kind);return row.humanReview?.length?'Human review required':'No recorded research gap';}
export function coverageSummary(row){const values=['authority','identity','markets','login','management','cancellation'].map(k=>row[k]).filter(v=>typeof v==='string');if(!values.length)return 'Coverage not recorded';const established=values.filter(v=>['ESTABLISHED','VERIFIED','AVAILABLE','LOGIN_MANAGE_ESTABLISHED'].includes(v)).length;return `${established} established · ${values.length-established} other / unresolved dimensions`;}
// Backend availability is authoritative. This is presentation, never execution policy.
export function capabilityGuidance(key,status){
 if(status?.available===true){
  if(key==='decodo')return 'Conditional · Controlled provider acquisition; runtime configuration validated when needed';
  if(key==='browser')return 'Conditional · Bounded JavaScript rendering; sandbox validated when needed';
  return 'Ready';
 }
 const reasons={TAVILY_API_KEY_REQUIRED:'API key not configured',DECODO_CREDENTIALS_REQUIRED:'Credentials not configured',DECODO_CONFIGURATION_VALIDATED_AT_USE:'Credentials unavailable; configuration must be checked',GROQ_KEY_REQUIRED:'API key not configured',GROQ_MODEL_REQUIRED:'Model not configured',GROQ_MODEL_INVALID:'Model configuration is invalid',GROQ_KEY_AND_MODEL_REQUIRED:'API key and model not configured',DOCKER_UNAVAILABLE:'Docker runtime unavailable on this server',DOCKER_OR_PINNED_IMAGE_UNAVAILABLE:'Docker daemon or pinned browser image unavailable',NOT_PROBED_NO_BROWSER_INITIALIZATION:'Runtime not checked (permission OFF)'};
 if(status?.reason==='NOT_PROBED_NO_BROWSER_INITIALIZATION')return 'Not checked · '+reasons[status.reason];
 return 'Unavailable · '+(reasons[status?.reason]??'Readiness not confirmed');
}
export function capabilityControl(key,status,allowed=false){
 const available=status?.available===true;
 return {checked:allowed,disabled:!available&&!allowed,text:`Permission ${allowed?'ON':'OFF'} · ${capabilityGuidance(key,status)}${allowed&&!available?' · Cannot run; switch OFF or correct server configuration':''}`};
}
export const availablePermissions=availability=>Object.fromEntries(['direct','tavily','decodo','browser','groq'].map(k=>[k,availability?.[k]?.available===true]));
// All content uses text nodes. Provider URLs are links, never executable markup.
// Local preview only; server Preflight independently revalidates revision and selection.
export function previewTargeting(model,filters){
 const {preset='ALL',markets=[],categories=[],services=null,q=''}=filters;
 const matching=model.matching.filter(s=>s.eligible&&s.selectable&&
  (preset==='ALL'||preset==='UNRESOLVED'&&s.researchComplete!==true||preset==='HUMAN_REVIEW'&&s.humanReview||preset==='REVIEWED'&&s.reviewed||preset==='RETAINED'&&s.retainedTargets>0)&&
  (!markets.length||s.markets.some(m=>markets.includes(m)))&&(!categories.length||s.categories.some(c=>categories.includes(c)))&&
  (!q||[s.name,s.service,...s.aliases??[],...s.providerNames??[]].join(' ').toLowerCase().includes(q.toLowerCase())));
 const rows=matching.filter(s=>services===null||services.includes(s.service)).map(s=>({...s,researchMarkets:markets.length?s.markets.filter(m=>markets.includes(m)):s.markets}));
 return {...model,matching,rows,services:rows.map(s=>s.service),matchingServices:matching.length,selectedServices:rows.length,
  serviceMarketTargets:rows.reduce((n,s)=>n+s.researchMarkets.length,0),unscopedServices:rows.filter(s=>!s.markets.length).length,
  targeting:{preset,markets:[...markets].sort(),categories:[...categories].sort(),services:services===null?null:[...services].sort(),q},researchMarkets:Object.fromEntries(rows.map(s=>[s.service,s.researchMarkets]))};
}
// Short authenticated requests; validation is durable and independent of this polling loop.
export async function awaitPreflight(operation,request,isCurrent=()=>true,pause=ms=>new Promise(r=>setTimeout(r,ms)),onState=()=>{}){
 for(let attempts=0;attempts<180;attempts++){
  if(!isCurrent())throw Error('Preflight view changed. Recover the check after signing in.');
  onState(operation);
  if(operation.status==='SUCCEEDED')return operation.result;
  if(operation.status!=='RUNNING')throw Error(operation.error??'Preflight expired. Run Preflight again.');
  await pause(5000);if(!isCurrent())throw Error('Preflight view changed. Recover the check after signing in.');
  operation=await request('v2-operations/preflights/'+encodeURIComponent(operation.id));
 }
 throw Error('Check still pending. Recover its status; no research has started.');
}
export async function awaitStart(operation,request,isCurrent=()=>true,pause=ms=>new Promise(r=>setTimeout(r,ms)),onState=()=>{}){
 for(let n=0;n<180;n++){
  if(!isCurrent())throw Error('Start confirmation was submitted. Recover Start after signing in to see whether a job was created.');
  onState(operation);
  if(operation.status==='SUCCEEDED')return operation.result;
  if(operation.error==='JOB_RECOVERY_CONFLICT')throw Error('Stored job conflict requires review. No additional job was enqueued.');
  if(operation.status!=='RUNNING')throw Error('Start failed: '+(operation.error??operation.status)+'. No job was committed for this confirmation.');
  await pause(5000);if(!isCurrent())throw Error('Recover Start after signing in.');
  try{operation=await request('v2-operations/starts/'+encodeURIComponent(operation.id));}catch{throw Error('Start outcome unavailable. Use Recover Start; a job may already exist.');}
 }
 throw Error('Start is still pending. Use Recover Start; do not assume no job was created.');
}
// One bounded, read-only monitor. No targeting reloads or Start retries.
export function monitorJob(id,request,onUpdate,isCurrent=()=>true,schedule=setTimeout,cancel=clearTimeout,onStop=()=>{}){
 let stopped=false,timer,attempts=0,failures=0;
 const stop=()=>{if(stopped)return;stopped=true;cancel(timer);onStop();};
 const tick=async()=>{
  if(stopped||!isCurrent())return stop();
  try{const job=await request('v2-operations/jobs/'+encodeURIComponent(id));if(stopped||!isCurrent())return stop();
   if(job.id!==id||typeof job.terminal!=='boolean')throw Error('INVALID_JOB_STATUS');
   failures=0;onUpdate(job,null);if(job.terminal)return stop();
  }catch{if(stopped||!isCurrent())return stop();failures++;onUpdate(null,'Live status temporarily unavailable; last known status is unchanged. Use Recover Start to reconnect.');}
  if(++attempts>=360||failures>=5){onUpdate(null,'Live monitoring paused. Use Recover Start to resume monitoring; no job action was taken.');return stop();}
  timer=schedule(tick,10000);
 };
 void tick();return stop;
}
export async function mountOperations(parent,request,isCurrent=()=>true){
 const root=document.createElement('section');root.id='v2-operations';parent.append(root);let tab='Overview',selectedRun=null,offset=0,query='',filter='',viewGeneration=0;
 const workflowState={},workflowButtons=new Map();let workflowRevision=0,recoverWorkflow=null;
 const syncWorkflow=()=>{const active=activeWorkflowAction(workflowState);for(const [key,node]of workflowButtons){setWorkflowBusy(node,key===active);if(node.workflowStatusOnly)node.hidden=key!==active;}};
 const registerWorkflow=(key,node)=>{workflowButtons.set(key,node);syncWorkflow();return node;};
 const updateWorkflow=(key,value)=>{workflowState[key]=value;syncWorkflow();};
 const watchOperation=async(key,operation,current=isCurrent)=>{const revision=workflowRevision;try{return await (key==='preflight'?awaitPreflight:awaitStart)(operation,request,current,undefined,row=>{if(revision===workflowRevision){updateWorkflow('pending',null);updateWorkflow(key,row);}});}finally{if(revision===workflowRevision)updateWorkflow(key,null);}};
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text??'Unavailable');if(cls)n.className=cls;return n;};
 const text=(p,s)=>p.append(el('p',s));const button=(p,label,fn,disabled=false)=>{const b=el('button',label);b.type='button';b.disabled=disabled;b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(e){text(root,e.message);}finally{b.disabled=disabled;}});p.append(b);return b;};
 const table=(p,cols,rows,click)=>{if(!rows.length){text(p,'No records available.');return;}const wrap=el('div',undefined,'table-wrap'),t=el('table'),head=el('thead'),tr=el('tr');for(const c of cols)tr.append(el('th',c[1]));head.append(tr);t.append(head);const body=el('tbody');for(const row of rows){const line=el('tr');if(row.status)line.className='ops-status-'+statusTone(row.status);if(row.origin==='UNKNOWN/HISTORICAL')line.className='ops-historical';for(const [key]of cols){const cell=el('td',row[key]);line.append(cell);}if(click){const td=el('td');button(td,'View details',()=>click(row));line.append(td);}body.append(line);}t.append(body);wrap.append(t);p.append(wrap);};
 const field=(p,label,options,value)=>{const l=el('label',label),n=el(options?'select':'input');if(options)for(const item of options){const o=el('option',Array.isArray(item)?item[1]:item);o.value=Array.isArray(item)?item[0]:item;n.append(o);}n.value=value??'';l.append(n);p.append(l);return n;};
 const live=el('section',undefined,'ops-live-card');live.hidden=true;live.setAttribute('aria-label','Current Operations job');
 const liveTitle=el('h3','Live job'),announcement=el('p');announcement.setAttribute('role','status');announcement.setAttribute('aria-live','polite');
 const pipeline=el('ol',undefined,'ops-lifecycle'),steps=Array.from({length:3},()=>el('li'));pipeline.append(...steps);
 const liveFields=Object.fromEntries(['receipt','status','activity','services','markets','started','updated','finished','elapsed','budget','usage','pricing','review','research','completion','notice'].map(key=>[key,el('p')]));
 live.append(liveTitle,announcement,pipeline,...Object.values(liveFields));
 const updateText=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
 let stopMonitor=()=>{},trackedId=null,tracking=false,lastJob=null,detailObserver=null,disposed=false,runSnapshot=null,serviceSnapshot=null,snapshotSequence=0;
 const showLive=job=>{
  updateWorkflow('job',job);
  const view=liveStatusView(job,runSnapshot,serviceSnapshot);updateText(liveTitle,view.title);const cls='ops-live-card ops-status-'+view.tone;if(live.className!==cls)live.className=cls;
  const announcementKey=job.status+'|'+(job.phase??'');if(announcementKey!==lastAnnounced){lastAnnounced=announcementKey;updateText(announcement,view.activity);}
  for(const key of Object.keys(liveFields))if(view[key]!==undefined)updateText(liveFields[key],view[key]);
  for(const key of ['review','pricing','research']){const cls='ops-state ops-status-'+view[key+'Tone'];if(liveFields[key].className!==cls)liveFields[key].className=cls;}
  for(const [i,[label,state]]of view.pipeline.entries()){updateText(steps[i],(state==='done'?'✓ ':state==='current'?'● ':'○ ')+label);const cls='ops-stage-'+state;if(steps[i].className!==cls){steps[i].className=cls;steps[i].setAttribute('aria-label',label+': '+(state==='unknown'?'Not confirmed':state));}}
  if(results.disabled!==!runSnapshot?.id)results.disabled=!runSnapshot?.id;updateText(results,job.terminal?'View results':'View details');
 };
 let lastAnnounced=null;
 const runIndicator=registerWorkflow('run',button(live,'Run',async()=>{},true));runIndicator.setAttribute('aria-label','Run status');
 const results=button(live,'View results',async()=>{if(!runSnapshot?.id)return;selectedRun=runSnapshot.id;tab='Runs';await render();});results.disabled=true;
 const refreshSnapshot=async job=>{
  const seq=++snapshotSequence;try{
   let id=runSnapshot?.id;if(!id){const page=await request('v2-operations/runs?limit=50&offset=0');id=page.rows?.find(r=>r.jobId===job.id)?.id;}
   if(!id||disposed||!isCurrent()||trackedId!==job.id||seq!==snapshotSequence)return;const data=await request('v2-operations/runs/'+encodeURIComponent(id));
   if(disposed||!isCurrent()||trackedId!==job.id||seq!==snapshotSequence||data.run?.jobId!==job.id)return;
   runSnapshot=data.run;serviceSnapshot=data.services??null;showLive(lastJob??job);if(job.terminal&&data.run.status!==job.status)updateText(liveFields.notice,'Final result snapshot is still pending. View results or Refresh operations to reload it.');
  }catch{if(!disposed&&trackedId===job.id&&seq===snapshotSequence)updateText(liveFields.notice,'Result counters unavailable; last reported snapshot retained.');}
 };
 const trackJob=(job,receipt=true,knownRun=null,knownServices=null)=>{
  if(disposed||!isCurrent())return;
  if(trackedId===job.id&&tracking){if(lastJob)detailObserver?.update(lastJob);return;}
  stopMonitor();snapshotSequence++;trackedId=job.id;tracking=true;lastJob=null;runSnapshot=knownRun;serviceSnapshot=knownServices;lastAnnounced=null;live.hidden=false;
  for(const node of Object.values(liveFields))updateText(node,'');
  updateText(liveFields.receipt,(receipt?'Admission receipt for job ':'Monitoring job ')+job.id+'. Checking live status…');showLive(job);
  stopMonitor=monitorJob(job.id,request,(current,error)=>{
   if(error){updateText(liveFields.notice,error);return;}
   lastJob=current;updateText(liveFields.receipt,'Authoritative Operations status; counters are retained run snapshots.');updateText(liveFields.notice,'');showLive(current);void refreshSnapshot(current);
   if(detailObserver?.id===current.id)detailObserver.update(current);
  },()=>!disposed&&isCurrent(),setTimeout,clearTimeout,()=>{tracking=false;updateWorkflow('job',null);});
 };
 const post=(path,body)=>request('v2-operations/'+path,{method:'POST',body:JSON.stringify(body??{})});
 const confirmedStart=async(token)=>{workflowRevision++;updateWorkflow('pending','confirm');try{let operation;try{operation=await post('start',{token,confirmed:true});}catch{throw Error('Start outcome unavailable. Use Recover Start; a job may already exist.');}const job=await watchOperation('start',operation);if(isCurrent())trackJob(job);return job;}finally{updateWorkflow('pending',null);updateWorkflow('start',null);}};

 async function researchLeads(box,data){
  const section=el('section',undefined,'ops-inspect-section');section.append(el('h3','Human Review · Research leads'));text(section,'Unverified candidate sources — V2 must acquire and verify them before facts are accepted. Do not enter credentials or secrets.');box.append(section);
  const list=el('div'),notice=el('p');section.append(list,notice);let model;
  const refresh=async()=>{model=await request('v2-operations/services/'+encodeURIComponent(data.service)+'/leads');list.replaceChildren();for(const lead of model.rows??[]){const card=el('article',undefined,'ops-lead');card.append(el('strong',readable(lead.type)));const a=el('a',lead.url);a.href=lead.url;a.target='_blank';a.rel='noopener noreferrer';card.append(a);text(card,'Submitted host: '+new URL(lead.url).hostname+' · This submission grants no provider authority.');text(card,`${readable(lead.status)} · ${lead.marketScope?.join(', ')||'All investigation markets'} · ${lead.createdBy} · ${lead.createdAt}`);if(lead.note)text(card,lead.note);const latest=model.outcomes?.filter(o=>o.leadId===lead.leadId).at(-1);text(card,latest?`${readable(latest.event)} · ${readable(latest.outcome??latest.verifierOutcome)}${Number.isInteger(latest.verifiedCount)?' · verified outputs: '+latest.verifiedCount:''} · ${latest.at}`:'No recorded acquisition/verification outcome.');if(lead.canDeactivate)button(card,'Deactivate lead',async()=>{await post('services/'+data.service+'/leads/'+lead.leadId,{action:'deactivate'});await refresh();notice.textContent='Deactivated for future Preflights. Existing frozen runs remain unchanged.';});list.append(card);}if(!model.rows?.length)text(list,'No research leads supplied. Add a source that may help resolve the gaps above.');};
  try{await refresh();}catch{text(section,'Research leads unavailable. Refresh this details view to retry.');return;}
  if(!model.types?.length||model.canCreate!==true)return;
  const form=el('details');form.append(el('summary','Add research lead'));section.append(form);
  const type=field(form,'Lead type',model.types.map(v=>[v,readable(v)]),'GENERAL'),url=field(form,'Source URL',null,'');url.type='url';url.maxLength=2048;url.placeholder='https://provider.example/pricing';
  const marketLabel=el('label','Investigation markets (optional)'),market=el('select');market.multiple=true;for(const id of model.markets??[]){const o=el('option',id);o.value=id;market.append(o);}marketLabel.append(market);form.append(marketLabel);button(form,'All investigation markets',()=>{for(const o of market.children)o.selected=false;});text(form,'Leave markets unselected for all investigation markets. This does not assert service availability.');
  const noteLabel=el('label','Operator note (optional)'),note=el('textarea');note.maxLength=1000;noteLabel.append(note);form.append(noteLabel);
  button(form,'Save research lead',async()=>{try{await post('services/'+data.service+'/leads',{type:type.value,url:url.value,marketScope:Array.from(market.selectedOptions??[]).map(o=>o.value),note:note.value??''});await refresh();notice.textContent='Saved as unverified. Run a new Preflight to include this lead; existing reviewed runs are unchanged.';url.value='';note.value='';}catch(e){notice.textContent='Lead not saved: '+e.message;}});
 }
 async function evidence(row){
  const generation=viewGeneration;const data=await request('v2-operations/services/'+encodeURIComponent(row.service)+(selectedRun?'?run='+selectedRun:''));if(!isCurrent()||generation!==viewGeneration)return;const box=el('details',undefined,'ops-inspect');box.open=true;box.append(el('summary',data.name+' — '+readable(data.state)));root.append(box);
  const section=(name)=>{const s=el('section',undefined,'ops-inspect-section');s.append(el('h3',name));box.append(s);return s;};
  let s=section('Summary');text(s,`Research: ${data.researchComplete===true?'Complete':readable(data.state)} · Requests: ${data.requests??'Unavailable'} · Evidence: ${data.evidenceCount??'Unavailable'}`);if(data.eligibilityReason)text(s,data.eligibilityReason);
  s=section('Provider / authority');text(s,readable(data.authority));for(const a of data.authorityProvenance??[]){text(s,`${a.hostname} · ${readable(a.status)} · ${a.reason??''}`);for(const e of a.evidence??[])text(s,`${e.url} · ${e.excerpt??''}`);}
  s=section('Identity and investigation markets');text(s,'Identity: '+readable(data.identity));text(s,(data.marketScope??[]).join(', ')||'Market scope unavailable');text(s,'Investigation scope is not a claim of market availability.');
  s=section('Account access');for(const [key,name]of [['login','Login'],['management','Management'],['cancellation','Cancellation']])text(s,name+': '+readable(data[key]));
  s=section('Pricing');text(s,`Confidence: ${readable(data.priceConfidence)} · Strategy: ${readable(data.priceStrategy)}. User-entered price remains authoritative.`);for(const p of data.pricing??[])text(s,`${p.market} · ${readable(p.status)} · ${readable(p.confidence)} · ${p.quarantined??0} quarantined`);for(const p of data.priceEvidence??[])text(s,`${p.market}: ${p.amount} ${p.currency} / ${p.interval} · ${p.url} · confirmed ${p.lastConfirmed??'Unavailable'}`);
  s=section('Acquired / retained evidence');for(const e of data.evidence??[]){const card=el('article',undefined,'ops-lead');text(card,readable(e.domain));if(/^https?:\/\//.test(e.url??'')){const a=el('a',e.url);a.href=e.url;a.target='_blank';a.rel='noopener noreferrer';card.append(a);}text(card,e.text??'Retained reference; quote unavailable.');text(card,`Authority: ${e.authority??'Unavailable'} · ${e.freshness??'Freshness unavailable'}`);s.append(card);}if(!data.evidence?.length)text(s,'No retained evidence recorded. Human leads below are not evidence.');
  s=section('Research gaps');text(s,reasonSummary(data));for(const h of data.humanReview??[])text(s,typeof h==='string'?readable(h):readable(h.reason??h.kind));
  await researchLeads(box,{...data,service:row.service});
  const technical=el('details');technical.append(el('summary','Technical details · complete service record'));const pre=el('pre',JSON.stringify(data,null,2));technical.append(pre);box.append(technical);
 }
 async function explorer(p,unresolved=false){
  const form=el('div',undefined,'analytics-controls'),q=field(form,'Search services',null,query),state=field(form,'State / reason',['','CHANGED','UNRESOLVED','LOGIN_MANAGE_ESTABLISHED','NO_AUTHORITATIVE_TARGET','ACQUISITION_FAILURE','BUDGET_EXHAUSTED','ACCOUNT_WALL','RENDERING_REQUIRED','INSUFFICIENT_EVIDENCE'].map(v=>[v,v?readable(v):'All states']),filter);p.append(form);
  const results=el('div',undefined,'ops-service-results');p.append(results);
  const load=async()=>{const data=await request('v2-operations/'+(unresolved?'unresolved':'services')+'?offset='+offset+'&limit=30&q='+encodeURIComponent(query)+'&state='+encodeURIComponent(filter)+(selectedRun?'&run='+selectedRun:''));if(!isCurrent())return;results.replaceChildren();text(results,`${data.total} services. Unresolved is a valid research outcome.`);if(unresolved)text(results,'View a service’s details to review its gaps and supply an unverified source for a future run.');
   for(const row of data.rows){const card=el('article',undefined,'ops-result-card');const heading=el('div');heading.append(el('strong',row.name??row.service),el('p',readable(row.state)));card.append(heading);const coverage=el('div');text(coverage,coverageSummary(row));text(coverage,`Requests: ${row.requests??'Unavailable'} · Evidence: ${row.evidenceCount??'Unavailable'}`);card.append(coverage);const attention=el('div');text(attention,reasonSummary(row));if(row.eligible===false)text(attention,'Outside current research cohort');card.append(attention);button(card,'View details',()=>evidence(row));results.append(card);}
   if(!data.rows.length)text(results,'No services match these filters. Clear the search or choose another state.');const paging=el('div',undefined,'ops-pagination');button(paging,'Previous',async()=>{offset=Math.max(0,offset-30);await load();},offset===0);text(paging,`Showing ${data.total?offset+1:0}–${Math.min(offset+30,data.total)} of ${data.total}`);button(paging,'Next',async()=>{offset+=30;await load();},offset+30>=data.total);results.append(paging);
  };
  button(form,'Apply',async()=>{query=q.value;filter=state.value;offset=0;await load();});await load();
 }
 async function researchBuilder(p,summary){
  const builderGeneration=viewGeneration;
  const form=el('div',undefined,'ops-research-builder');p.append(form);form.append(el('h3','New research run'));
  text(form,'Choose candidates to investigate. Preflight checks the plan; it does not start research.');
  const overview=el('div'),presetsBox=el('div',undefined,'ops-presets'),facetsBox=el('div',undefined,'ops-facets'),browser=el('div'),counts=el('p'),activity=el('p'),result=el('div');
  form.append(overview,presetsBox,facetsBox);const filters={preset:'ALL',markets:[],categories:[],services:null,q:''};
  let preview=null,model=null,epoch=0,capabilities={direct:summary.capabilityAvailability?.direct?.available===true,tavily:summary.capabilityAvailability?.tavily?.available===true,decodo:false,browser:false,groq:false};
  const presetButtons=new Map(),facetChecks={markets:[],categories:[]};
  const search=field(form,'Search service or provider name',null,'');search.placeholder='Browse below, or type a name';
  const tools=el('div',undefined,'ops-presets'),filterDescription=el('p');form.append(tools,counts,activity,browser,filterDescription);
  const caps=el('fieldset');caps.append(el('legend','Research tools'));form.append(caps);
  text(caps,'Enabled capabilities are permitted, not forced. V2 chooses when to use them according to evidence, budgets and policy.');
  const capChecks={},capStatuses={},labels={direct:'Direct',tavily:'Tavily',decodo:'Decodo',browser:'Browser/Web',groq:'Groq'};

  let nextAction=null;
  const invalidate=()=>{epoch++;if(nextAction){nextAction.remove();nextAction=null;}result.replaceChildren();confirmIndicator.hidden=false;registerWorkflow('confirm',confirmIndicator);if(workflowStatus.textContent)updateText(workflowStatus,'Selection changed — run Preflight again. Existing job status is unchanged.');};
  for(const [key,label]of Object.entries(labels)){
   const wrapper=el('label',label,'ops-tool-switch'),input=el('input');input.type='checkbox';input.className='ops-tool-switch-input';input.setAttribute('role','switch');input.setAttribute('aria-label',label+' — allowed for this run');input.checked=capabilities[key];input.disabled=false;const track=el('span',undefined,'ops-tool-switch-track');track.setAttribute('aria-hidden','true');const status=el('span',undefined,'ops-tool-switch-availability');status.id='ops-tool-status-'+key;input.setAttribute('aria-describedby',status.id);
   const refreshStatus=()=>{const value=summary.capabilityAvailability?.[key];const control=capabilityControl(key,value,input.checked);input.disabled=control.disabled;status.textContent=control.text;status.hidden=false;status.className='ops-tool-switch-availability'+(value?.available!==true?' ops-tool-switch-warning':'');status.title=value?.reason??'';};capStatuses[key]=refreshStatus;
   input.addEventListener('change',()=>{if(summary.capabilityAvailability?.[key]?.available!==true)input.checked=false;capabilities[key]=input.checked;refreshStatus();invalidate();});capChecks[key]=input;wrapper.append(input,track,status);caps.append(wrapper);refreshStatus();
  }
  button(caps,'Enable all available capabilities',()=>{for(const k of Object.keys(capabilities)){capabilities[k]=availablePermissions(summary.capabilityAvailability)[k];capChecks[k].checked=capabilities[k];capStatuses[k]();}invalidate();});
  text(caps,'Actual usage is reported in run details separately from permission. OFF prohibits use; ON never forces use. Readiness is a server prerequisite check; Preflight rechecks enabled tools before Start.');
  text(caps,'Decodo: access/geo fallback remains policy-gated. Browser: bounded JavaScript resource discovery, not interactive browsing. Groq: source-grounded interpretation when deterministic extraction is insufficient.');
  const preflight=registerWorkflow('preflight',el('button','Preflight'));preflight.type='button';preflight.disabled=true;const workflow=el('section',undefined,'ops-workflow');workflow.setAttribute('aria-label','Preflight and execution');const workflowStatus=el('p');workflowStatus.setAttribute('role','status');workflowStatus.setAttribute('aria-live','polite');workflow.append(workflowStatus,result,live);const primaryControls=el('div',undefined,'ops-primary-actions');primaryControls.setAttribute('aria-label','Workflow actions');primaryControls.append(preflight);form.append(primaryControls,workflow);
  const confirmIndicator=registerWorkflow('confirm',button(primaryControls,'Confirm',async()=>{},true));confirmIndicator.workflowStatusOnly=true;confirmIndicator.setAttribute('aria-label','Confirmation status');runIndicator.workflowStatusOnly=true;primaryControls.append(runIndicator);syncWorkflow();
  const enablePreflight=()=>{preflight.disabled=!preview?.selectedServices||!summary.flags.control;};
  let renderedIds=null;const serviceChecks=new Map();
  const renderRows=()=>{
   const ids=preview.matching.map(r=>r.service).join('|'),rebuild=ids!==renderedIds;if(rebuild){browser.replaceChildren();serviceChecks.clear();renderedIds=ids;}const names=new Map(preview.facets.markets.map(f=>[f.id,f.name])),cats=new Map(preview.facets.categories.map(f=>[f.id,f.name]));
   counts.textContent=`${preview.matchingServices} matching eligible services · ${preview.selectedServices} selected services · ${preview.serviceMarketTargets} service-market targets`;
   activity.textContent=preview.selectedServices?`${filters.services===null?'All matching services (follows filters)':'Manual selection'} · ${preview.unscopedServices} selected services have no recorded market scope.`:'No eligible services selected. Clear filters or select matching services.';
   const list=el('div',undefined,'ops-service-list');list.setAttribute('aria-label','Matching eligible services');
   selectAll.textContent=`Select all matching (${preview.matchingServices})`;
   const selected=new Set(preview.services);
   if(rebuild)for(const row of preview.matching){const label=el('label',undefined,'ops-service-row'),check=el('input');check.type='checkbox';check.checked=selected.has(row.service);check.disabled=!row.selectable;serviceChecks.set(row.service,check);
    check.addEventListener('change',async()=>{if(!row.selectable)return;const ids=new Set(preview.services);if(check.checked&&row.selectable)ids.add(row.service);else ids.delete(row.service);filters.services=[...ids];await update();});
    label.append(check,el('strong',row.name),el('span',row.selectable?`${row.reviewed?'Reviewed provider':'Needs human review'}${row.retainedTargets?' · retained work':''}`:(row.eligibilityReason??'Outside the frozen lifecycle; reference only')),el('span',row.markets.map(m=>names.get(m)??m).join(', ')||'Market scope not recorded'),el('span',row.categories.map(c=>cats.get(c)??c).join(', ')||'Category not recorded'));list.append(label);}
   if(rebuild)browser.append(list);else for(const [id,check]of serviceChecks)check.checked=selected.has(id);
   filterDescription.textContent=`Filters: ${preview.presets.find(p=>p.id===filters.preset)?.name??'All eligible'} · ${filters.markets.map(m=>names.get(m)??m).join(', ')||'All markets'} · ${filters.categories.map(c=>cats.get(c)??c).join(', ')||'All categories'}${filters.q?' · Search: '+filters.q:''}`;
   for(const [id,b]of presetButtons)b.setAttribute('aria-pressed',String(filters.preset===id));
   for(const key of ['markets','categories'])for(const [id,c]of facetChecks[key])c.checked=filters[key].includes(id);
   enablePreflight();
  };
  function update(){invalidate();if(!model)return;preview=previewTargeting(model,filters);renderRows();}
  const changeFilters=async()=>{filters.services=null;await update();};
  search.addEventListener('input',async()=>{filters.q=search.value;await changeFilters();});
  const selectAll=button(tools,'Select all matching',async()=>{filters.services=null;await update();});
  button(tools,'Refresh targeting',()=>render());
  text(form,'Filters use the loaded authenticated snapshot. Refresh targeting reloads data and restores new-run defaults; Preflight checks for changes before Start.');
  button(tools,'Clear selection',async()=>{filters.services=[];await update();});
  button(tools,'Clear filters',async()=>{Object.assign(filters,{preset:'ALL',markets:[],categories:[],services:null,q:''});search.value='';await update();});
  const submitPreflight=async(recovery=null)=>{
   if(preflight.disabled||!preview?.selectedServices)return;const generation=epoch,selection=preview,requestedCapabilities={...capabilities};if(nextAction){nextAction.remove();nextAction=null;}confirmIndicator.hidden=true;registerWorkflow('confirm',confirmIndicator);preflight.disabled=true;workflowRevision++;updateWorkflow('pending','preflight');updateText(workflowStatus,'Preflight in progress — checking authenticated inputs and run limits. This check does not start research.');result.replaceChildren();
   try{const operation=recovery??await post('preflight',{objective:'MATURE_LIFECYCLE',scope:'SELECTED_SERVICES',services:selection.services,targeting:selection.targeting,targetingRevision:selection.revision,capabilities:requestedCapabilities});
    const pre=await watchOperation('preflight',operation,()=>isCurrent()&&builderGeneration===viewGeneration);
    if(!isCurrent()||generation!==epoch)return;
    if(Object.keys(labels).some(k=>pre.capabilityCheck?.capabilities?.[k]!==requestedCapabilities[k]))throw new Error('Preflight tool permissions differ from the requested selection. Run Preflight again; Start is blocked.');
    updateText(workflowStatus,pre.liveReady===true&&pre.conflicts?.length===0?'Preflight complete — ready to confirm Start.':'Preflight complete — Start is blocked.');result.replaceChildren();const resultHeading=el('h3','Preflight — research has not started');result.append(resultHeading);if(pre.preflight?.validation==='DEFERRED_TO_EXECUTION')text(result,'Scope, permissions and limits checked. Full integrity validation will run before research execution.');
    text(result,`${selection.selectedServices} services · ${selection.serviceMarketTargets} service-market targets · ${selection.presets.find(p=>p.id===selection.targeting.preset)?.name??'Custom selection'}`);
    text(result,'Markets: '+(selection.targeting.markets.map(id=>selection.facets.markets.find(f=>f.id===id)?.name??id).join(', ')||'All markets'));
    text(result,'Categories: '+(selection.targeting.categories.map(id=>selection.facets.categories.find(f=>f.id===id)?.name??id).join(', ')||'All categories'));
    table(result,[['name','Selected service'],['scope','Investigation markets']],selection.rows.map(r=>({name:r.name,scope:r.researchMarkets.join(', ')||'Not recorded'})));
    text(result,'Human research leads: '+(pre.humanLeads?.length??0));text(result,'Human-provided leads are unverified candidate sources. V2 must acquire and verify them before facts are accepted.');for(const l of pre.humanLeads??[])text(result,`${selection.matching?.find(s=>s.service===l.serviceId)?.name??l.serviceId} · ${readable(l.type)} · ${l.url} · ${l.marketScope.join(', ')||'All investigation markets'} · Unverified`);
    table(result,[['metric','Readiness'],['value','Result']],[{metric:'Maximum new external requests',value:pre.totalSafetyCeiling},{metric:'Expected services requiring network',value:pre.servicesExpectedNetwork??'Determined by adaptive planner'},{metric:'Retained targets available (whole lifecycle)',value:pre.preflight?.retainedTargets??(pre.preflight?.validation==='DEFERRED_TO_EXECUTION'?'Determined during execution validation':undefined)},{metric:'Storage admission',value:pre.storage?.admissionAllowed&&pre.storage?.researchDisk?.admissionAllowed?'Ready':pre.storage?.reason??pre.storage?.researchDisk?.reason??'Not ready'},{metric:'Active conflicts',value:pre.conflicts?.length??0},{metric:'Can start',value:pre.liveReady===true&&pre.conflicts?.length===0?'Yes':'No'}]);
    if(pre.capabilityCheck)table(result,[['capability','Capability'],['allowed','Allowed'],['reason','Action needed']],Object.entries(pre.capabilityCheck.availability).map(([k,v])=>({capability:labels[k],allowed:pre.capabilityCheck.capabilities[k]?'ON':'OFF',available:'',reason:capabilityGuidance(k,v,pre.capabilityCheck.capabilities[k])})));
    text(result,'Authority and account research are service-wide. Selected markets narrow market-specific investigation; scopes do not assert availability. Unresolved outcomes are legitimate.');
    if(pre.liveReady===true&&pre.conflicts?.length===0){let submitting=false;const start=button(primaryControls,'Confirm and queue run',async()=>{if(submitting||generation!==epoch||start.hidden)return;if(!window.confirm(`Start research for these ${selection.selectedServices} services, with a ceiling of ${pre.totalSafetyCeiling} new external requests?`))return;submitting=true;updateText(workflowStatus,'Start confirmed — awaiting admission. Use Recover Start if disconnected.');try{const job=await confirmedStart(pre.token);start.hidden=true;updateText(resultHeading,'Admitted Preflight snapshot');updateText(workflowStatus,'Admission recorded for job '+job.id+'. Execution status is shown below.');}catch(e){updateText(workflowStatus,e.message);}finally{submitting=false;}});nextAction=start;registerWorkflow('confirm',start);confirmIndicator.hidden=true;start.setAttribute('aria-label','Confirm and queue run');}
    else text(result,'Starting is blocked. Resolve the readiness or conflict information above, then run Preflight again.');
   }catch(e){if(generation===epoch)updateText(workflowStatus,e.message+' This Preflight did not start research. Use Recover Preflight after reconnecting/signing in.');}finally{updateWorkflow('pending',null);updateWorkflow('preflight',null);enablePreflight();}
  };
  preflight.addEventListener('click',()=>submitPreflight());
  counts.textContent='Validating authenticated lifecycle targeting…';const data=await request('v2-operations/targeting');if(!isCurrent())return;model=data;preview=previewTargeting(model,filters);
  text(overview,`Lifecycle eligible: ${data.counts.eligible} · Existing catalog: ${data.counts.baselineExcluded} — excluded from this lifecycle.`);
  text(overview,`Reviewed providers: ${data.counts.reviewed} · Needs human review: ${data.counts.humanReview} · Retained: ${data.counts.retainedServices} services / ${data.counts.retainedTargets} targets.`);
  text(overview,'Needs human review selects candidates for permitted research; it does not approve provider authority.');
  for(const preset of data.presets)presetButtons.set(preset.id,button(presetsBox,`${preset.name} (${preset.services})`,async()=>{filters.preset=preset.id;await changeFilters();}));
  for(const [key,title]of [['markets','Markets'],['categories','Categories']]){const detail=el('details'),options=el('div',undefined,'ops-facet-options');detail.append(el('summary',title+' — optional'));button(detail,'All '+key,async()=>{filters[key]=[];await changeFilters();});
   for(const facet of data.facets[key]){const label=el('label',`${facet.name} (${facet.services})`),check=el('input');check.type='checkbox';check.checked=false;check.addEventListener('change',async()=>{filters[key]=check.checked?[...filters[key],facet.id]:filters[key].filter(v=>v!==facet.id);await changeFilters();});facetChecks[key].push([facet.id,check]);label.append(check);options.append(label);}detail.append(options);facetsBox.append(detail);}
  text(facetsBox,data.marketMeaning+' '+data.categoryMeaning+' Changing filters returns to All matching services.');renderRows();
  const recover=async(saved=null)=>{invalidate();const generation=epoch;const history=saved??await request('v2-operations/preflights');if(!isCurrent()||builderGeneration!==viewGeneration||generation!==epoch)return;
   // The authenticated endpoint returns newest-first, actor-owned records.
   const prior=(history.rows??[]).find(r=>r.input?.objective==='MATURE_LIFECYCLE');
   if(!prior){text(result,'No recoverable Preflight. No research has started.');return;}
   if(prior.status==='EXPIRED'){text(result,'Preflight expired. Run Preflight again before Start.');return;}
   if(prior.status==='FAILED'){text(result,'Preflight failed. Run Preflight again before Start. No research has started.');return;}
   if(!['RUNNING','SUCCEEDED'].includes(prior.status)){text(result,'No recoverable Preflight. No research has started.');return;}
   if(prior.input.targetingRevision!==model.revision){text(result,'Recovered selection is stale. Refresh targeting and run Preflight again.');return;}
   Object.assign(filters,prior.input.targeting??{preset:'ALL',markets:[],categories:[],q:'',services:prior.input.services});search.value=filters.q;
   capabilities={...prior.input.capabilities};for(const k of Object.keys(labels)){capChecks[k].checked=capabilities[k]===true;capStatuses[k]();}
   update();if(JSON.stringify([...preview.services].sort())!==JSON.stringify([...prior.input.services].sort())){text(result,'Recovered selection no longer matches. Run Preflight again.');return;}
   await submitPreflight(prior);
  };
  const recoveryEpoch=epoch;recoverWorkflow=history=>builderGeneration===viewGeneration&&epoch===recoveryEpoch?recover(history):Promise.resolve();
  button(tools,'Recover Preflight',()=>recover(),!summary.flags.control);
  button(tools,'Recover Start',async()=>{
   const history=await request('v2-operations/starts'),rows=history.rows??[];
   if(!rows.length){text(result,'No confirmed Start is recorded for this admin.');return;}
   result.replaceChildren(el('p','Recorded confirmations. Recovery never submits another Start.'));
   const inspect=async prior=>{try{const job=await watchOperation('start',prior);trackJob(job);text(result,'Admission recorded. Follow Live job status.');text(result,'Services: '+(job.config?.services?.join(', ')||'Frozen cohort scope'));}catch(error){text(result,error.message);}};
   if(rows.length===1){await inspect(rows[0]);return;}
   for(const prior of rows){text(result,`${prior.createdAt??''} · ${prior.id} · ${prior.status} · ${(prior.config?.services??[]).join(', ')}`);button(result,'View details for Start '+prior.id,()=>inspect(prior));}
  },!summary.flags.control);
  text(form,'After confirming Start, a lost connection does not mean failure. Use Recover Start after refresh/sign-in to retrieve the authoritative job outcome.');
  text(form,'Preflight continues if you disconnect. After refresh or sign-in, use Recover Preflight to review the same authenticated selection. Tokens still expire normally.');
 }
 async function configuration(p,summary,schedule=null){if(summary.lifecycleConfigured&&tab!=='Schedules')return researchBuilder(p,summary);const form=el('div',undefined,'ops-form');p.append(form);text(form,summary.lifecycleConfigured?'Mature lifecycle: frozen cohort only; server-owned request bounds. Direct and Decodo are independent acquisition permissions; Tavily discovers destinations. Research completion is independent of process completion.':'LOGIN_MANAGE only. No price research, Decodo, browser or configurator. Budgets cannot exceed the runner contract.');const scope=field(form,'Scope',['FULL_CATALOG','UNRESOLVED_ONLY','SELECTED_SERVICES'],schedule?.config.scope??(summary.lifecycleConfigured?'FULL_CATALOG':'UNRESOLVED_ONLY')),reads=field(form,'Base reads per service',['1','2'],schedule?.config.reads??2),discovery=field(form,'Discovery',['true','false'],String(schedule?.config.discovery??true)),ceiling=field(form,'Total request ceiling',null,schedule?.config.totalRequests??Math.max(1,(summary.metrics?.catalog??1)*25));ceiling.type='number';const chosen=new Set(schedule?.config.services??[]),picker=el('details');picker.append(el('summary','Selected services'));const search=field(picker,'Find services',null,''),results=el('div');button(picker,'Search',async()=>{const data=await request('v2-operations/services?limit=100&q='+encodeURIComponent(search.value));results.replaceChildren();for(const row of data.rows){const label=el('label',row.name+' — '+row.state),check=el('input');check.type='checkbox';check.disabled=row.selectable===false;check.checked=!check.disabled&&chosen.has(row.service);if(check.disabled)chosen.delete(row.service);check.addEventListener('change',()=>{if(!check.disabled&&check.checked)chosen.add(row.service);else chosen.delete(row.service);});label.append(check);if(row.eligibilityReason)label.append(el('span',' — '+row.eligibilityReason));results.append(label);}});picker.append(results);form.append(picker);if(summary.lifecycleConfigured){for(const n of [reads,discovery,ceiling])n.parentElement.hidden=true;}const capabilityInputs={};const capabilityLabels={direct:'Web / Direct HTTP',tavily:'Tavily',decodo:'Decodo',browser:'Browser / JavaScript',groq:'Groq — use when needed'};form.append(el('h3','Research capabilities'));text(form,'Enabled capabilities are permitted, not forced. V2 chooses when to use them according to evidence, budgets and policy.');for(const k of (summary.lifecycleConfigured?['direct','tavily','decodo','browser','groq']:['direct','tavily'])){if(k==='direct')form.append(el('h4','Acquisition'));if(k==='groq')form.append(el('h4','Interpretation'));const label=el('label',capabilityLabels[k]),check=el('input');check.type='checkbox';const available=summary.capabilityAvailability?.[k]?.available===true;check.disabled=!available;check.checked=schedule?.config.capabilities?.[k]??(available&&['direct','tavily'].includes(k));check.disabled=capabilityControl(k,summary.capabilityAvailability?.[k],check.checked).disabled;label.append(check);form.append(label);capabilityInputs[k]=check;const status=el('p',capabilityControl(k,summary.capabilityAvailability?.[k],check.checked).text);form.append(status);check.addEventListener('change',()=>{if(!available)check.checked=false;const state=capabilityControl(k,summary.capabilityAvailability?.[k],check.checked);check.disabled=state.disabled;status.textContent=state.text;});}const allLabel=el('label','Enable all available capabilities'),all=el('input');all.type='checkbox';all.addEventListener('change',()=>{for(const [k,c]of Object.entries(capabilityInputs)){c.checked=all.checked&&summary.capabilityAvailability?.[k]?.available===true;c.dispatchEvent(new Event('change'));}});allLabel.append(all);form.append(allLabel);text(form,'Decodo: Controlled acquisition when Direct is OFF; access fallback when Direct is ON.');text(form,'Browser: Bounded JavaScript resource discovery; not interactive browsing.');text(form,'Groq: Source-grounded interpretation when deterministic extraction is insufficient.');const selectedCapabilities=()=>Object.fromEntries(Object.keys(capabilityLabels).map(k=>[k,capabilityInputs[k]?.checked===true]));const config=()=>summary.lifecycleConfigured?{capabilities:selectedCapabilities(),objective:'MATURE_LIFECYCLE',scope:scope.value,services:scope.value==='SELECTED_SERVICES'?[...chosen]:[]}:({capabilities:selectedCapabilities(),objective:'LOGIN_MANAGE',scope:scope.value,services:scope.value==='SELECTED_SERVICES'?[...chosen]:[],reads:Number(reads.value),discovery:discovery.value==='true',totalRequests:Number(ceiling.value)});
 if(tab==='Schedules'){const frequency=field(form,'Frequency',['MANUAL','DAILY','EVERY_3_DAYS','WEEKLY','EVERY_2_WEEKS','MONTHLY','CUSTOM'],schedule?.frequency??'MANUAL'),time=field(form,'Local execution time',null,schedule?.time??'03:00');time.type='time';const zone=field(form,'Timezone',null,schedule?.timezone??summary.timezone),days=field(form,'Custom interval days (1–365)',null,schedule?.intervalDays??7),weekday=field(form,'Weekday (0 Sunday – 6 Saturday)',null,schedule?.weekday??1),monthDay=field(form,'Monthly day (1–28)',null,schedule?.monthDay??1),enabled=field(form,'Enabled',['false','true'],String(schedule?.enabled??false));button(form,schedule?'Save schedule changes':'Create schedule',async()=>{await post('schedules'+(schedule?'/'+schedule.id:''),{config:config(),frequency:frequency.value,time:time.value,timezone:zone.value,intervalDays:Number(days.value),weekday:Number(weekday.value),monthDay:Number(monthDay.value),enabled:enabled.value==='true'});await render();},!summary.flags.scheduling);text(form,'Editing frequency changes future triggers only. Disabling does not stop an active run. DST gaps use the next valid local minute; repeated times run once.');}
 else{const result=el('div');result.setAttribute('aria-label','Preflight and execution');button(form,'Preflight',async()=>{result.replaceChildren(el('p','Preflight in progress — checking run configuration. This check does not start research.'));const operation=await post('preflight',config());const pre=await awaitPreflight(operation,request,isCurrent);result.replaceChildren();table(result,[['metric','Preflight'],['value','Value']],Object.entries(pre).filter(([k,v])=>!['token','config'].includes(k)&&typeof v!=='object').map(([metric,value])=>({metric,value})));if(pre.capabilityCheck)table(result,[['capability','Capability'],['allowed','Allowed'],['available','Available'],['reason','Status']],Object.entries(pre.capabilityCheck.availability).map(([capability,v])=>({capability,allowed:pre.capabilityCheck.capabilities[capability],available:v.available,reason:v.reason??''})));text(result,pre.conflicts.length?'Active conflict: starting another run is blocked.':'No active conflict detected.');button(result,'Confirm and queue run',async()=>{if(!window.confirm(`Queue bounded V2 research with at most ${pre.totalSafetyCeiling} external requests?`))return;text(result,'Start confirmed. Revalidating before enqueue; use Recover Start if disconnected.');const job=await confirmedStart(pre.token);text(result,'Admission recorded. Follow Live job status.');},pre.conflicts.length>0||pre.liveReady===false);},!summary.flags.control);form.append(result,live);}}
 async function detail(p,id,summary){
  const detailGeneration=viewGeneration,data=await request('v2-operations/runs/'+id),r=data.run;if(!isCurrent()||detailGeneration!==viewGeneration)return;
  p.append(el('h2',r.name));const workspace=el('div',undefined,'ops-detail-workspace');p.append(workspace);
  const section=name=>{const node=el('section',undefined,'ops-inspect-section');node.append(el('h3',name));workspace.append(node);return node;};
  const top=section('Summary'),statusLine=el('p',`${r.objective} · ${r.origin} · ${r.status} · actor ${r.actor??'Unavailable'}`,'ops-state ops-status-'+statusTone(r.status)),timeLine=el('p'),actions={};top.append(statusLine,timeLine);
  text(top,r.lifecycle?.researchComplete===true?'Research complete':'Execution completion is separate from research completion. Unresolved pricing and Human Review may remain.');
  text(top,'Details are a recorded snapshot. The live card updates independently; Refresh operations reloads these sections.');
  if(r.owned){actions.stop=button(top,'Stop safely',async()=>{await post('jobs/'+r.jobId+'/stop');await render();},!summary.flags.control||!['RUNNING','QUEUED'].includes(r.status));actions.resume=button(top,'Resume',async()=>{await post('jobs/'+r.jobId+'/resume');await render();},!summary.flags.control||!['STOPPED','INTERRUPTED','FAILED'].includes(r.status));}else text(top,'Historical / external run: read-only.');
  const research=section('Research');
  const view=liveStatusView({id:r.jobId??r.id,status:r.status,services:[],maximumRequests:r.bounds?.totalRequests},r,data.services);
  text(research,view.research);text(research,view.budget);text(research,view.usage);
  if(r.lifecycle?.currentService)text(research,'Recorded current service: '+r.lifecycle.currentService);
  if(r.lifecycle?.phase)text(research,'Recorded lifecycle phase: '+r.lifecycle.phase);
  if(r.capabilities)table(research,[['capability','Permission (not usage)'],['allowed','Allowed']],Object.entries(r.capabilities).map(([capability,allowed])=>({capability,allowed})));
  const rows=data.services?.rows??[],pricing=section('Pricing');text(pricing,'Provider pricing is independent of service admission. User-entered price remains authoritative.');
  for(const row of rows)for(const price of row.pricing??[])text(pricing,`${row.name??row.service} · ${price.market??'Unscoped'} · ${readable(price.status)} · ${readable(price.confidence)}`);
  if(!rows.some(row=>row.pricing?.length))text(pricing,'No provider-price result reported in this snapshot.');
  if(data.services?.total>rows.length)text(pricing,'Partial service page; browse service results below for remaining records.');
  const evidenceSection=section('Evidence');text(evidenceSection,'Acquired and retained references are available in each service’s details. HTTP success alone is not verification.');await explorer(evidenceSection);
  const gaps=section('Gaps');for(const row of rows)if(row.unresolvedReasons?.length||row.reason)text(gaps,`${row.name??row.service}: ${reasonSummary(row)}`);if(!rows.some(row=>row.unresolvedReasons?.length||row.reason))text(gaps,'No gap detail reported in this snapshot.');
  const review=section('Human Review');text(review,view.review);for(const row of rows)if(row.humanReview?.length)text(review,`${row.name??row.service}: ${row.humanReview.map(x=>readable(typeof x==='string'?x:x.reason??x.kind)).join(' · ')}`);
  const technical=el('details',undefined,'ops-technical');technical.append(el('summary','Technical'));workspace.append(technical);
  const raw=el('details');raw.append(el('summary','Recorded run projection'),el('pre',JSON.stringify(r,null,2)));technical.append(raw);
  text(technical,`Run ${r.id} · Job ${r.jobId??'Not recorded'} · Engine ${r.engineVersion??'Unavailable'} · Origin ${r.origin}`);
  if(r.bounds)table(technical,[['metric','Bound'],['value','Value']],Object.entries(r.bounds).map(([metric,value])=>({metric,value})));
  if(r.acquisitionMetrics)table(technical,[['metric','Acquisition accounting'],['value','Value']],Object.entries(r.acquisitionMetrics).filter(([,v])=>v===null||typeof v!=='object').map(([metric,value])=>({metric,value})));
  if(r.capabilityUsage)table(technical,[['service','Service'],['kind','Capability'],['trigger','Trigger'],['status','Result'],['reason','Reason']],r.capabilityUsage.events??[]);
  for(const kind of ['manifest','summary','checkpoint'])button(technical,kind,async()=>{const value=await request('v2-operations/runs/'+id+'/artifacts/'+kind),box=el('details');box.open=true;box.append(el('summary','Structured '+kind));if(value.targets)table(box,[['service','Service'],['market','Scope'],['objective','Objective']],value.targets);else table(box,[['metric','Field'],['value','Value']],Object.entries(value).filter(([,v])=>typeof v!=='object').map(([metric,value])=>({metric,value})));technical.append(box);});
  table(technical,[['at','Time'],['type','Event'],['phase','Phase'],['service','Service'],['requestsConsumed','Requests']],data.events??[]);
  if(!isCurrent()||detailGeneration!==viewGeneration)return;
  if(r.owned&&r.jobId){detailObserver={id:r.jobId,update:job=>{if(job.id!==r.jobId)return;updateText(statusLine,`${r.objective} · ${r.origin} · ${job.status}${job.phase?' · '+job.phase:''} · actor ${r.actor??'Unavailable'}`);const cls='ops-state ops-status-'+statusTone(job.status);if(statusLine.className!==cls)statusLine.className=cls;updateText(timeLine,`Started: ${job.startedAt??'Not started'} · Updated: ${job.updatedAt??'Unavailable'} · Completed/stopped: ${job.finishedAt??'Not recorded'}`);actions.stop.disabled=!summary.flags.control||!['RUNNING','QUEUED'].includes(job.status);actions.resume.disabled=!summary.flags.control||!['STOPPED','INTERRUPTED','FAILED'].includes(job.status);}};trackJob({id:r.jobId,status:r.status,terminal:['COMPLETE','FAILED','STOPPED','INTERRUPTED'].includes(r.status)},false,r,data.services);}
 }
 async function render(){viewGeneration++;detailObserver=null;if(!isCurrent())return;root.replaceChildren(el('h2','V2 Operations'));text(root,'Loading operations…');try{const summary=await request('v2-operations/summary');if(!isCurrent())return;root.replaceChildren(el('h2','V2 Operations'));if(tab!=='Overview'&&(tab!=='Runs'||selectedRun))root.append(live);const nav=el('nav');for(const name of ['Overview','Runs','Schedules','Coverage','Unresolved','Services','Storage','History'])button(nav,name,async()=>{tab=name;selectedRun=null;offset=0;await render();});root.append(nav);if(!trackedId||(!tracking&&lastJob?.terminal))void(async()=>{try{let active=summary.health?.latest;if(!active?.owned||!active.jobId||!['RUNNING','QUEUED'].includes(active?.status)){const running=await request('v2-operations/runs?status=RUNNING&limit=50');active=running.rows?.find(r=>r.owned&&r.jobId);if(!active){const queued=await request('v2-operations/runs?status=QUEUED&limit=50');active=queued.rows?.find(r=>r.owned&&r.jobId);}}if(!disposed&&isCurrent()&&(!trackedId||(!tracking&&lastJob?.terminal&&trackedId!==active?.jobId))&&active?.owned&&active.jobId&&['RUNNING','QUEUED'].includes(active.status))trackJob({id:active.jobId,status:active.status,terminal:false},false,active);}catch{/* No inferred active job when the read model is unavailable. */}})();text(root,`Manual control ${summary.flags.control?'enabled':'disabled'} · Automatic scheduling ${summary.flags.scheduling?'enabled':'disabled'}.`);if(!summary.worker||Date.now()-Date.parse(summary.worker.at)>60000)text(root,'Execution worker unavailable or stale. Queued jobs will wait; no HTTP request runs research.');
 if(tab==='Overview'){if(summary.lifecycleConfigured)await configuration(root,summary);if(summary.expansion)table(root,[['metric','Expansion research'],['value','Value']],Object.entries(summary.expansion).filter(([,v])=>v===null||typeof v!=='object').map(([metric,value])=>({metric,value})));table(root,[['metric','Current knowledge'],['value','Value']],Object.entries(summary.metrics??{catalog:null}).map(([metric,value])=>({metric:metric==='catalog'?'Existing catalog (not lifecycle eligibility)':metric,value})));table(root,[['metric','Research health'],['value','Value']],Object.entries(summary.health).filter(([,v])=>typeof v!=='object').map(([metric,value])=>({metric,value})));table(root,[['metric','Refresh'],['value','Value']],Object.entries(summary.refresh??{observations:null}).filter(([k])=>k!=='sourceRun').map(([metric,value])=>({metric,value})));text(root,'No provider price is not a catalog failure. User-entered price remains authoritative.');if(!summary.lifecycleConfigured)await configuration(root,summary);}
 if(tab==='Runs'){if(selectedRun)await detail(root,selectedRun,summary);else{await configuration(root,summary);const data=await request('v2-operations/runs?limit=50&offset='+offset);table(root,[['name','Run'],['objective','Objective'],['origin','Origin'],['status','Status'],['createdAt','Created'],['requests','Requests'],['freshResolutions','Fresh gains']],data.rows,async r=>{selectedRun=r.id;offset=0;await render();});button(root,'Previous',async()=>{offset=Math.max(0,offset-50);await render();},offset===0);button(root,'Next',async()=>{offset+=50;await render();},offset+50>=data.total);}}
 if(tab==='Schedules'){const data=await request('v2-operations/schedules');for(const s of data.rows){const box=el('details');box.append(el('summary',`${s.config.objective} · ${s.enabled?'Enabled':'Disabled'} · ${s.frequency} · ${s.config.scope}`));text(box,`Next ${s.nextRunAt??'None'} · Last ${s.lastTrigger??'None'} · Result ${s.lastResult??'None'} · Last successful ${s.lastSuccessfulRunId??'None'}`);button(box,s.enabled?'Disable':'Enable',async()=>{await post('schedules/'+s.id+'/'+(s.enabled?'disable':'enable'));await render();},!summary.flags.scheduling);button(box,'Run now',async()=>{if(window.confirm('Evaluate and queue this schedule now without changing its next trigger?')){await post('schedules/'+s.id+'/run-now',{idempotencyKey:crypto.randomUUID()});await render();}},!summary.flags.scheduling);await configuration(box,summary,s);root.append(box);}if(!data.rows.length)text(root,'No automatic schedules configured.');root.append(el('h3','New schedule'));await configuration(root,summary);}
 if(tab==='Coverage'){const data=await request('v2-operations/coverage');text(root,'Recorded snapshots only. Different campaign scopes are not a fair winner comparison.');table(root,[['at','Snapshot'],['catalog','Catalog'],['complete','Login/manage'],['loginOnly','Login only'],['manageOnly','Manage only'],['high','HIGH'],['combined','HIGH + MEDIUM']],data.rows);}
 if(tab==='Storage'){const data=await request('v2-operations/storage');text(root,'Read-only storage inventory. Destructive GC is disabled. Unknown references remain protected.');table(root,[['metric','Filesystem / admission'],['value','Value']],Object.entries(data.disk??{}).map(([metric,value])=>({metric,value})));if(data.inventory){table(root,[['metric','Last dry-run inventory'],['value','Value']],Object.entries(data.inventory).filter(([,v])=>v===null||typeof v!=='object').map(([metric,value])=>({metric,value})));table(root,[['metric','Protected/classified allocated bytes'],['value','Bytes']],Object.entries(data.inventory.classes??{}).map(([metric,value])=>({metric,value})));}else text(root,'Storage inventory unavailable. No reclaimable-space estimate has been certified.');text(root,'Growth projection unavailable until sufficient comparable measurements exist.');}
 if(tab==='History'){const data=await request('v2-operations/history?limit=50&offset='+offset);text(root,'Permanent compact research history; execution completion is not research verification.');table(root,[['runId','Run'],['createdAt','Started'],['finishedAt','Finished'],['serviceCount','Services'],['researchComplete','Research complete'],['finalizationHash','Protected-reference receipt']],data.rows??[]);}
 if(['Services','Unresolved'].includes(tab))await explorer(root,tab==='Unresolved');
 button(root,'Refresh operations',render);
 }catch(e){if(isCurrent()){text(root,'Operations unavailable: '+e.message);button(root,'Retry',render);}}}
 await render();
 const revision=workflowRevision;
 void (async()=>{try{
  const [preflights,starts]=await Promise.all([request('v2-operations/preflights'),request('v2-operations/starts')]);
  if(disposed||!isCurrent()||workflowRevision!==revision)return;
  const start=starts.rows?.find(r=>r.status==='RUNNING'),preflight=preflights.rows?.find(r=>r.status==='RUNNING');
  if(start){const job=await watchOperation('start',start,()=>!disposed&&isCurrent()&&workflowRevision===revision);if(!disposed&&isCurrent()&&workflowRevision===revision)trackJob(job);}
  else if(preflight){const result=await watchOperation('preflight',preflight,()=>!disposed&&isCurrent()&&workflowRevision===revision);if(preflight.input&&recoverWorkflow&&!disposed&&isCurrent()&&workflowRevision===revision)await recoverWorkflow({rows:[{...preflight,status:'SUCCEEDED',result}]});}
  else {const completed=preflights.rows?.find(r=>r.input?.objective==='MATURE_LIFECYCLE');if(completed?.status==='SUCCEEDED'&&!trackedId&&!starts.rows?.some(s=>s.result?.idempotencyKey==='manual:'+completed.result?.token))await recoverWorkflow?.({rows:[completed]});}
 }catch{/* Read-only recovery never implies success or starts research. */}})();
 return ()=>{disposed=true;viewGeneration++;stopMonitor();root.remove();};
}
