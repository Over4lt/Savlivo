// Read-only presentation of existing Operations projections, not an execution model.
export const statusTone=status=>({QUEUED:'attention',RUNNING:'active',COMPLETE:'success',FAILED:'error',INTERRUPTED:'error',STOPPED:'attention',RESUMABLE:'attention',PARTIAL:'attention',HUMAN_REVIEW_REQUIRED:'attention',SKIPPED_CONFLICT:'attention',SKIPPED_NOT_DUE:'muted'}[status]??'muted');
const count=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const shown=v=>count(v)?String(v):'Not reported';
export function liveStatusView(job,run=null,services=null){
 const status=job.status??'UNKNOWN',life=run?.lifecycle,u=run?.capabilityUsage,a=run?.acquisitionMetrics;
 const used=count(run?.requests)?run.requests:null,max=job.maximumRequests??run?.bounds?.totalRequests;
 const usage=[['Direct requests',u?.directRequests??(count(a?.directPageRequests)&&count(a?.robotsRequests)?a.directPageRequests+a.robotsRequests:null)],['Tavily searches',u?.tavilyRequests??a?.tavilySearches],['Decodo requests',u?.decodoRequests??a?.decodoRequests],['Browser executions',u?.browserExecutions],['Groq calls',u?.groqCalls]].filter(([,v])=>count(v)).map(([k,v])=>k+': '+v).join(' · ');
 const rows=services?.rows,prices=rows?.flatMap(r=>r.pricing??[]),partial=rows&&services.total>rows.length;
 const pricing=prices?.length?prices.slice(0,8).map(p=>`${p.market??'Unscoped'}: ${p.status??'UNKNOWN'}${p.confidence?' ('+p.confidence+')':''}`).join(' · ')+(partial||prices.length>8?' · Partial results; view results for more':''):'Pricing results not reported in this snapshot';
 const review=count(life?.humanReviewRequired)?`Human Review required: ${life.humanReviewRequired}${life.executionComplete===true?'':' reported so far'}`:'Human Review: not reported';
 const elapsed=elapsedText(job);
 return {researchTone:life?.researchComplete===false?'attention':life?.researchComplete===true?'success':'muted',reviewTone:count(life?.humanReviewRequired)&&life.humanReviewRequired>0?'attention':'muted',pricingTone:prices?.some(p=>p.status==='UNRESOLVED')?'attention':'muted',tone:statusTone(status),title:job.terminal?'Execution result':'Live job',status:`Job ${job.id}: ${status}`,activity:status==='QUEUED'?(job.phase==='Preparing execution'?'Preparing execution':'Queued — waiting to start execution'):job.phase??(status==='RUNNING'?'Running':status==='COMPLETE'?'Execution complete':status.replaceAll('_',' ')),services:'Services: '+(job.services?.join(', ')||life?.currentService||'Frozen cohort scope'),markets:'Investigation markets: '+([...new Set((rows??[]).flatMap(r=>r.marketScope??[]))].join(', ')||'Not reported'),started:'Started: '+(job.startedAt??'Not started'),updated:'Updated: '+(job.updatedAt??'Unavailable'),finished:'Completed/stopped: '+(job.finishedAt??'Not recorded'),elapsed,budget:`Requests: ${shown(used)} / ${shown(max)}`,usage:usage||'Measured tool usage not reported',pricing,review,research:life?.researchComplete===true?'Research complete':life?.researchComplete===false?'Research remains incomplete':'Research completion not reported',completion:status==='COMPLETE'?'Execution terminated; pricing and other research dimensions may remain unresolved.':'Permission and readiness do not imply tool usage.',pipeline:[['Queued',status==='QUEUED'?'current':job.startedAt?'done':'unknown'],['Running',status==='RUNNING'?'current':job.finishedAt&&job.startedAt?'done':'unknown'],['Execution complete',status==='COMPLETE'?'done':'unknown']]};
}

const activeElapsed=job=>job?.terminal===false&&['QUEUED','RUNNING'].includes(job.status)&&Number.isFinite(Date.parse(job.startedAt??''));
export function elapsedText(job,now=Date.now()){
 const start=Date.parse(job.startedAt??''),end=activeElapsed(job)?now:Date.parse(job.finishedAt??job.updatedAt??'');
 const seconds=Number.isFinite(start)&&Number.isFinite(end)&&end>=start?Math.floor((end-start)/1000):null;
 return seconds===null?'Elapsed: not reported':`Elapsed: ${Math.floor(seconds/60)}m ${seconds%60}s${!activeElapsed(job)&&!job.finishedAt?' (as of status update)':''}`;
}
// Display-only clock: no request function or workflow action is available here.
export function elapsedClock(display,isCurrent=()=>true,schedule=setTimeout,cancel=clearTimeout,now=Date.now){
 let job=null,timer=null,disposed=false;
 const stop=()=>{if(timer!==null)cancel(timer);timer=null;};
 const tick=()=>{timer=null;if(disposed||!isCurrent())return;display(elapsedText(job,now()));if(activeElapsed(job))timer=schedule(tick,1000);};
 return {update(value){if(disposed)return;job=value;stop();if(isCurrent()){display(elapsedText(job,now()));if(activeElapsed(job))timer=schedule(tick,1000);}},dispose(){disposed=true;stop();}};
}
