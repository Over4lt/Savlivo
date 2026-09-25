// Recorded projection only. No inference of admission from execution or pricing.
export const outcomeLabels={complete:'Research complete',review:'Human Review',partial:'Partial research',pending:'Pending evidence',account:'Login/manage established',other:'Other / not reported'};
export const needsAction=r=>r.state==='HUMAN_REVIEW_REQUIRED'||r.authority==='HUMAN_REVIEW_REQUIRED'||(r.humanReview?.length??0)>0;
export const outcome=r=>needsAction(r)?'review':r.researchComplete===true?'complete':r.state==='PARTIAL'?'partial':r.state==='UNRESOLVED'||r.state==='INSUFFICIENT_EVIDENCE'?'pending':r.state==='LOGIN_MANAGE_ESTABLISHED'?'account':'other';
export const reasonCodes=r=>[...new Set([...(r.unresolvedReasons??[]).map(x=>typeof x==='string'?x:x.reason??x.kind),...(needsAction(r)?['HUMAN_REVIEW_REQUIRED']:[]),...(!(r.unresolvedReasons?.length)&&typeof r.reason==='string'&&/^[A-Z_]+$/.test(r.reason)?[r.reason]:[])].filter(Boolean))];
const number=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const established=x=>['ESTABLISHED','VERIFIED'].includes(x);
export const pricingEstablished=p=>p.status==='ESTABLISHED'&&p.amount!==0&&p.amount!=='0';
export function resultOverview(run,rows){
 const buckets=Object.fromEntries(Object.keys(outcomeLabels).map(k=>[k,[]])),action=[],reasons=new Map(),price={targets:0,established:0,unresolved:0,partial:0,other:0,quarantined:0,noTarget:[],establishedServices:[],unresolvedServices:[],confidence:{}},dimensions=Object.fromEntries([['authority','Provider authority'],['identity','Identity'],['subscription','Subscription qualification'],['markets','Markets'],['login','Login'],['management','Manage'],['cancellation','Cancel']].map(([k,label])=>[k,{label,established:0,applicable:0,unknown:0,notApplicable:0}]));
 let zero=0,active=0,unknownActivity=0;
 for(const row of rows){
  buckets[outcome(row)].push(row.service);if(needsAction(row))action.push(row.service);
  if(row.researchComplete!==true)for(const reason of reasonCodes(row)){if(!reasons.has(reason))reasons.set(reason,[]);reasons.get(reason).push(row.service);}
  for(const [key,d]of Object.entries(dimensions)){const value=row[key];if(value==='NOT_APPLICABLE')d.notApplicable++;else if(typeof value==='string'&&value){d.applicable++;if(established(value))d.established++;}else d.unknown++;}
  const prices=row.pricing??[];if(!prices.length)price.noTarget.push(row.service);let yes=false,no=false;
  for(const p of prices){price.targets++;if(pricingEstablished(p)){price.established++;yes=true;if(['HIGH','MEDIUM','LOW'].includes(p.confidence))price.confidence[p.confidence]=(price.confidence[p.confidence]??0)+1;}else if(p.status==='UNRESOLVED'||p.amount===0||p.amount==='0'){price.unresolved++;no=true;}else if(p.status==='PARTIAL'){price.partial++;no=true;}else price.other++;if(number(p.quarantined))price.quarantined+=p.quarantined;}
  if(yes)price.establishedServices.push(row.service);if(no)price.unresolvedServices.push(row.service);
  if(row.requests===0)zero++;else if(number(row.requests))active++;else unknownActivity++;
 }
 const u=run.capabilityUsage??{},a=run.acquisitionMetrics??{};
 const direct=u.directRequests??(number(a.directPageRequests)&&number(a.robotsRequests)?a.directPageRequests+a.robotsRequests:null);
 return {total:rows.length,buckets,action,reasons,price,dimensions,efficiency:{used:number(run.requests)?run.requests:null,budget:run.bounds?.totalRequests??null,perService:number(run.requests)&&rows.length?run.requests/rows.length:null,zero,active,unknownActivity,usage:{Direct:direct,Tavily:u.tavilyRequests??a.tavilySearches,Decodo:u.decodoRequests??a.decodoRequests,Browser:u.browserExecutions??a.browserExecutions,Groq:u.groqCalls??a.groqCalls}}};
}
export function filterOverviewRows(rows,{ids=null,q='',state=''}={}){
 return rows.filter(r=>(!ids||ids.has(r.service))&&(!q||(r.name+' '+r.service).toLowerCase().includes(q.toLowerCase()))&&(!state||(state==='CHANGED'?r.changed===true:state==='UNRESOLVED'?r.state!=='LOGIN_MANAGE_ESTABLISHED':r.state===state||reasonCodes(r).includes(state))));
}
