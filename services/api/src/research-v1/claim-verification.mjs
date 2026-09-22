// Offline, conservative claim policy. Extraction proposals are never verification authority.
import assert from 'node:assert/strict';
import {officialLocalPriceForm,localPriceProposals,verifyLocalPrice} from './official-local-price.mjs';
export {officialLocalPriceForm} from './official-local-price.mjs';
import {createHash} from 'node:crypto';
import {timestamp,validateItem} from './contract.mjs';
import {validateCollection} from './collection-contract.mjs';
import {normalizePublicUrl} from './public-network.mjs';
import {extractPage} from './public-web-adapter.mjs';

export const claimPolicyVersion = 'DETERMINISTIC_CLAIMS_V1';
export const localizedOfferForm = 'LOCALIZED_RECURRING_OFFER_V1';
export const documentedStartForm='DOCUMENTED_OFFICIAL_WEB_START_V1';
export const structuredPriceForm='STRUCTURED_FIRST_PARTY_PRICE_V1';
export const redirectDestinationRule='EXACT_HTTPS_REDIRECT_OBSERVATION_V1';
export function validateProofForms(forms){
  assert(Array.isArray(forms)&&forms.length<=4&&new Set(forms).size===forms.length&&forms.every(f=>[localizedOfferForm,documentedStartForm,structuredPriceForm,officialLocalPriceForm].includes(f)),'Unknown or repeated proof form');
}
export const requiredClaims = Object.freeze(['availability', 'startWeb', 'cancelWeb']);
export const digestText = text => createHash('sha256').update(text).digest('hex');
const norm = text => text.normalize('NFC').replace(/\s+/gu, ' ').trim();
const https = value => {const u=new URL(value);assert(u.protocol==='https:'&&!u.username&&!u.password);return u;};
const exact = (a,b) => norm(a)===norm(b);
// Bounded raw JSON parsing for proof, separate from all provider pricing parsers.
// JSON.parse alone loses duplicate keys and the exact decimal number spelling.
export function inspectStructuredJson(text,{maxBytes=10000,maxNodes=1024,maxDepth=8}={}){
  assert(typeof text==='string'&&Buffer.byteLength(text)<=maxBytes);
  let i=0,nodes=0;const numbers={};
  const ws=()=>{while(/[\x20\t\r\n]/.test(text[i]??'!'))i++;};
  const string=()=>{const m=text.slice(i).match(/^"(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*"/);assert(m);i+=m[0].length;return JSON.parse(m[0]);};
  const parse=(path,depth)=>{
    assert(++nodes<=maxNodes&&depth<=maxDepth);ws();const c=text[i];
    if(c==='"')return string();
    if(c==='{'||c==='['){const object=c==='{',out=object?{}:[],seen=new Set();i++;ws();if(text[i]===(object?'}':']')){i++;return out;}
      for(let index=0;;index++){assert(index<64);ws();const key=object?string():String(index);assert(!seen.has(key),'Duplicate structured field');seen.add(key);ws();if(object)assert.equal(text[i++],':');
        const value=parse(path+'/'+key.replaceAll('~','~0').replaceAll('/','~1'),depth+1);Object.defineProperty(out,key,{value,enumerable:true,writable:true,configurable:true});ws();const end=text[i++];if(end===(object?'}':']'))return out;assert.equal(end,',');}
    }
    for(const [token,value] of [['true',true],['false',false],['null',null]])if(text.startsWith(token,i)){i+=token.length;return value;}
    const m=text.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);assert(m);i+=m[0].length;numbers[path]=m[0];return Number(m[0]);
  };
  const value=parse('',0);ws();assert.equal(i,text.length);return {value,numbers};
}
const semanticVersion='VERIFIED_PROVIDER_SEMANTICS_V1';
function semanticSource(task,page,at){
  timestamp(at);timestamp(page.checkedAt);const raw=page.rawSource?.text,u=https(page.url),a=page.authority;
  assert(typeof raw==='string'&&Buffer.byteLength(raw)<=4000000);
  assert(page.outcome==='OK'&&page.httpStatus===200&&['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(page.sourceType));
  assert(a?.status==='CONFIGURED_REVIEWED'&&a.hostname===u.hostname&&a.provider===task.serviceName&&a.sourceType===page.sourceType);
  assert(page.accessDecisions?.length&&page.accessDecisions.every(d=>['ALLOWED','NO_ROBOTS_POLICY'].includes(d.decision)));
  assert(page.sourceIntegrity?.sha256===digestText(raw)&&page.sourceIntegrity.checkedAt===page.checkedAt);
  assert(Date.parse(at)>=Date.parse(page.checkedAt)&&Date.parse(at)-Date.parse(page.checkedAt)<30*86400000);
  return {sourceUrl:page.url,sourceType:page.sourceType,sha256:digestText(raw),checkedAt:page.checkedAt};
}
// Independently bind current Google bootstrap data to its rendered purchase control.
// These guards describe retained first-party relationships; the pricing parser is
// not imported. New/ambiguous layouts require revalidation, never positional guesses.
function googlePurchase(page){
  assert(new URL(page.url).origin==='https://one.google.com'&&new URL(page.url).pathname==='/about/plans');
  const raw=page.rawSource.text;
  const blocks=key=>[...raw.matchAll(new RegExp("AF_initDataCallback\\(\\{key: '"+key+"', hash: '[^']*', data:([\\s\\S]*?), sideChannel: \\{\\}\\}\\);",'g'))];
  const market=blocks('ds:0'),prices=blocks('ds:1');assert(market.length===1&&prices.length===1);
  const country=inspectStructuredJson(market[0][1]).value?.[0]?.[6];assert(/^[A-Z]{2}$/.test(country));
  const data=inspectStructuredJson(prices[0][1],{maxBytes:100000,maxNodes:10000,maxDepth:16}).value;
  assert(data.length===1&&Array.isArray(data[0]));
  const rows=data[0].filter(r=>r?.[0]?.[1]==='100 GB'||r?.[3]?.[1]==='g1.100gb'||r?.[24]==='Basic');assert(rows.length===1);
  const r=rows[0];assert(r.length===32&&r[0][0]==='107374182400'&&r[0][1]==='100 GB'&&r[4]==='100 GB'&&r[24]==='Basic');
  assert(r[1]===2&&r[3][1]==='g1.100gb'&&r[3][2]==='com.google.android.apps.subscriptions.red');
  assert(r[16][0]==='g1.100gb'&&r[16][4][0]==='subs:com.google.android.apps.subscriptions.red:g1.100gb');
  assert([9,10,12,13,14,17,18,19,20,22,23,25,26,28,29,30].every(i=>r[i]===null));
  assert(r[15]===2&&r[27]===1&&r[31]?.length===1&&r[31][0]?.[3]?.[1]==='g1.100gb.annual');
  assert(r[7]?.[1]===1&&r[7][3][1]==='g1.100gb.annual'&&r[7][5].endsWith(' / year'));
  assert(!/trial|introduct|prepaid|one.time|eligib|promot|discount/i.test(JSON.stringify(r)));
  const currency=r[2][2];assert(/^[A-Z]{3}$/.test(currency));
  const formatted=r[5].match(/^([A-Z]{3})[ \u00a0]((?:0|[1-9]\d*)(?:\.\d{1,2})?) \/ month$/u);assert(formatted&&formatted[1]===currency);
  const amount=formatted[2],minor=BigInt(amount.split('.')[0])*100n+BigInt((amount.split('.')[1]??'').padEnd(2,'0'));
  assert(/^[1-9]\d*$/.test(r[2][0])&&BigInt(r[2][0])===minor*10000n&&minor>0n);
  assert(norm(r[2][1])===currency+' '+amount);
  const buttons=[...raw.matchAll(/<button\b[^>]*>/g)].map(m=>m[0]).filter(t=>/data-sku-id="g1\.100gb"/.test(t));assert(buttons.length===1);
  const button=buttons[0];assert(button.includes('data-formatted-price="'+r[5]+'"')&&button.includes('data-quota-bytes="107374182400"')&&button.includes('aria-label="Get started"'));
  const visible=extractPage(raw,page.url).text;
  assert(visible.includes("Choose the Google One plan that's right for you")&&visible.includes('By subscribing, you agree to terms for Google One')&&visible.includes('Monthly')&&visible.includes('Annual'));
  return {country,currency,amount,quote:r[5],schemaIdentity:'GoogleOne/Rhkjze/ds:1/Basic32-v1',semanticField:'ds:1/g1.100gb',plan:'Storage 100 GB',period:'MONTH',unit:'MICROS_WITH_EXACT_FORMATTED_MAJOR_VALUE'};
}
function googleRecurringSupport(task,pages,at){
  for(const page of pages)try{
    const ref=semanticSource(task,page,at),u=new URL(page.url);assert(u.origin==='https://support.google.com'&&u.pathname==='/googleone/answer/9056360');
    const text=extractPage(page.rawSource.text,page.url).text.split(/\n+/).map(norm);
    assert(text.includes('Cancel your Google One membership')&&text.includes("You'll stop future Google One payments.")&&text.includes('When you cancel your membership, your Google One storage and benefits won’t go away immediately. You have until the end of the billing cycle to use them. At that time, you will lose all your benefits.'));
    assert(text.includes('I purchased my current plan from the Play Store')&&text.includes('If you purchased your plan from a computer or an Android device:')&&text.includes('If you sign up through the App Store'));
    return ref;
  }catch{/* Other or ambiguous support does not establish commercial semantics. */}
  return null;
}
/** Reconstruct semantic knowledge from retained first-party documents. */
export function verifyProviderSemantics({task,pages=[],at,previous=[]}){
  assert(Array.isArray(pages)&&pages.length<=108&&Array.isArray(previous)&&previous.length<=32);
  const records=[];
  for(const page of pages){
    let ref;try{ref=semanticSource(task,page,at);}catch{continue;}
    const raw=page.rawSource.text;
    if(task.canonicalSlug==='google-one'&&task.serviceName==='Google One'&&new URL(page.url).origin==='https://one.google.com'){
      // Exact retained first-party plan card, including its own product destination.
      // Do not borrow a storage label or link from a neighbouring card.
      const cards=raw.split(/<div\b[^>]*class="planCard_YAJ88"[^>]*>/).slice(1);
      for(const card of cards)if(/<h3\b[^>]*>Basic<\/h3>/.test(card)&&
        /<g1-localized-price\s+variant="PRICE_100_MONTHLY"\s+country="[A-Z]{2}"\s*><\/g1-localized-price>\/(?:månad|mån|month)\b/u.test(card)&&
        /100(?:\s|\u00a0|&nbsp;)GB/.test(card)&&/href="https:\/\/one\.google\.com\/explore-plan\/100gb"/.test(card)){
        const fragment=card.slice(0,card.indexOf('</ul>')+5);if(fragment.length>8000)continue;
        records.push({provider:task.serviceName,serviceSlug:task.canonicalSlug,semanticField:'PRICE_100_MONTHLY',plan:'Storage 100 GB',productUrl:'https://one.google.com/explore-plan/100gb',period:'MONTH',
          unit:null,offerType:null,billingRoute:null,billingProvider:null,sourceFamily:null,markets:[],schemaIdentity:null,evidence:[{...ref,fragmentSha256:digestText(fragment)}],
          status:'PARTIAL',missing:['NUMERIC_UNIT','ORDINARY_RECURRING','PROVIDER_BILLING','FEED_SCHEMA_APPLICABILITY']});
      }
    }
    if(task.canonicalSlug==='google-one'&&task.serviceName==='Google One')try{
      const p=googlePurchase(page),support=googleRecurringSupport(task,pages,at);
      records.push({provider:task.serviceName,serviceSlug:task.canonicalSlug,semanticField:p.semanticField,plan:p.plan,period:p.period,unit:p.unit,
        offerType:support?'ORDINARY_RECURRING':null,billingRoute:support?'DIRECT':null,billingProvider:support?task.serviceName:null,
        sourceFamily:'https://one.google.com/about/plans',markets:[p.country],schemaIdentity:p.schemaIdentity,
        evidence:[ref,...(support?[support]:[])],status:support?'VERIFIED':'PARTIAL',missing:support?[]:['ORDINARY_RECURRING','PROVIDER_BILLING']});
    }catch{/* No relationship is inferred from parser output or expected prices. */}
  }

  const unique=[...new Map(records.map(r=>[digestText(JSON.stringify(r)),r])).values()];
  return unique.map(r=>{
    const {evidence,...meaning}=r;
    const fingerprint=digestText(JSON.stringify(meaning)),evidenceFingerprint=digestText(JSON.stringify(evidence)),prior=previous.find(p=>p.fingerprint===fingerprint);
    const evidenceDeadline=new Date(Math.min(...r.evidence.map(e=>Date.parse(e.checkedAt)+30*86400000))).toISOString();
    return {...r,version:semanticVersion,id:'semantics-'+fingerprint,fingerprint,evidenceFingerprint,verifiedAt:prior?.verifiedAt??at,revalidateAt:evidenceDeadline,
      supersedes:previous.filter(p=>p.semanticField===r.semanticField&&p.fingerprint!==fingerprint).map(p=>p.id),
      history:previous.filter(p=>p.semanticField===r.semanticField&&p.fingerprint!==fingerprint).map(p=>({id:p.id,fingerprint:p.fingerprint,status:'SUPERSEDED',verifiedAt:p.verifiedAt})),
      ...(prior&&['SUPERSEDED','REVOKED'].includes(prior.status)?{status:prior.status}:{} )};
  });
}
function structuredPrice(task,page,at,sources,knowledge){
  const ref=semanticSource(task,page,at);
  if(page.rawSource.contentType==='text/html'){
    const p=googlePurchase(page),scope=page.priceAcquisition?.scope;assert(task.canonicalSlug==='google-one'&&p.country===task.countryCode&&page.targetCountry===task.countryCode);
    assert(scope?.serviceSlug===task.canonicalSlug&&scope.countryCode===p.country&&scope.currency===p.currency&&scope.plan===p.plan&&scope.cadence==='MONTH'&&scope.billingRoute==='direct'&&scope.offerType==='ORDINARY_RECURRING'&&scope.taxTreatment==='UNKNOWN');
    const semantic=verifyProviderSemantics({task,pages:[page,...sources.filter(s=>s.url!==page.url)],at,previous:knowledge}).filter(s=>s.status==='VERIFIED'&&s.semanticField===p.semanticField);
    assert(semantic.length===1);const s=semantic[0];
    if(knowledge.length)assert(knowledge.some(k=>k.fingerprint===s.fingerprint&&k.status==='VERIFIED'&&Date.parse(k.revalidateAt)>Date.parse(at)));
    return {value:{amount:p.amount,currency:p.currency,plan:p.plan,cadence:'MONTH',cadenceDescription:'Monthly',billingRoute:s.billingRoute,billingProvider:s.billingProvider,offerType:s.offerType,taxTreatment:'UNKNOWN',taxNote:null},quote:p.quote,semantic:s,ref};
  }
  assert(page.rawSource.contentType==='application/json');
  const {value:d,numbers}=inspectStructuredJson(page.rawSource.text);assert(d&&typeof d==='object'&&!Array.isArray(d));
  assert(d.COUNTRY_CODE===task.countryCode&&/^[A-Z]{3}$/.test(d.CURRENCY_CODE)&&page.targetCountry===task.countryCode);
  const scope=page.priceAcquisition?.scope;assert(scope&&scope.serviceSlug===task.canonicalSlug&&scope.countryCode===d.COUNTRY_CODE&&scope.currency===d.CURRENCY_CODE);
  const semantics=verifyProviderSemantics({task,pages:sources,at,previous:knowledge});
  const matches=semantics.filter(s=>s.status==='VERIFIED'&&s.markets.includes(d.COUNTRY_CODE)&&s.sourceFamily.replace('{country}',d.COUNTRY_CODE.toLowerCase())===page.url&&
    s.plan===scope.plan&&s.period===scope.cadence&&s.billingRoute.toLowerCase()===scope.billingRoute&&s.offerType===scope.offerType&&scope.taxTreatment==='UNKNOWN');
  assert(matches.length===1,'Ambiguous or unproven schema semantics');const s=matches[0];
  if(knowledge.length)assert(knowledge.some(k=>k.fingerprint===s.fingerprint&&k.status==='VERIFIED'&&Date.parse(k.revalidateAt)>Date.parse(at)),'Semantic fingerprint changed');
  // Unknown extra field meanings cannot smuggle trial/conditional overrides into
  // a recognised scope. Google standard feed fields are independently identified
  // by their PRICE_* names; any explicit offer modifier invalidates this form.
  assert(Object.keys(d).every(k=>['COUNTRY_CODE','CURRENCY_CODE'].includes(k)||/^PRICE_[A-Z0-9_]+$/.test(k)));
  assert(!Object.keys(d).some(k=>/TRIAL|PROMO|INTRO|PREPAID|ELIGIB|ONETIME|ONE_TIME|DISCOUNT/.test(k)));
  assert(Object.keys(d).filter(k=>k===s.semanticField).length===1);
  const token=numbers['/'+s.semanticField];assert(typeof d[s.semanticField]==='number'&&typeof token==='string'&&/^(?:0|[1-9]\d{0,10})(?:\.\d{1,2})?$/.test(token)&&Number(token)>0);
  const amount=token.includes('.')?token.replace(/0+$/,'').replace(/\.$/,''):token;
  const quote=page.rawSource.text.slice(0,600);assert(page.rawSource.text.length<=600,'Structured price fragment exceeds existing evidence bound');
  return {value:{amount,currency:d.CURRENCY_CODE,plan:s.plan,cadence:s.period,cadenceDescription:'Monthly',billingRoute:s.billingRoute,billingProvider:s.billingProvider,offerType:s.offerType,taxTreatment:'UNKNOWN',taxNote:null},
    quote,semantic:s,ref};
}
function googleLifecycle(task,page,at,sources,knowledge){
  const ref=semanticSource(task,page,at),u=new URL(page.url);assert(task.canonicalSlug==='google-one'&&task.serviceName==='Google One'&&u.origin==='https://support.google.com');
  assert(u.searchParams.get('co')==='GENIE.Platform=Desktop');
  const x=extractPage(page.rawSource.text,page.url,{maxLinks:100}),text=x.text,lines=text.split(/\n+/).map(norm);
  assert(x.title.includes(' - Computer - Google One Help'));
  const scoped=sources.flatMap(p=>{try{return [structuredPrice(task,p,at,sources,knowledge)];}catch{return [];}});
  assert(scoped.length===1&&scoped[0].value.billingRoute==='DIRECT');
  const price=scoped[0];let fact,sequence;
  if(u.pathname==='/googleone/answer/9004013'){
    fact='startWeb';sequence=['On your computer, make sure you signed into your Google account.','In a browser, go to one.google.com .','At the top, click Upgrade .','Choose your new storage limit.','Review the new plan pricing and payment date, then click Continue .','To confirm your Google One plan, select your payment method and click Subscribe .'];
    assert(/<a\b[^>]*href="https:\/\/one\.google\.com\/?"[^>]*>one\.google\.com\.<\/a>/.test(page.rawSource.text));
  }else{
    assert(u.pathname==='/googleone/answer/9056360');fact='cancelWeb';sequence=['To stop payments for Google One and end your membership:','On your computer, go to Google One .','Click Settings Cancel membership .','To confirm, click Cancel membership .','You should get a confirmation that your subscription is cancelled.'];
    assert(/On your computer, go to <a\b[^>]*href="https:\/\/one\.google\.com\/"[^>]*>Google One<\/a>/.test(page.rawSource.text));
    assert(lines.includes('If you sign up through the App Store')); // Preserve alternate-billing exclusion.
  }
  const i=lines.indexOf(sequence[0]);assert(i>=0&&sequence.every((line,j)=>lines[i+j]===line));
  const quote=sequence.join(' ');assert(quote.length<=600);
  return {fact,value:'https://one.google.com/',quote,semantic:price.semantic,ref,supportingSources:[...price.semantic.evidence]};
}
export function extractStructuredPriceProposals(task,page,at,sources=[],knowledge=[]){
  const out=[];
  const proposal=(p,fact,value)=>({fact,value,countryCode:task.countryCode,basis:'EXPLICIT',status:'REVIEW_REQUIRED',quote:p.quote,
    proof:{form:structuredPriceForm,textSha256:digestText(page.extraction.text),checkedAt:page.checkedAt,rawSha256:p.ref.sha256,semanticFingerprint:p.semantic.fingerprint}});
  try{const p=structuredPrice(task,page,at,sources,knowledge);out.push(proposal(p,'prices',p.value));
    if(page.rawSource.contentType==='text/html')out.push(proposal(p,'availability','AVAILABLE'));
  }catch{/* Partial structured semantics cannot publish a scoped price. */}
  try{const p=googleLifecycle(task,page,at,sources,knowledge);out.push(proposal(p,p.fact,p.value));}catch{/* Missing lifecycle proof stays unresolved. */}
  return out;
}
const offerPattern=/^(.+) — (.+): ([A-Z]{3}) ((?:0|[1-9]\d*)(?:\.\d+)?) per (month|year), ordinary recurring subscription, billed directly by (.+), available in (.+)\.$/u;
const accountCancellation=/^Cancel your (.+) plan any time on your account page\.$/u;
const managementStep='Select Cancel plan , under Your plan at the top of the screen, or under Manage your plan .';
// A localized product offering is distinct from a verified price or an observed start URL.
// Reconstruct this bounded proof from retained text; never trust supplied semantic labels.
function localizedOfferingProof(task,page,marketName){
  try{
    if(page.sourceType!=='OFFICIAL_PROVIDER'||page.pageKind!=='PAGE'||page.httpStatus!==200)return null;
    const x=page.extraction, title=norm(x.title), country=task.countryCode.toLowerCase();
    if(x.metadata?.['og:site_name']!==task.serviceName||!title.startsWith(task.serviceName+' ')||
      !title.includes(` (${marketName})`)||/archive|historical|coming soon|discontinued|unavailable/iu.test(title))return null;
    // Reuse explicit country localization, strengthened with language and visible selector agreement.
    if(!new RegExp('^[a-z]{2,3}-'+task.countryCode+'$','i').test(page.locale??'')||page.declaredLanguage!==page.locale)return null;
    if(!new URL(page.url).pathname.toLowerCase().startsWith('/'+country+'-'+page.locale.split('-')[0].toLowerCase()+'/'))return null;
    const lines=[...x.text.matchAll(/[^\n]+/gu)].map(m=>({raw:m[0],text:norm(m[0]),offset:m.index}));
    const heading=lines.find(l=>l.text===title&&l.raw.length<=600);
    const selector=lines.find(l=>l.text===marketName||new RegExp('^'+marketName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+' \\([\\p{L} -]+\\)$','u').test(l.text));
    if(!heading||!selector||selector.raw.length>100)return null;
    const recurring=/^(?:Recurring subscriptions|Subscriptions) (?:include|use|have) automatic (?:monthly|annual|yearly) payments\.(?: You (?:can|may) cancel (?:anytime|at any time)\.)?$/iu;
    for(let i=0;i<lines.length;i++){
      if(!recurring.test(lines[i].text))continue;
      let payment=false;
      for(let j=i+1;j<Math.min(lines.length,i+10);j++){
        const quote=x.text.slice(lines[i].offset,lines[j].offset+lines[j].raw.length);
        if(quote.length>600||/unavailable|not available|no longer|example|archiv|coming soon|prepaid|does not auto-renew/iu.test(quote))break;
        if(/^Pay by (?:credit card|debit card|card|bank transfer|direct debit)\b.+\d/iu.test(lines[j].text))payment=true;
        if(payment&&/^(?:Continue|Subscribe|Select plan|Choose plan)$/iu.test(lines[j].text))return {
          form:localizedOfferForm,quote,components:[
            {role:'LOCALIZED_PRODUCT_HEADING',quote:heading.raw,offset:heading.offset},
            {role:'VISIBLE_MARKET',quote:selector.raw,offset:selector.offset},
            {role:'RECURRING_PAYMENT_SELECTION',quote,offset:lines[i].offset}],
          scope:'Subscription offering only; not customer eligibility, price truth or START_WEB'};
      }
    }
  }catch{/* Malformed metadata cannot create an offering. */}
  return null;
}
function documentedAccountCancellation(task,page,marketName){
  const lines=page.extraction.text.split(/\n+/u).map(norm);
  const declaration=lines.find(line=>accountCancellation.test(line));
  if(!declaration)return false;
  const product=declaration.match(accountCancellation)[1];
  // Explicit localized provider route AND visible market selector; requested locale alone is insufficient.
  const path=new URL(page.url).pathname.toLowerCase();
  return path.startsWith('/'+task.countryCode.toLowerCase()+'-') && lines.some(l=>l===marketName||l.startsWith(marketName+' (')) &&
    lines.includes('Go to your account page .')&&lines.includes(managementStep)&&
    lines.includes('Continue through to the confirmation message.')&&
    lines.includes(`Your ${product} stays until your next billing date, then your account switches to free.`);
}

// Trusted retained collector artifacts only, supplied separately from page/model proposals.
// This NEW research rule admits a redirect observation, never destination content.
export function bindDocumentedDestination(task,page,observedText,artifact,at){
  try{
    assert(typeof observedText==='string'&&/^[A-Za-z0-9.-]+(?:\/[A-Za-z0-9_~.%-]+(?:\/[A-Za-z0-9_~.%-]+)*\/?)?$/.test(observedText));
    assert(page.extraction.text.includes(observedText));
    const candidate=normalizePublicUrl('https://'+observedText);
    // Reject parser repairs (dot segments, encoded path changes, implicit path additions).
    const slash=observedText.indexOf('/'),host=slash<0?observedText:observedText.slice(0,slash),path=slash<0?'':observedText.slice(slash);
    assert(candidate.hostname===host.toLowerCase()&&candidate.pathname===(path||'/'));
    assert(host.includes('.'));
    validateCollection(artifact.configuration);
    assert(artifact.schemaVersion===1&&artifact.mode==='ONE_SHOT_OFFICIAL_PAGE');
    const {configuration:c,request:r,page:p,statistics:stats}=artifact;
    assert(c.url==='https://'+host.toLowerCase()+path&&r.url===c.url&&p.url===r.url);
    assert(c.targetCountry===task.countryCode&&r.targetCountry===task.countryCode&&p.targetCountry===task.countryCode);
    assert(c.authority.provider===task.serviceName&&c.authority.hostname===candidate.hostname);
    assert(c.maxRedirects===0&&r.maxRedirects===0&&artifact.readInvocations===1);
    assert(p.outcome==='UNRESOLVED'&&p.failure?.code==='REDIRECT_LIMIT'&&!p.httpStatus&&!p.extraction&&p.redirects.length===0);
    assert(stats.requests===2&&stats.robotsRequests===1&&stats.pageRequests===1&&stats.pageSuccesses===0&&stats.pageFailures===1);
    assert(p.accessDecisions.length===1&&JSON.stringify(stats.decisions)===JSON.stringify(p.accessDecisions));
    const d=p.accessDecisions[0];
    assert(d.targetUrl===r.url&&d.origin===candidate.origin&&d.robotsUrl===candidate.origin+'/robots.txt');
    assert(['ALLOWED','NO_ROBOTS_POLICY'].includes(d.decision)&&d.redirects.length===0&&d.cacheHit===false);
    assert(d.decision==='ALLOWED'?d.httpStatus===200:[404,410].includes(d.httpStatus));
    for(const t of [artifact.startedAt,artifact.completedAt,p.checkedAt,d.checkedAt]){timestamp(t);assert(Date.parse(t)<=Date.parse(at)&&Date.parse(at)-Date.parse(t)<30*86400000);}
    assert(artifact.startedAt<=p.checkedAt&&p.checkedAt<=artifact.completedAt);
    assert(!task.conflicts.some(c=>c.resolutionStatus==='OPEN'&&c.facts.includes('startWeb')));
    return {version:'EXACT_TEXT_HTTPS_BINDING_V1',documentedTextDestination:{kind:'DOCUMENTED_TEXT_DESTINATION',value:observedText,sourceUrl:page.url,textSha256:digestText(page.extraction.text),checkedAt:page.checkedAt},
      evidencedHttpsDestination:{kind:'EVIDENCED_HTTPS_DESTINATION',url:r.url,rule:redirectDestinationRule,outcome:'REDIRECT_OBSERVED',artifactSha256:digestText(JSON.stringify(artifact)),checkedAt:p.checkedAt,provider:c.authority.provider,targetCountry:c.targetCountry},
      destinationBinding:{hostnameEqual:true,pathEqual:true,onlyAddedComponent:'HTTPS_SCHEME'},
      limitations:['No destination content retrieved','No redirect target or equivalence established','No destination availability, market behavior, checkout, payment or account creation established']};
  }catch{return null;}
}
function documentedInstruction(line){
  // Whole-line bounded English grammar. No substring extraction from negation or examples.
  const m=norm(line).match(/^(?:Instead, go|Go) to ([A-Za-z0-9./_~%-]+) to (?:pick your plan and upgrade to [A-Z][A-Za-z0-9 -]{0,79}|select a paid plan and subscribe)\.$/u);
  return m?.[1]??null;
}
// Deterministic extraction for supported declarations; proposals still pass verifyClaim.
// No caller/model-supplied status is authoritative, including this extractor's status.
export function extractClaimProposals(task,page,marketName,proofForms=[],destinationObservations=[],at=page.checkedAt,semanticPricePolicy=null){
  validateProofForms(proofForms);
  const text=page.extraction?.text;if(typeof text!=='string')return [];
  const proposals=proofForms.includes(officialLocalPriceForm)?localPriceProposals(task,page,at,marketName,semanticPricePolicy):[];
  const add=(fact,value,quote)=>proposals.push({fact,value,quote,countryCode:task.countryCode,basis:'EXPLICIT',status:'REVIEW_REQUIRED',
    proof:{textSha256:digestText(text),checkedAt:page.checkedAt}});
  if(proofForms.includes(localizedOfferForm)){
    const offering=localizedOfferingProof(task,page,marketName);
    if(offering)add('availability','AVAILABLE',offering.quote);
  }
  for(const quote of text.split(/\n+/u)){
    if(!quote.trim()||quote.length>600||proposals.length>=60)continue;
    const q=norm(quote),name=task.serviceName;
    if(proofForms.includes(documentedStartForm)){const text= documentedInstruction(quote);if(text)for(const a of destinationObservations){const b=bindDocumentedDestination(task,page,text,a,at);if(b){add('startWeb',b.evidencedHttpsDestination.url,quote);break;}}}
    if(q===`The service is ${name}.`)add('identity',name,quote);
    if(q===`${name} subscriptions are available in ${marketName}.`)add('availability','AVAILABLE',quote);
    if(q===`${name} does not offer subscription pausing.`)add('pauseWeb',null,quote);
    if(accountCancellation.test(q)){
      const link=page.extraction.links?.find(l=>l.label==='account page');if(link)add('cancelWeb',link.url,quote);
    }
    if(q===managementStep){
      const link=page.extraction.links?.find(l=>l.label==='Manage your plan');if(link)add('manageWeb',link.url,quote);
    }
    for(const [fact,verb] of Object.entries({startWeb:'Start',manageWeb:'Manage',pauseWeb:'Pause',cancelWeb:'Cancel'})){
      const prefix=`${verb} your ${name} subscription online at `;
      const suffix=fact==='startWeb'?'. Subscription signup and recurring payment setup complete on this website.':
        fact==='cancelWeb'?'. Cancellation completes on this website.':'.';
      if(q.startsWith(prefix)&&q.endsWith(suffix))add(fact,q.slice(prefix.length,-suffix.length),quote);
    }
    const m=q.match(offerPattern);
    if(m&&m[1]===name&&m[6]===name&&m[7]===marketName){
      const cadence=m[5]==='month'?'MONTH':'YEAR',cadenceDescription=m[5]==='month'?'Monthly':'Yearly';
      add('plans',{name:m[2],cadence,cadenceDescription,billingRoute:'DIRECT',offering:'CURRENT'},quote);
      add('prices',{amount:m[4],currency:m[3],plan:m[2],cadence,cadenceDescription,billingRoute:'DIRECT',billingProvider:name,
        offerType:'ORDINARY_RECURRING',taxTreatment:'UNKNOWN',taxNote:null},quote);
      add('billingRoutes',{channel:'DIRECT',provider:name,url:null},quote);
    }
  }
  return proposals.slice(0,proofForms.includes(officialLocalPriceForm)?180:60);
}

// Diagnostics describe existing checks; they never supply proof or change admission.
export function diagnosePriceProof({task,page,observation:o={},at,marketName,providerSemanticEvidence=[],providerSemanticKnowledge=[]}){
  const dims={};const check=(name,fn)=>{try{dims[name]=fn()?'ESTABLISHED':'MISSING';}catch{dims[name]='MISSING';}};
  check('freshness',()=>{timestamp(at);timestamp(page.checkedAt);return Date.parse(at)>=Date.parse(page.checkedAt)&&Date.parse(at)-Date.parse(page.checkedAt)<30*86400000;});
  if(dims.freshness==='MISSING'&&Number.isFinite(Date.parse(page.checkedAt))&&Date.parse(at)-Date.parse(page.checkedAt)>=30*86400000)dims.freshness='STALE';
  check('successfulAcquisition',()=>page.outcome==='OK');
  check('sourceAuthority',()=>{const u=https(page.url),a=page.authority;return ['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(page.sourceType)&&a?.status==='CONFIGURED_REVIEWED'&&a.hostname===u.hostname&&a.sourceType===page.sourceType&&a.provider===task.serviceName;});
  check('accessPermission',()=>page.accessDecisions?.length&&page.accessDecisions.every(d=>['ALLOWED','NO_ROBOTS_POLICY'].includes(d.decision)));
  check('rawIntegrity',()=>typeof page.rawSource?.text==='string'&&page.sourceIntegrity?.sha256===digestText(page.rawSource.text)&&page.sourceIntegrity.checkedAt===page.checkedAt);
  check('textIntegrity',()=>typeof page.extraction?.text==='string'&&!page.extraction.textTruncated&&o.proof?.textSha256===digestText(page.extraction.text)&&o.proof.checkedAt===page.checkedAt);
  check('quoteBinding',()=>typeof o.quote==='string'&&o.quote.length>0&&o.quote.length<=600&&page.extraction?.text?.includes(o.quote));
  check('marketDeclaration',()=>typeof marketName==='string'&&!!marketName.trim()&&norm(page.extraction?.text??'').includes(marketName));
  check('providerTitle',()=>norm(page.extraction?.title??'').includes(task.serviceName));
  check('concretePriceProposal',()=>!!o.value&&typeof o.value==='object'&&typeof o.value.amount==='string');
  let semanticMissing=[];
  try{semanticMissing=[...new Set(verifyProviderSemantics({task,pages:providerSemanticEvidence,at,previous:providerSemanticKnowledge}).flatMap(s=>s.missing))].sort();}catch{semanticMissing=['SEMANTIC_SOURCE_VALIDATION_FAILED'];}
  let structured='NOT_ESTABLISHED';try{structuredPrice(task,page,at,providerSemanticEvidence,providerSemanticKnowledge);structured='ESTABLISHED';}catch{}
  return {version:'PRICE_PROOF_DIAGNOSTIC_V1',dimensions:dims,structuredProof:structured,semanticMissing,
    missing:Object.entries(dims).filter(([,v])=>v!=='ESTABLISHED').map(([k])=>k),
    limitation:'Diagnostics are planning-only. Missing prose dimensions do not reject an otherwise valid structured proof. No parser value or transport country is proof.'};
}
/**
 * V1 accepts explicit complete declarations, not keyword co-occurrence. The narrow
 * English forms are deliberately documented. Unsupported narrative remains pending;
 * a model may suggest a value, but cannot supply a new rule or a verified status.
 * marketName is supplied from the existing market source by the retained adapter.
 */
export function verifyClaim({task, page, observation:o, at, marketName, providerHosts=[],proofForms=[],destinationObservations=[],providerSemanticEvidence=[],providerSemanticKnowledge=[],priceProofDiagnostics=false,semanticPricePolicy=null}) {
  validateProofForms(proofForms);
  const rejected = reason => ({version:claimPolicyVersion, accepted:false, reason,...(priceProofDiagnostics&&o.fact==='prices'?{diagnostics:diagnosePriceProof({task,page,observation:o,at,marketName,providerSemanticEvidence,providerSemanticKnowledge})}:{})});
  if(o.proof?.form===officialLocalPriceForm)return proofForms.includes(officialLocalPriceForm)?verifyLocalPrice(task,page,o,at,marketName,semanticPricePolicy):rejected('OFFICIAL_LOCAL_PROOF_NOT_ENABLED');
  if(o.proof?.form===structuredPriceForm){
    if(!proofForms.includes(structuredPriceForm))return rejected('STRUCTURED_PROOF_NOT_ENABLED');
    try{
      assert(['prices','availability','startWeb','cancelWeb'].includes(o.fact));if(o.fact==='availability')assert(page.rawSource.contentType==='text/html');
      const lifecycle=['startWeb','cancelWeb'].includes(o.fact);
      const p=lifecycle?googleLifecycle(task,page,at,providerSemanticEvidence,providerSemanticKnowledge):structuredPrice(task,page,at,providerSemanticEvidence,providerSemanticKnowledge);
      if(lifecycle)assert.equal(o.fact,p.fact);
      assert.deepEqual(o.value,o.fact==='availability'?'AVAILABLE':p.value);assert.equal(o.countryCode,task.countryCode);assert.equal(o.quote,p.quote);
      assert.equal(o.proof.rawSha256,p.ref.sha256);assert.equal(o.proof.textSha256,digestText(page.extraction.text));assert.equal(o.proof.checkedAt,page.checkedAt);
      assert.equal(o.proof.semanticFingerprint,p.semantic.fingerprint);
      return {version:claimPolicyVersion,accepted:true,status:'VERIFIED',reason:structuredPriceForm,acceptedValue:o.value,sourceUrl:page.url,checkedAt:page.checkedAt,quote:p.quote,
        textSha256:o.proof.textSha256,rawSha256:p.ref.sha256,semanticFingerprint:p.semantic.fingerprint,supportingSources:p.semantic.evidence};
    }catch{return rejected('STRUCTURED_SEMANTICS_OR_SOURCE_NOT_ESTABLISHED');}
  }
  try {
    timestamp(at);timestamp(page.checkedAt);
    assert(Date.parse(at)>=Date.parse(page.checkedAt));
    assert(Date.parse(at)-Date.parse(page.checkedAt)<30*86400000);
    assert(page.outcome==='OK' && page.targetCountry===task.countryCode && o.countryCode===task.countryCode);
    assert(['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(page.sourceType));
    const u=https(page.url), a=page.authority;
    assert(a?.status==='CONFIGURED_REVIEWED' && a.hostname===u.hostname && a.sourceType===page.sourceType);
    assert(a.provider===task.serviceName); // Existing configured ownership boundary, not a model assertion.
    assert(page.accessDecisions?.length && page.accessDecisions.every(d=>['ALLOWED','NO_ROBOTS_POLICY'].includes(d.decision)));
    const text=page.extraction?.text;
    assert(typeof text==='string' && !page.extraction.textTruncated);
    assert(o.proof?.textSha256===digestText(text) && o.proof.checkedAt===page.checkedAt);
    assert(typeof o.quote==='string' && o.quote.length>0 && o.quote.length<=600 && text.includes(o.quote));
    assert(typeof marketName==='string' && marketName.trim());
    // A requested country, language or currency alone does not establish market scope.
    assert(norm(text).includes(marketName));
    assert(norm(page.extraction.title).includes(task.serviceName));
  } catch {return rejected('PROVENANCE_OR_FRESHNESS_NOT_ESTABLISHED');}
  const q=norm(o.quote), name=task.serviceName, country=marketName, v=o.value;
  let rule=null;
  let offeringProof=null;
  let destinationProof=null;
  if(o.fact==='startWeb'&&proofForms.includes(documentedStartForm)&&page.extraction.text.split(/\n+/u).some(line=>exact(line,o.quote))){
    const text=documentedInstruction(o.quote);
    if(text)for(const a of destinationObservations){const b=bindDocumentedDestination(task,page,text,a,at);if(b&&b.evidencedHttpsDestination.url===v){destinationProof=b;rule=documentedStartForm;break;}}
  }
  const declaration = sentence => {
    if(!exact(q,sentence))return false;
    // Do not approve a quoted substring of a negation, example or conditional clause.
    return page.extraction.text.split(/\n+/u).some(line=>exact(line,sentence));
  };
  if(o.fact==='identity' && v===name &&
      (declaration(`The service is ${name}.`) || (page.extraction.metadata?.['og:site_name']===name &&
        (q===name||q.startsWith(name+' '))))) rule='OFFICIAL_BRAND_IDENTITY';
  if(o.fact==='availability' && v==='AVAILABLE' && declaration(`${name} subscriptions are available in ${country}.`)) rule='EXPLICIT_MARKET_OFFERING';
  if(o.fact==='availability'&&v==='AVAILABLE'&&proofForms.includes(localizedOfferForm)){
    const offering=localizedOfferingProof(task,page,country);
    if(offering&&o.quote===offering.quote){rule=localizedOfferForm;offeringProof=offering;}
  }
  if(o.fact==='pauseWeb' && v===null && declaration(`${name} does not offer subscription pausing.`)) rule='EXPLICIT_PAUSE_NOT_OFFERED';
  if(['cancelWeb','manageWeb'].includes(o.fact)&&typeof v==='string'&&documentedAccountCancellation(task,page,country)){
    try{
      assert([page.authority.hostname,...providerHosts].includes(https(v).hostname));
      const label=o.fact==='cancelWeb'?'account page':'Manage your plan';
      if(page.extraction.links.some(l=>l.url===v&&l.label===label)&&
        (o.fact==='cancelWeb'?accountCancellation.test(q):q===managementStep))rule='DOCUMENTED_ACCOUNT_CANCELLATION_COMPLETION';
    }catch{/* No invented or unsafe destination. */}
  }
  const actions={startWeb:'Start',manageWeb:'Manage',pauseWeb:'Pause',cancelWeb:'Cancel'};
  if(actions[o.fact] && typeof v==='string') {
    try {
      assert([page.authority.hostname,...providerHosts].includes(https(v).hostname));
      const observed=page.extraction.links.some(l=>l.url===v);
      const sentence=`${actions[o.fact]} your ${name} subscription online at ${v}.`;
      // Completion is required for START/CANCEL; an account/homepage link is insufficient.
      const completion=o.fact==='startWeb'?' Subscription signup and recurring payment setup complete on this website.'
        :o.fact==='cancelWeb'?' Cancellation completes on this website.':'';
      if(observed && declaration(sentence+completion))rule=`EXPLICIT_${o.fact.toUpperCase()}_COMPLETION`;
    } catch { /* An unobserved/unsafe URL cannot become a flow. */ }
  }
  if(['prices','plans','billingRoutes'].includes(o.fact) && v) {
    // Exact ISO currency and decimal major units; no FX/symbol inference or plan renaming.
    // All economic fields must be in the SAME complete declaration, not scattered tokens.
    const m=q.match(offerPattern);
    if(m && declaration(q) && m[1]===name && m[6]===name && m[7]===country) {
      const [, ,plan,currency,amount,period]=m;
      const cadence=period==='month'?'MONTH':'YEAR', description=period==='month'?'Monthly':'Yearly';
      if(o.fact==='prices' && v.plan===plan && v.currency===currency && v.amount===amount && v.cadence===cadence &&
          v.cadenceDescription===description && v.billingRoute==='DIRECT' && v.billingProvider===name &&
          v.offerType==='ORDINARY_RECURRING' && v.taxTreatment==='UNKNOWN')rule='EXPLICIT_ORDINARY_DIRECT_OFFER';
      if(o.fact==='plans' && v.name===plan && v.cadence===cadence && v.cadenceDescription===description &&
          v.billingRoute==='DIRECT' && v.offering==='CURRENT')rule='EXPLICIT_PLAN_OFFER';
      if(o.fact==='billingRoutes' && v.channel==='DIRECT' && v.provider===name && v.url===null)rule='EXPLICIT_DIRECT_BILLER';
    }
  }
  if(!rule)return rejected('UNSUPPORTED_OR_INCOMPLETE_CLAIM_PROOF');
  return {version:claimPolicyVersion,accepted:true,reason:rule,
    status:rule==='EXPLICIT_PAUSE_NOT_OFFERED'?'VERIFIED_NEGATIVE':'VERIFIED',
    ...(o.fact==='prices'?{acceptedValue:{...v,taxNote:null}}:{}),
    ...(offeringProof?{offeringProof}:{}),
    ...(destinationProof?{destinationProof}:{}),
    textSha256:o.proof.textSha256,checkedAt:page.checkedAt,sourceUrl:page.url,quote:o.quote};
}

/** Stable IDs describe the problem, not an attempt/date. No notification transport. */
export const claimIssueId=(item,fact)=>`claim-${digestText(JSON.stringify([item.id,item.countryCode,fact])).slice(0,24)}`;

/**
 * Trusted controller supplies resolution history, never source/model content. An omitted
 * path is NOT exhaustion. No sender/scheduler is implemented here. Existing executor
 * stages and revalidation are the only pending work types; geo needs an existing gap.
 */
export function evaluateClaimResolution(item,result,history={}) {
  validateItem(item);
  const issues=[];
  for(const fact of requiredClaims) {
    const conflict=item.conflicts.some(c=>c.resolutionStatus==='OPEN'&&c.facts.includes(fact));
    const finding=item.facts[fact];
    const resolved=!conflict&&finding?.status==='VERIFIED'&&(fact!=='availability'||finding.value==='AVAILABLE');
    const paths=['PUBLIC_SEARCH','OFFICIAL_PAGES','LOCALIZED_URL','LOCAL_LANGUAGE_SEARCH','SUPPORT','REVALIDATE'];
    if(conflict)paths.push('CONFLICT_RECONCILIATION');
    if(result.escalations.some(e=>e.evidenceGap===fact))paths.push('GEO_RESEARCH_REQUIRED');
    const records=history[fact]?.paths??{};
    const pending=paths.filter(path=>{
      const r=records[path];
      if(path==='REVALIDATE'&&(result.stoppedByLimits.length||result.attempts.some(a=>['FAILED_OR_INVALID','INVALID_PAGE'].includes(a.outcome))))return true;
      // Completion needs retained attempts/evidence references, not an exhaustion boolean.
      const refs=new Set([...result.attempts.map(a=>a.id),...item.evidence.map(e=>e.id)]);
      return !r || !['EXHAUSTED','NOT_APPLICABLE'].includes(r.state) || typeof r.reason!=='string'||!r.reason.trim() ||
        !Array.isArray(r.references)||!r.references.length||!r.references.every(id=>refs.has(id));
    });
    const meaningful=history[fact]?.humanAction;
    const human=!resolved&&!pending.length&&typeof meaningful==='string'&&meaningful.trim().length>0;
    issues.push({id:claimIssueId(item,fact),fact,required:true,
      status:resolved?'RESOLVED':human?'NEEDS_HUMAN_REVIEW':pending.length?'AUTO_RETRY_PENDING':'UNKNOWN',
      notify:human,reason:resolved?'REQUIRED_CLAIM_VERIFIED':conflict?'UNRESOLVED_REQUIRED_CONFLICT':'REQUIRED_CLAIM_NOT_VERIFIED',
      pending:resolved?[]:pending,humanAction:human?meaningful:null,
      resolutionHistory:structuredClone(records)});
  }
  // Suppress service-level attention while another blocking claim still has machine work.
  if(issues.some(i=>i.pending.length))for(const i of issues)if(i.notify){i.notify=false;i.status='AUTO_RETRY_PENDING';i.humanAction=null;}
  const integrationReady=issues.every(i=>i.status==='RESOLVED');
  const needsHuman=issues.some(i=>i.notify);
  return {version:claimPolicyVersion,integrationReady,issues,
    researchStatus:integrationReady?'INTEGRATION_READY':needsHuman?'REVIEW_REQUIRED':issues.some(i=>i.pending.length)?'AUTO_RETRY_PENDING':'UNKNOWN',
    reviewStatus:needsHuman?'NEEDS_HUMAN_REVIEW':integrationReady?'NOT_REQUIRED':'PENDING_RESEARCH',
    optionalUnresolved:[...Object.entries(item.facts).filter(([f,v])=>!requiredClaims.includes(f)&&!v.status.startsWith('VERIFIED')).map(([f])=>f),
      ...['plans','prices','billingRoutes','identityRelations'].filter(f=>!item[f].length||item[f].some(v=>!v.status.startsWith('VERIFIED')))]};
}
