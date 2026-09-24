// Closed deployment map. Query strings, storage and browser payloads cannot set an API URL.
const api = location.origin === "https://admin.savlivo.com"
  ? "https://savlivo-api.onrender.com"
  : location.hostname === "localhost" && ["http:", "https:"].includes(location.protocol)
    ? "http://localhost:3000" : null;
let token = null;
let generation = 0;
let analyticsRange="30d", analyticsMonth="", analyticsSegment="top-services";
let expiryTimer;
let disposeOperations;
let adminViews=null;
let operationsLoading=null;
let browserAbort;
const $ = id => document.getElementById(id);
const message = text => {$("message").textContent = text;};
if (location.protocol !== "https:" && location.hostname !== "localhost") {
  $("login").hidden=true;$("register").hidden=true;message("HTTPS is required for admin access.");
  throw new Error("HTTPS_REQUIRED");
}
if (!api) {
  $("login").hidden=true;$("register").hidden=true;message("This origin is not configured for Savlivo Admin.");
  throw new Error("ADMIN_ORIGIN_DENIED");
}
function clearSession() {
  disposeOperations?.();disposeOperations=null;adminViews=null;operationsLoading=null;
  token = null; browserAbort?.abort(); clearTimeout(expiryTimer); generation++; $("dashboard").hidden = true; $("login").hidden = false; $("results").replaceChildren();
}
function operationsRequestTimeout(path) {
  if (path === "v2-operations/targeting") return 30000;
  return 10000;
}
async function request(path, options = {}) {
  const authorization=options.headers?.Authorization ?? (token ? `Bearer ${token}` : undefined);
  const response = await fetch(`${api}/v1/admin/${path}`, { ...options, credentials:"omit", cache:"no-store", signal:AbortSignal.timeout(operationsRequestTimeout(path)),
    headers:{"Content-Type":"application/json", ...(authorization ? {Authorization:authorization} : {}), ...options.headers}});
  if (response.status === 401 && (authorization === `Bearer ${token}` || (!authorization && !token))) {clearSession();message("Access denied or session expired.");}
  if (!response.ok) {
    const messages={PREFLIGHT_BUSY:"Another Preflight is still running. Use Recover Preflight or wait for it to finish.",PREFLIGHT_NOT_FOUND:"This Preflight is no longer available. Run Preflight again.",TARGETING_STALE_REFRESH_PREVIEW:"The lifecycle changed. Refresh the service preview and run Preflight again.",TARGETING_PREVIEW_MISMATCH:"The selection changed. Refresh the service preview before Preflight.",INVALID_LIFECYCLE_SELECTION:"That selection includes a service outside the frozen lifecycle.",PREFLIGHT_STALE:"Research inputs changed. Run Preflight again before starting.",PREFLIGHT_EXPIRED:"Preflight expired. Run Preflight again before starting."};
    const detail=path.startsWith("v2-operations/")?await response.json().catch(()=>null):null;
    throw new Error(response.status === 401 ? "Access denied or session expired." : messages[detail?.error]??"Request unavailable. Check configuration or try again later.");
  }
  return response.json();
}
function paragraph(parent,text) {const p=document.createElement("p");p.textContent=text;parent.append(p);}
function table(title, columns, rows, parent=adminViews.analytics) {
  const heading=document.createElement("h2");heading.textContent=title;parent.append(heading);
  if (!rows.length) {paragraph(parent,"No reportable data.");return;}
  const wrap=document.createElement("div");wrap.className="table-wrap";
  const element=document.createElement("table"), head=document.createElement("thead"), body=document.createElement("tbody");
  const tr=document.createElement("tr");for (const [key,label] of columns) {const th=document.createElement("th");th.scope="col";th.textContent=label;tr.append(th);}head.append(tr);
  for (const row of rows) {const line=document.createElement("tr");for (const [key] of columns) {const td=document.createElement("td");td.textContent=String(row[key] ?? "Unavailable");line.append(td);}body.append(line);}
  element.append(head,body);wrap.append(element);parent.append(wrap);
}
// One workspace per session. Navigation only hides panels; it never rebuilds Operations.
function ensureAdminViews() {
  if(adminViews)return;
  const navigation=document.createElement("nav");navigation.className="admin-view-nav";navigation.setAttribute("aria-label","Admin views");
  const analytics=document.createElement("section"),operations=document.createElement("section");
  analytics.id="analytics-view";operations.id="operations-view";
  analytics.setAttribute("aria-label","Analytics");operations.setAttribute("aria-label","V2 Operations");
  const links={};
  for(const [key,label,hash] of [["analytics","Analytics","#analytics"],["operations","V2 Operations","#v2-operations"]]) {
    const link=document.createElement("a");link.href=hash;link.textContent=label;link.setAttribute("aria-controls",key==="analytics"?analytics.id:operations.id);
    link.addEventListener("click",event=>{event.preventDefault();window.history.replaceState(null,"",hash);return selectAdminView(key);});
    links[key]=link;navigation.append(link);
  }
  adminViews={analytics,operations,links,active:null,operationsEnabled:false,analyticsLoaded:false,scroll:{analytics:0,operations:0}};
  $("results").append(navigation,analytics,operations);
}
async function ensureOperations() {
  if(!adminViews?.operationsEnabled||disposeOperations)return;
  if(operationsLoading)return operationsLoading;
  const views=adminViews,session=token;
  operationsLoading=(async()=>{
    try {
      const {mountOperations}=await import("./v2-operations.js");
      if(adminViews!==views||token!==session||!views.operationsEnabled)return;
      const dispose=await mountOperations(views.operations,request,()=>adminViews===views&&token===session&&views.operationsEnabled);
      if(adminViews!==views||token!==session||!views.operationsEnabled)dispose?.();else disposeOperations=dispose;
    } catch(error) {
      if(adminViews===views&&token===session){views.operations.replaceChildren();paragraph(views.operations,"V2 Operations could not load. "+error.message);}
    } finally {if(adminViews===views)operationsLoading=null;}
  })();
  return operationsLoading;
}
function selectAdminView(key,load=true) {
  if(!adminViews||!token)return;
  const views=adminViews;
  if(key==="operations"&&!views.operationsEnabled)key="analytics";
  const changed=views.active!==key;
  if(changed&&views.active)views.scroll[views.active]=window.scrollY??0;
  views.active=key;
  views.analytics.hidden=key!=="analytics";views.operations.hidden=key!=="operations";
  $("filters").hidden=key!=="analytics";
  views.links.operations.hidden=!views.operationsEnabled;
  for(const name of ["analytics","operations"])views.links[name].setAttribute("aria-current",name===key?"page":"false");
  if(changed)window.scrollTo?.({top:views.scroll[key],behavior:"instant"});
  if(key==="operations")return ensureOperations();
  if(load&&!views.analyticsLoaded)return refresh();
}
window.addEventListener("hashchange",()=>selectAdminView(location.hash==="#v2-operations"?"operations":"analytics"));
async function refresh() {
  const current=++generation;message("Loading…");
  try {
    const data=await request(`overview?market=${encodeURIComponent($("market").value)}`);
    if(current!==generation || !token)return;
    if($("market").options.length===1) for(const [code,name] of data.markets) {const option=document.createElement("option");option.value=code;option.textContent=name;$("market").append(option);}
    ensureAdminViews();
    adminViews.operationsEnabled=data.v2OperationsEnabled===true;
    if(!adminViews.operationsEnabled&&disposeOperations){disposeOperations();disposeOperations=null;adminViews.operations.replaceChildren();}
    await selectAdminView(adminViews.active??(location.hash==="#v2-operations"?"operations":"analytics"),false);
    if(current!==generation||!token)return;
    if(adminViews.active==="operations"){message("Loaded.");return;}
    const panel=adminViews.analytics;
    panel.replaceChildren();
    paragraph(panel,`Collection ${data.collectionEnabled ? "enabled" : "disabled"}. Catalog services: ${data.catalogServices}.`);
    for(const note of data.notes)paragraph(panel,note);
    paragraph(panel,`Data quality: ${data.dataQuality.selectableMarkets} selectable markets; ${data.dataQuality.registryRows} registry fallbacks in scope.`);
    table("Persisted provider-price records (not user spending)",[["verification","Verification"],["prices","Prices"]],data.dataQuality.persistedPrices);
    const analyticsHeading=document.createElement("h2");analyticsHeading.id="analytics";analyticsHeading.textContent="Analytics";panel.append(analyticsHeading);
    if(data.analyticsV2Enabled) {
      const analytics=await request(`analytics?range=${encodeURIComponent(analyticsRange)}`);
      if(current!==generation || !token)return;
      if(!analytics.months.includes(analyticsMonth))analyticsMonth=analytics.months[0];
      const segments=await request(`analytics/segments?report=${encodeURIComponent(analyticsSegment)}&month=${encodeURIComponent(analyticsMonth)}`);
      if(current!==generation || !token)return;
      renderAnalytics(analytics,segments);
    } else paragraph(panel,"Analytics reporting is disabled by the API configuration. Enable ANALYTICS_V2_REPORTING_ENABLED, ANALYTICS_PRIVACY_REVIEWED and ANALYTICS_MAINTENANCE_ENABLED on the API to use the prepared Growth, Plans and Product reports. Collection is configured separately. No user-level viewer is provided.");
    adminViews.analyticsLoaded=true;
    message("Loaded.");
  } catch(error) {if(current===generation)message(error.message);}
}
function from64(value) {
  const base=value.replace(/-/g,"+").replace(/_/g,"/");
  return Uint8Array.from(atob(base+"=".repeat((4-base.length%4)%4)),c=>c.charCodeAt(0));
}
function to64(value) {
  return btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function credential(options,register) {
  if(!navigator.credentials || !window.PublicKeyCredential)throw new Error("Passkeys are unavailable in this browser.");
  const publicKey={...options,challenge:from64(options.challenge)};
  if(register) {
    publicKey.user={...options.user,id:from64(options.user.id)};
    publicKey.excludeCredentials=(options.excludeCredentials??[]).map(c=>({...c,id:from64(c.id)}));
  } else publicKey.allowCredentials=(options.allowCredentials??[]).map(c=>({...c,id:from64(c.id)}));
  browserAbort?.abort();browserAbort=new AbortController();
  const result=await navigator.credentials[register?"create":"get"]({publicKey,signal:browserAbort.signal});
  if(!result)throw new Error("Passkey operation cancelled.");
  const response={clientDataJSON:to64(result.response.clientDataJSON)};
  if(register)response.attestationObject=to64(result.response.attestationObject);
  else {
    response.authenticatorData=to64(result.response.authenticatorData);response.signature=to64(result.response.signature);
    response.userHandle=result.response.userHandle?to64(result.response.userHandle):null;
  }
  return {id:result.id,rawId:to64(result.rawId),type:result.type,clientExtensionResults:result.getClientExtensionResults(),response};
}
$("login").addEventListener("submit",async event=>{
  event.preventDefault();message("Use your passkey to sign in…");
  const current=++generation;
  try {
    const options=await request("passkeys/authenticate/options",{method:"POST",body:"{}"});
    if(current!==generation)return;
    const response=await credential(options.options,false);
    if(current!==generation)return;
    const result=await request("passkeys/authenticate/verify",{method:"POST",body:JSON.stringify({challengeId:options.challengeId,response})});
    if(current!==generation) {await request("session",{method:"DELETE",headers:{Authorization:`Bearer ${result.token}`}});return;}
    token=result.token;clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>{clearSession();message("Session expired. Sign in again.");},result.expiresInSeconds*1000);
    $("login").hidden=true;$("dashboard").hidden=false;await refresh();
  } catch {if(current===generation)message("Passkey sign-in was cancelled or unavailable. Try again.");}
});
$("register").addEventListener("submit",async event=>{
  event.preventDefault();const current=++generation;
  const grant=$("enrollment").value.trim();$("enrollment").value="";
  message("Register your passkey…");
  try {
    const options=await request("passkeys/register/options",{method:"POST",body:"{}",...(grant?{headers:{Authorization:`Bearer ${grant}`}}:{})});
    if(current!==generation)return;
    const response=await credential(options.options,true);
    if(current!==generation)return;
    await request("passkeys/register/verify",{method:"POST",body:JSON.stringify({challengeId:options.challengeId,response})});
    if(current!==generation)return;
    clearSession();message("Passkey registered. Sign in with your passkey; prior sessions were revoked.");
  }catch{if(current===generation)message("Registration was cancelled or denied. A consumed enrollment grant cannot be reused.");}
});
$("revoke").addEventListener("click",async()=>{
  const previous=token;clearSession();message("Signed out locally.");
  try{await request("sessions",{method:"DELETE",headers:{Authorization:`Bearer ${previous}`}});if(!token)message("All admin sessions revoked.");}
  catch{if(!token)message("Server revocation could not be confirmed. Sessions expire within 60 minutes.");}
});
$("filters").addEventListener("submit",event=>{event.preventDefault();return refresh();});
$("logout").addEventListener("click",async()=>{
  const previous=token;clearSession();message("Signed out locally.");
  try{await request("session",{method:"DELETE",headers:{Authorization:`Bearer ${previous}`}});}
  catch {if(!token)message("Signed out locally. Any unreachable server session expires within 60 minutes.");}
});
window.addEventListener("pagehide",clearSession);

