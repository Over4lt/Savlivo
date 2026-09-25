// Pure scope derivation shared by live routing and retained-state compatibility.
// A redirect's robots policy belongs to the evaluated origin, not the initial URL.
// Incomplete/unbound diagnostics retain the conservative original-origin fallback.
function robotsStopOrigin(response,requestedUrl){
 const fallback=new URL(requestedUrl).origin,ds=response.accessDecisions;
 if(response.outcome!=='ACCESS_CONTROL_STOP'||response.failure?.code!=='ROBOTS_ACCESS_STOP'||!ds?.length)return fallback;
 try{
  if(ds[0].targetUrl!==requestedUrl||!ds.every(d=>new URL(d.targetUrl).origin===d.origin&&d.robotsUrl===d.origin+'/robots.txt'))return fallback;
  if(!ds.slice(0,-1).every(d=>['ALLOWED','NO_ROBOTS_POLICY'].includes(d.decision)))return fallback;
  const last=ds.at(-1);
  return ['DISALLOWED','ROBOTS_INVALID','ROBOTS_UNAVAILABLE','REVIEW_REQUIRED'].includes(last.decision)?last.origin:fallback;
 }catch{return fallback;}
}
// A matched path rule denies that request, not every sibling on the origin.
// Keep uncertain/global restrictions conservative; every future destination still
// passes its own robots check in the existing acquisition adapter.
function pathScopedRobotsStop(response,requestedUrl){
 if(response.outcome!=='ACCESS_CONTROL_STOP'||response.failure?.code!=='ROBOTS_ACCESS_STOP'||!response.accessDecisions?.length)return false;
 const denied=response.accessDecisions.filter(d=>!['ALLOWED','NO_ROBOTS_POLICY'].includes(d.decision));
 return denied.length>0&&denied.every(d=>d.targetUrl===requestedUrl&&d.decision==='DISALLOWED'&&d.reason==='MATCHED_RULE'&&d.boundary==='APPLICABLE_DISALLOW'&&d.rule?.directive==='disallow'&&typeof d.rule.path==='string'&&/^\/[^*?$]/.test(d.rule.path)&&!d.rule.path.includes('*'));
}
export function accessStopOrigins(response,requestedUrl){
 if(!['BLOCKED','ACCESS_CONTROL_STOP'].includes(response.outcome)&&response.failure?.code!=='ROBOTS_ACCESS_STOP')return [];
 return pathScopedRobotsStop(response,requestedUrl)?[]:[robotsStopOrigin(response,requestedUrl)];
}
