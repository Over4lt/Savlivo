// Closed deployment map. Query strings, storage and browser payloads cannot set an API URL.
const api = location.origin === "https://admin.savlivo.com"
  ? "https://savlivo-api.onrender.com"
  : location.hostname === "localhost" && ["http:", "https:"].includes(location.protocol)
    ? "http://localhost:3000" : null;
let token = null;
let generation = 0;
let analyticsRange="30d", analyticsMonth="", analyticsSegment="top-services";
let priceService="",priceMarket="",pricePlan="",pricePeriod="3M",priceMode="actual",priceRequestVersion=0;
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
  token = null; browserAbort?.abort(); clearTimeout(expiryTimer); generation++; $("dashboard").hidden = true; $("session-actions").hidden=true; $("admin-navigation").replaceChildren(); $("login").hidden = false; $("results").replaceChildren();
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
    const code=typeof detail?.error==="string"&&/^[A-Z][A-Z0-9_]{0,79}$/.test(detail.error)?`: ${detail.error}`:"";
    const fallback=path.startsWith("v2-operations/")?`Request failed (HTTP ${response.status}${code}).`:"Request unavailable. Check configuration or try again later.";
    throw new Error(response.status === 401 ? "Access denied or session expired." : messages[detail?.error]??fallback);
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
  adminViews={analytics,operations,links,active:null,operationsEnabled:false,priceCoverage:null,analyticsLoaded:false,scroll:{analytics:0,operations:0}};
  $("admin-navigation").append(navigation);
  $("results").append(analytics,operations);
}
async function ensureOperations() {
  if(!adminViews?.operationsEnabled||disposeOperations)return;
  if(operationsLoading)return operationsLoading;
  const views=adminViews,session=token;
  operationsLoading=(async()=>{
    try {
      const {mountOperations}=await import("./v2-operations.js");
      if(adminViews!==views||token!==session||!views.operationsEnabled)return;
      const dispose=await mountOperations(views.operations,request,()=>adminViews===views&&token===session&&views.operationsEnabled,{priceCoverage:views.priceCoverage});
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
    adminViews.priceCoverage=data.dataQuality.priceCoverage??null;
    if(!adminViews.operationsEnabled&&disposeOperations){disposeOperations();disposeOperations=null;adminViews.operations.replaceChildren();}
    await selectAdminView(adminViews.active??(location.hash==="#v2-operations"?"operations":"analytics"),false);
    if(current!==generation||!token)return;
    if(adminViews.active==="operations"){message("Loaded.");return;}
    const panel=adminViews.analytics;
    panel.replaceChildren();
    paragraph(panel,`Collection ${data.collectionEnabled ? "enabled" : "disabled"}. Catalog services: ${data.catalogServices}.`);
    for(const note of data.notes)paragraph(panel,note);
    paragraph(panel,`Data quality: ${data.dataQuality.selectableMarkets} selectable markets; ${data.dataQuality.registryRows} registry fallbacks in scope.`);
    table("Persisted provider-price records (not user spending)",[["verification","Verification"],["price_status","Current status"],["prices","Prices"]],data.dataQuality.persistedPrices);
    const analyticsHeading=document.createElement("h2");analyticsHeading.id="analytics";analyticsHeading.textContent="Analytics";panel.append(analyticsHeading);
    if(data.analyticsV2Enabled) {
      const analytics=await request(`analytics?range=${encodeURIComponent(analyticsRange)}`);
      if(current!==generation || !token)return;
      if(!analytics.months.includes(analyticsMonth))analyticsMonth=analytics.months[0];
      const segments=await request(`analytics/segments?report=${encodeURIComponent(analyticsSegment)}&month=${encodeURIComponent(analyticsMonth)}`);
      if(current!==generation || !token)return;
      renderAnalytics(analytics,segments);
    } else paragraph(panel,"Analytics reporting is disabled by the API configuration. Enable ANALYTICS_V2_REPORTING_ENABLED, ANALYTICS_PRIVACY_REVIEWED and ANALYTICS_MAINTENANCE_ENABLED on the API to use the prepared Growth, Plans and Product reports. Collection is configured separately. No user-level viewer is provided.");
    const prices=analyticsSection("Price Analytics / Prisutvikling"),priceBody=document.createElement("div");
    prices.append(priceBody);void loadPriceAnalytics(priceBody,current);
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
    $("login").hidden=true;$("dashboard").hidden=false;$("session-actions").hidden=false;await refresh();
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

function priceQuery() {
  const parts=[`period=${encodeURIComponent(pricePeriod)}`];
  if(priceService)parts.push(`service=${encodeURIComponent(priceService)}`);
  if(priceMarket)parts.push(`market=${encodeURIComponent(priceMarket)}`);
  if(pricePlan)parts.push(`plan=${encodeURIComponent(pricePlan)}`);
  return `analytics/prices?${parts.join("&")}`;
}
async function loadPriceAnalytics(body,refreshVersion=generation) {
  const version=++priceRequestVersion,session=token;
  body.replaceChildren();paragraph(body,"Loading provider price history…");
  try {
    let data=await request(priceQuery());
    if(!Array.isArray(data?.services))throw new Error("Price Analytics is unavailable.");
    if(data.state==="SELECT_SERVICE"&&data.services.length&&!priceService) {
      if(version!==priceRequestVersion||refreshVersion!==generation||token!==session)return;
      priceService=data.services[0].slug;
      data=await request(priceQuery());
    }
    if(version!==priceRequestVersion||refreshVersion!==generation||token!==session)return;
    renderPriceAnalytics(body,data);
  } catch(error) {
    if(version!==priceRequestVersion||refreshVersion!==generation||token!==session)return;
    body.replaceChildren();paragraph(body,`Price Analytics unavailable: ${error.message}`);
  }
}
function priceSelect(form,labelText,options,value,onChange) {
  const label=document.createElement("label"),select=document.createElement("select");
  label.textContent=labelText;
  for(const [key,text] of options) {
    const option=document.createElement("option");option.value=key;option.textContent=text;select.append(option);
  }
  select.value=value;select.addEventListener("change",()=>onChange(select.value));label.append(select);form.append(label);
  return select;
}
function priceMoney(minor,currency) {
  if(!Number.isSafeInteger(minor)||typeof currency!=="string")return "Unavailable";
  try {
    const base=new Intl.NumberFormat(undefined,{style:"currency",currency});
    const digits=base.resolvedOptions().maximumFractionDigits??2;
    return (digits<2?new Intl.NumberFormat(undefined,{style:"currency",currency,maximumFractionDigits:2}):base).format(minor/100);
  } catch {return `${currency} ${(minor/100).toFixed(2)}`;}
}
const pricePercent=value=>Number.isFinite(value)?`${value>=0?"+":""}${value.toFixed(1)}%`:"Unavailable";
const priceDate=value=>value?new Date(value).toLocaleDateString(undefined,{year:"numeric",month:"short",day:"numeric"}):"Unavailable";
function priceHeading(parent,text) {const h=document.createElement("h3");h.textContent=text;parent.append(h);}
function priceEvidence(parent,url) {
  if(typeof url==="string"&&/^https:\/\/[^\s]+$/i.test(url)) {
    const link=document.createElement("a");link.href=url;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Evidence";parent.append(link);
  } else parent.textContent="Unavailable";
}
function renderPriceAnalytics(body,data) {
  body.replaceChildren();
  paragraph(body,"Current Verified and Old Verified prices are counted separately. Historical provider observations retain their original source class. Suggested prices and personal overrides are excluded. Verification dates are not proven provider-effective dates.");
  const controls=document.createElement("div");controls.className="price-analytics-controls";
  priceSelect(controls,"Service",[["","Choose service"],...(data.services??[]).map(row=>[row.slug,row.name])],priceService,value=>{
    priceService=value;priceMarket="";pricePlan="";void loadPriceAnalytics(body);
  });
  const market=priceSelect(controls,"Market",[["","All markets"],...(data.markets??[]).map(row=>[row.code,`${row.name} (${row.code})`])],priceMarket,value=>{
    priceMarket=value;pricePlan="";void loadPriceAnalytics(body);
  });market.disabled=!priceService;
  const plan=priceSelect(controls,"Subscription plan",[["","All plans"],...(data.planOptions??[]).map(row=>[row.seriesId,`${row.name} · ${row.market} · ${row.currency}`])],pricePlan,value=>{
    pricePlan=value;void loadPriceAnalytics(body);
  });plan.disabled=!priceService;
  priceSelect(controls,"Period",[["3M","3 months"],["6M","6 months"],["1Y","1 year"],["All","All recorded history"]],pricePeriod,value=>{
    pricePeriod=value;void loadPriceAnalytics(body);
  });
  priceSelect(controls,"Display",[["actual","Actual price"],["percent","Percentage change"],["index","Price index (100)"]],priceMode,value=>{
    priceMode=value;renderPriceAnalytics(body,data);
  });
  body.append(controls);
  if(data.state==="SELECT_SERVICE") {paragraph(body,"Choose a service to inspect its provider price history.");return;}
  if(data.state==="NARROW_FILTERS") {paragraph(body,"This selection exceeds the bounded history view. Choose a market or subscription plan.");return;}
  if(data.state!=="AVAILABLE") {paragraph(body,"Price history is unavailable.");return;}
  if(data.servicesTruncated||data.planOptionsTruncated)paragraph(body,"Some filter options exceed the bounded list. Narrow the service or market.");
  const summary=data.summary,metrics=document.createElement("div");metrics.className="price-metrics";
  for(const [label,value] of [["Markets with current Verified prices",summary.markets],["Current Verified plans",summary.plans],["Markets with Old Verified prices",summary.oldVerifiedMarkets??0],["Old Verified plans",summary.oldVerifiedPlans??0],["Price changes in the last 30 days",summary.priceChanges30d]]) {
    const card=document.createElement("div"),heading=document.createElement("strong"),number=document.createElement("span");
    heading.textContent=label;number.textContent=String(value);card.append(heading,number);metrics.append(card);
  }
  body.append(metrics);
  for(const [label,rows] of [["Largest increases (30 days)",summary.increases],["Largest decreases (30 days)",summary.decreases]]) {
    priceHeading(body,label);
    if(!rows.length)paragraph(body,"No documented price changes in this selection.");
    else {const list=document.createElement("ul");for(const row of rows){const item=document.createElement("li");item.textContent=`${row.market} · ${row.planName}: ${priceMoney(row.previousMinor,row.currency)} → ${priceMoney(row.newMinor,row.currency)} (${pricePercent(row.percent)})`;list.append(item);}body.append(list);}
  }
  priceHeading(body,"Most recent Verified dates");
  if(!summary.recentVerifications.length)paragraph(body,"No current Verified plans in this selection.");
  else {const list=document.createElement("ul");for(const row of summary.recentVerifications){const item=document.createElement("li");item.textContent=`${row.market} · ${row.planName}: Verified ${priceDate(row.verifiedAt)}; last checked ${priceDate(row.lastCheckedAt)}`;list.append(item);}body.append(list);}
  priceHeading(body,"Historical provider price observations");
  if(data.chartState==="NARROW_FILTERS")paragraph(body,"More than 16 semantic series match. Choose a market or plan to draw a readable chart.");
  else if(data.chartState==="EMPTY")paragraph(body,"No structured Verified history for this selection. Current prices may exist, but older history is unavailable until an approved as-of bootstrap or a future Verified write.");
  else priceCharts(body,data.series);
  if(data.series.some(row=>row.olderHistoryUnavailable))paragraph(body,"Some series begin with an as-of bootstrap. Prices before that recorded baseline are unavailable.");
  priceHeading(body,"Documented provider price changes");
  priceChanges(body,data.changes);
  if(data.changesTruncated)paragraph(body,"Only the 200 most recent changes are shown. Narrow the filters for a complete view.");
  priceHeading(body,"Market price movement");
  paragraph(body,"Each tile compares one semantic plan series with its own documented baseline. Plans and currencies are never averaged across markets.");
  priceHeatmap(body,data.heatmap);
  if(data.heatmapTruncated)paragraph(body,"Only 300 market-plan series are shown. Narrow the filters for a complete view.");
  paragraph(body,"Horizontal steps show successive recorded provider observations, including Old Verified where applicable, not proven provider-effective periods. The older 62 unlinked observations are excluded from this series view.");
}
function priceCharts(parent,series) {
  const groups=new Map();
  for(const row of series) {
    const key=priceMode==="actual"?row.currency:"comparison",group=groups.get(key)??[];group.push(row);groups.set(key,group);
  }
  for(const [key,rows] of groups) {
    priceHeading(parent,priceMode==="actual"?`Actual prices · ${key}`:priceMode==="percent"?"Change from valid baseline (%)":"Index from valid baseline (100)");
    const measured=rows.flatMap(row=>row.points.map(point=>priceMode==="actual"?point.amountMinor/100:priceMode==="percent"?point.percent:point.index).filter(Number.isFinite));
    if(!measured.length){paragraph(parent,"A valid baseline is unavailable for this display mode.");continue;}
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("class","price-step-chart");
    svg.setAttribute("viewBox","0 0 820 260");svg.setAttribute("role","img");
    svg.setAttribute("aria-label",`Step chart of ${rows.length} provider price series. Exact values and source classes appear in the point tooltips.`);
    const dated=rows.flatMap(row=>row.points.map(point=>Date.parse(point.at))).filter(Number.isFinite),
      left=Math.min(...dated),right=Math.max(...dated,left+86400000,...(rows.some(row=>row.current)?[Date.now()]:[])),
      bottom=Math.min(...measured,priceMode==="percent"?0:priceMode==="index"?100:Infinity),
      top=Math.max(...measured,priceMode==="percent"?0:priceMode==="index"?100:0),span=Math.max(1,top-bottom);
    const x=time=>60+(time-left)/(right-left)*740,y=value=>220-(value-bottom)/span*180;
    const palette=["#89d9b0","#91ceff","#f1c879","#f39bad","#c5adff","#87dfd8","#f8b982","#b0d781"];
    for(const [index,row] of rows.entries()) {
      const points=row.points.filter(point=>Number.isFinite(priceMode==="actual"?point.amountMinor/100:priceMode==="percent"?point.percent:point.index));
      if(!points.length)continue;
      const value=point=>priceMode==="actual"?point.amountMinor/100:priceMode==="percent"?point.percent:point.index;
      let path=`M ${x(Date.parse(points[0].at)).toFixed(1)} ${y(value(points[0])).toFixed(1)}`;
      for(let i=1;i<points.length;i++)path+=` H ${x(Date.parse(points[i].at)).toFixed(1)} V ${y(value(points[i])).toFixed(1)}`;
      if(row.current)path+=` H ${x(right).toFixed(1)}`;
      const line=document.createElementNS("http://www.w3.org/2000/svg","path");line.setAttribute("d",path);
      line.setAttribute("fill","none");line.setAttribute("stroke",palette[index%palette.length]);line.setAttribute("stroke-width","2.5");
      if(index>=palette.length)line.setAttribute("stroke-dasharray","7 4");svg.append(line);
      for(const point of points) {
        const dot=document.createElementNS("http://www.w3.org/2000/svg","circle"),tip=document.createElementNS("http://www.w3.org/2000/svg","title");
        dot.setAttribute("cx",x(Date.parse(point.at)).toFixed(1));dot.setAttribute("cy",y(value(point)).toFixed(1));
        dot.setAttribute("r","4");dot.setAttribute("fill",palette[index%palette.length]);
        tip.textContent=`${row.market} · ${row.planName} · ${priceDate(point.at)} · ${priceMoney(point.amountMinor,row.currency)} · ${point.priceStatus?.replaceAll('_',' ')??'Source class unavailable'}${point.kind==="BOOTSTRAP_BASELINE"?` (as-of baseline; provider checked ${priceDate(point.verifiedAt)})`:point.kind==="CARRIED_BASELINE"?" (carried baseline)":""}`;
        dot.append(tip);svg.append(dot);
      }
    }
    parent.append(svg);
    paragraph(parent,`Scale: ${priceMode==="actual"?`${priceMoney(Math.round(bottom*100),key)} to ${priceMoney(Math.round(top*100),key)}`:`${bottom.toFixed(1)} to ${top.toFixed(1)}${priceMode==="percent"?"%":" index points"}`}. Dates: ${priceDate(new Date(left).toISOString())} to ${priceDate(new Date(right).toISOString())}.`);
    const legend=document.createElement("ul");legend.className="price-legend";
    for(const [index,row] of rows.entries()){
      const item=document.createElement("li"),swatch=document.createElement("span"),label=document.createElement("span");
      swatch.className=`price-legend-swatch price-color-${index%palette.length}`;swatch.setAttribute("aria-hidden","true");
      label.textContent=`${row.market} · ${row.planName} (${row.currency}) · ${row.latestPriceStatus?.replaceAll('_',' ')??'Source class unavailable'}${index>=palette.length?" · dashed":""}${row.baselineKind===null?" · baseline unavailable":""}`;
      item.append(swatch,label);
      legend.append(item);
    }parent.append(legend);
  }
}
function priceChanges(parent,rows) {
  if(!rows.length){paragraph(parent,"No documented monetary changes in this period. Initial baselines and name-only updates are excluded.");return;}
  const wrap=document.createElement("div");wrap.className="table-wrap";
  const tableNode=document.createElement("table"),head=document.createElement("thead"),body=document.createElement("tbody"),header=document.createElement("tr");
  for(const label of ["Service","Market","Plan","Previous","New","Change","Source class","Checked / recorded","Evidence"]){const cell=document.createElement("th");cell.scope="col";cell.textContent=label;header.append(cell);}head.append(header);
  for(const row of rows) {
    const line=document.createElement("tr");
    for(const value of [row.serviceName,row.marketName+` (${row.market})`,row.planName,priceMoney(row.previousMinor,row.currency),priceMoney(row.newMinor,row.currency),`${priceMoney(row.absoluteMinor,row.currency)} (${pricePercent(row.percent)})`,`${row.previousPriceStatus?.replaceAll('_',' ')??'Unknown'} → ${row.newPriceStatus?.replaceAll('_',' ')??'Unknown'}`,`${priceDate(row.verifiedAt)} / ${priceDate(row.recordedAt)}${row.providerEffectiveAt?` · provider effective ${priceDate(row.providerEffectiveAt)}`:""}`]){
      const cell=document.createElement("td");cell.textContent=value;line.append(cell);
    }
    const evidence=document.createElement("td");priceEvidence(evidence,row.sourceUrl);line.append(evidence);body.append(line);
  }
  tableNode.append(head,body);wrap.append(tableNode);parent.append(wrap);
}
function priceHeatmap(parent,rows) {
  if(!rows.length){paragraph(parent,"No structured provider price series in this selection.");return;}
  const grid=document.createElement("div");grid.className="price-heatmap";
  for(const row of rows){const tile=document.createElement("div");tile.className=`price-heat-tile ${row.percent===null?"unavailable":row.percent>0?"increase":row.percent<0?"decrease":"flat"}`;
    const title=document.createElement("strong");title.textContent=`${row.marketName} (${row.market}) · ${row.planName} · ${row.latestPriceStatus?.replaceAll('_',' ')??'Source class unavailable'}`;tile.append(title);
    paragraph(tile,row.percent===null?"Unavailable: no comparable documented baseline and later value":`${pricePercent(row.percent)} · ${priceMoney(row.baselineMinor,row.currency)} → ${priceMoney(row.lastMinor,row.currency)}`);
    grid.append(tile);
  }parent.append(grid);
}