function analyticsSection(title) {
  const section=document.createElement("section"),heading=document.createElement("h2");heading.textContent=title;section.append(heading);adminViews.analytics.append(section);return section;
}
function renderAnalytics(data,segments) {
  const controls=document.createElement("form");controls.className="analytics-controls";
  function select(labelText,values,value,onChange) {
    const label=document.createElement("label"),select=document.createElement("select");label.textContent=labelText;
    for(const value of values){const option=document.createElement("option");option.value=value;option.textContent=value;select.append(option);}
    select.value=value;select.addEventListener("change",()=>onChange(select.value));label.append(select);controls.append(label);
  }
  select("Global range",["7d","30d","90d","12m"],analyticsRange,value=>{analyticsRange=value;});
  select("Closed month (Product only)",data.months,analyticsMonth,value=>{analyticsMonth=value;});
  select("Segment report",["top-services","selected-markets"],analyticsSegment,value=>{analyticsSegment=value;});
  const button=document.createElement("button");button.textContent="Update analytics";controls.append(button);
  controls.addEventListener("submit",event=>{event.preventDefault();return refresh();});adminViews.analytics.append(controls);
  const growth=analyticsSection("Growth");
  paragraph(growth,`Current accounts: ${data.current.total}. Excludes accounts scheduled for deletion; not active users.`);
  paragraph(growth,`Active users: unavailable. ${data.unavailable.activeUsers}`);
  paragraph(growth,`D7 / D30 retention: unavailable. ${data.unavailable.retention}`);
  const flow=(metric)=>data.history.some(bucket=>bucket.flows?.[metric]!==undefined)
    ? data.history.reduce((sum,bucket)=>sum+(bucket.flows?.[metric]??0),0) : "Unavailable";
  paragraph(growth,`Recorded new accounts in range: ${flow("new_account")}. Forward-only; gaps are not reconstructed.`);
  table("Recorded account creation",[["period","Period"],["count","Accounts created"]],data.history.map(bucket=>({period:bucket.period,count:bucket.flows?.new_account??"Unavailable"})),growth);
  const plans=analyticsSection("Plans");
  if(data.current.state==="data-quality-issue")paragraph(plans,`Data-quality issue: ${data.current.unclassified} unclassified entitlement states. Percentages unavailable.`);
  table("Current plan membership",[["plan","Plan"],["count","Accounts"],["share","Share"]],
    ["preview","manual","premium"].map(key=>({plan:key==="preview"?"Preview":key==="manual"?"Manual":"Premium",count:data.current[key],
      share:data.current.percentages?.[key]==null?"Unavailable":`${data.current.percentages[key].toFixed(1)}%`})),plans);
  paragraph(plans,`Paid-plan membership: ${data.current.paid}. Paid share: ${data.current.paidPercentage==null?"Unavailable":`${data.current.paidPercentage.toFixed(1)}%`}. This is not revenue or payment collection.`);
  paragraph(plans,"Plan history: actual observed stocks, not daily sums. Gaps are unavailable; no interpolation. Monthly points use only the last calendar day's recorded observation.");
  planGraph(plans,data.history);
  table("Plan history values",[["period","Period"],["observedAt","Observed at"],["preview","Preview"],["manual","Manual"],["premium","Premium"]],
    data.history.map(bucket=>({period:bucket.period,observedAt:bucket.plans.observedAt??"Unavailable",...Object.fromEntries(["preview","manual","premium"].map(key=>[key,bucket.plans[key]??"Unavailable"]))})),plans);
  table("Recorded entitlement changes",[["transition","Transition"],["count","Changes"]],[
    ["VIEWER_MANUAL","Preview → Manual"],["VIEWER_PREMIUM","Preview → Premium"],["MANUAL_PREMIUM","Manual → Premium"],
    ["PREMIUM_MANUAL","Premium → Manual"],["MANUAL_VIEWER","Manual → Preview"],["PREMIUM_VIEWER","Premium → Preview"]
  ].map(([metric,transition])=>({transition,count:flow(metric)})),plans);
  paragraph(plans,"Only authoritative changes at verified purchase persistence are observed. Automatic expiry/end-of-paid-status has no authoritative history hook and is unavailable.");
  const product=analyticsSection("Product");
  paragraph(product,`Collection ${data.collectionEnabled?"enabled":"disabled"}. History: ${data.historyState??"forward-only"}. ${data.semantics}`);
  paragraph(product,`Recorded no-result searches: ${flow("no_result")}. ${data.unavailable.noResult}`);
  const aiCount=metric=>{
    const values=data.history.map(bucket=>bucket.flows?.[metric]).filter(value=>value!==undefined&&value!==null);
    if(!values.length||values.some(value=>!Number.isSafeInteger(value)||value<0))return "Unavailable";
    const total=values.reduce((sum,value)=>sum+value,0);
    return Number.isSafeInteger(total)?total:"Unavailable";
  };
  const successes=aiCount("ai_success"),failures=aiCount("ai_failure"),fallbacks=aiCount("ai_fallback");
  const outcomes=[successes,failures,fallbacks];
  const total=outcomes.every(Number.isSafeInteger)?outcomes.reduce((sum,value)=>sum+value,0):null;
  const requests=Number.isSafeInteger(total)?total:null;
  const rate=count=>Number.isSafeInteger(count)&&requests!==null&&requests>0
    ? `${(count/requests*100).toFixed(1)}%`:"Unavailable";
  paragraph(product,`AI route completions: ${successes}; AI route failures: ${failures}. Counts measure endpoint outcomes, not conversation quality or device sessions. Missing observations are unavailable.`);
  paragraph(product,`Recorded AI requests: ${requests??"Unavailable"}; offline navigation fallbacks: ${fallbacks}. Recorded failure rate: ${rate(failures)}; recorded fallback rate: ${rate(fallbacks)}. These rates use captured outcomes only; queue loss may bias them.`);
  paragraph(product,`Registered enabled push endpoints: ${data.push?.state==="available"?data.push.registeredEnabledEndpoints:"Unavailable"}. Endpoint rows are not distinct people, OS permission or device delivery. ${data.unavailable.push}`);
  paragraph(product,`Technical health: unavailable beyond recorded AI route failures. ${data.unavailable.technicalHealth}`);
  paragraph(product,`Selected-market activity means the selected Savlivo view, not location. Accounts may use multiple markets; these are not an additive geography breakdown.`);
  if(segments.state==="available") {
    paragraph(product,`${segments.month}: ${segments.semantics} Suppressed cells include zero and are never shown as a numeric range.`);
    paragraph(product,"Remaining service rows are suppressed / unavailable; no exact remainder or percentage is exposed.");
    table("Global canonical services added",[["service","Service"],["contributors","Distinct contributors"]],segments.cells.filter(cell=>cell.state==="available").map(cell=>({service:cell.service,contributors:cell.contributors})),product);
  } else paragraph(product,`${segments.report} (${segments.month}): unavailable — ${segments.reason}`);
}
function planGraph(parent,history) {
  if(!history.some(bucket=>bucket.plans.state==="available")) {paragraph(parent,"Insufficient plan history. Collection starts forward-only after explicit activation.");return;}
  const ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg");
  svg.setAttribute("viewBox","0 0 800 220");svg.setAttribute("role","img");svg.setAttribute("aria-label","Plan membership observations. Preview, Manual and Premium. Exact values and timestamps follow in the table.");svg.setAttribute("class","plan-graph");
  const keys=["preview","manual","premium"],max=Math.max(1,...history.flatMap(b=>keys.map(k=>b.plans[k]??0)));
  for(const [i,bucket] of history.entries())for(const key of keys) {
    if(bucket.plans.state!=="available")continue;
    const point=document.createElementNS(ns,"circle"),title=document.createElementNS(ns,"title");
    point.setAttribute("cx",String(20+i*760/Math.max(1,history.length-1)));point.setAttribute("cy",String(200-bucket.plans[key]/max*180));
    point.setAttribute("r",key==="preview"?"6":key==="manual"?"4":"2");point.setAttribute("class",key);
    title.textContent=`${bucket.period}: ${key} ${bucket.plans[key]}`;point.append(title);svg.append(point);
  }
  parent.append(svg);paragraph(parent,"Legend: Preview — mint, large dot; Manual — blue, medium dot; Premium — amber, small dot. Vertical scale: 0 to "+max+" accounts. Dots are not connected across missing history.");
}
