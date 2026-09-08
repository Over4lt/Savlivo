const api = location.hostname === "localhost" ? "http://localhost:3000" : "https://savlivo-api.onrender.com";
let token = null;
let generation = 0;
let expiryTimer;
const $ = id => document.getElementById(id);
const message = text => {$("message").textContent = text;};
function clearSession() {
  token = null; clearTimeout(expiryTimer); generation++; $("dashboard").hidden = true; $("login").hidden = false; $("results").replaceChildren();
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
    const data=await request(`overview?days=${encodeURIComponent($("days").value)}&market=${encodeURIComponent($("market").value)}`);
    if(current!==generation || !token)return;
    if($("market").options.length===1) for(const [code,name] of data.markets) {const option=document.createElement("option");option.value=code;option.textContent=name;$("market").append(option);}
    $("results").replaceChildren();
    paragraph($("results"),`Collection ${data.collectionEnabled ? "enabled" : "disabled"}. Catalog services: ${data.catalogServices}. New accounts: ${data.newUsers ?? "suppressed / unavailable"}.`);
    for(const note of data.notes)paragraph($("results"),note);
    table("Product / catalog / AI events",[["event","Event"],["count","Events"],["actors","Distinct actors"]],data.events);
    paragraph($("results"),`Data quality: ${data.dataQuality.selectableMarkets} selectable markets; ${data.dataQuality.registryRows} registry fallbacks in scope.`);
    table("Persisted provider-price records (not user spending)",[["verification","Verification"],["prices","Prices"]],data.dataQuality.persistedPrices);
    table("Top 20 stored ACTIVE service / billing groups",[["service","Canonical service or manual"],["billing_route","Billing route"],["subscriptions","Stored ACTIVE records"]],data.serviceDistribution);
    table("Last stored entitlement records",[["plan","Plan"],["users","Accounts"]],data.entitlements);
    table("Recorded spending on stored ACTIVE rows (hundredths of currency)",[["currency","Currency"],["subscriptions","Stored ACTIVE subscriptions"],["users","Users"],["monthly_hundredths","Monthly hundredths"],["unknown_amounts","Unknown amounts"]],data.subscriptions);
    paragraph($("results"),"Savlivo revenue, conversion, retention and named missing-service demand are unavailable. No raw conversation or user portfolio viewer is provided.");message("Loaded.");
  } catch(error) {if(current===generation)message(error.message);}
}
$("login").addEventListener("submit",async event=>{
  event.preventDefault();message("Signing in…");
  const current=++generation;
  const password=$("password").value;$("password").value="";
  try {const result=await request("session",{method:"POST",body:JSON.stringify({email:$("email").value,password})});
    if(current!==generation)return;
    token=result.token;clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>{clearSession();message("Session expired. Sign in again.");},result.expiresInSeconds*1000);$("login").hidden=true;$("dashboard").hidden=false;await refresh();
  } catch(error) {message(error.message);}
});
$("filters").addEventListener("submit",event=>{event.preventDefault();refresh();});
$("logout").addEventListener("click",async()=>{
  const previous=token;clearSession();message("Signed out locally.");
  try{await request("session",{method:"DELETE",headers:{Authorization:`Bearer ${previous}`}});}
  catch {if(!token)message("Signed out locally. Any unreachable server session expires within 15 minutes.");}
});
window.addEventListener("pagehide",clearSession);
