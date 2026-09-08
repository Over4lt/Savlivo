const api = "http://localhost:3000";
let token = null;
let generation = 0;
let expiryTimer;
let browserAbort;
const $ = id => document.getElementById(id);
const message = text => {$("message").textContent = text;};
if (location.protocol !== "https:" && location.hostname !== "localhost") {
  $("login").hidden=true;$("register").hidden=true;message("HTTPS is required for admin access.");
  throw new Error("HTTPS_REQUIRED");
}
// Local rehearsal only until production host/RP/origin review.
// The API independently denies production and unspecified runtimes.
if (location.hostname !== "localhost") {
  $("login").hidden=true;$("register").hidden=true;message("Hosted admin access remains disabled pending host review.");
  throw new Error("ADMIN_PRODUCTION_DISABLED");
}
function clearSession() {
  token = null; browserAbort?.abort(); clearTimeout(expiryTimer); generation++; $("dashboard").hidden = true; $("login").hidden = false; $("results").replaceChildren();
}
async function request(path, options = {}) {
  const authorization=options.headers?.Authorization ?? (token ? `Bearer ${token}` : undefined);
  const response = await fetch(`${api}/v1/admin/${path}`, { ...options, credentials:"omit", cache:"no-store", signal:AbortSignal.timeout(10000),
    headers:{"Content-Type":"application/json", ...(authorization ? {Authorization:authorization} : {}), ...options.headers}});
  if (response.status === 401 && (authorization === `Bearer ${token}` || (!authorization && !token))) {clearSession();message("Access denied or session expired.");}
  if (!response.ok) throw new Error(response.status === 401 ? "Access denied or session expired." : "Request unavailable. Check configuration or try again later.");
  return response.json();
}
function paragraph(parent,text) {const p=document.createElement("p");p.textContent=text;parent.append(p);}
function table(title, columns, rows) {
  const parent=$("results"); const heading=document.createElement("h2");heading.textContent=title;parent.append(heading);
  if (!rows.length) {paragraph(parent,"No reportable data.");return;}
  const wrap=document.createElement("div");wrap.className="table-wrap";
  const element=document.createElement("table"), head=document.createElement("thead"), body=document.createElement("tbody");
  const tr=document.createElement("tr");for (const [key,label] of columns) {const th=document.createElement("th");th.scope="col";th.textContent=label;tr.append(th);}head.append(tr);
  for (const row of rows) {const line=document.createElement("tr");for (const [key] of columns) {const td=document.createElement("td");td.textContent=String(row[key] ?? "Unavailable");line.append(td);}body.append(line);}
  element.append(head,body);wrap.append(element);parent.append(wrap);
}
async function refresh() {
  const current=++generation;message("Loading…");
  try {
    const data=await request(`overview?market=${encodeURIComponent($("market").value)}`);
    if(current!==generation || !token)return;
    if($("market").options.length===1) for(const [code,name] of data.markets) {const option=document.createElement("option");option.value=code;option.textContent=name;$("market").append(option);}
    $("results").replaceChildren();
    paragraph($("results"),`Collection ${data.collectionEnabled ? "enabled" : "disabled"}. Catalog services: ${data.catalogServices}.`);
    for(const note of data.notes)paragraph($("results"),note);
    paragraph($("results"),`Data quality: ${data.dataQuality.selectableMarkets} selectable markets; ${data.dataQuality.registryRows} registry fallbacks in scope.`);
    table("Persisted provider-price records (not user spending)",[["verification","Verification"],["prices","Prices"]],data.dataQuality.persistedPrices);
    paragraph($("results"),"Savlivo revenue, conversion, retention and named missing-service demand are unavailable. No raw conversation or user portfolio viewer is provided.");message("Loaded.");
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
  catch{if(!token)message("Server revocation could not be confirmed. Sessions expire within 15 minutes.");}
});
$("filters").addEventListener("submit",event=>{event.preventDefault();refresh();});
$("logout").addEventListener("click",async()=>{
  const previous=token;clearSession();message("Signed out locally.");
  try{await request("session",{method:"DELETE",headers:{Authorization:`Bearer ${previous}`}});}
  catch {if(!token)message("Signed out locally. Any unreachable server session expires within 15 minutes.");}
});
window.addEventListener("pagehide",clearSession);
