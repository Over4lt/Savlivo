import {billingCadence} from './cadence-family.mjs';
import {bindRecurringSkus} from './recurring-sku-binding.mjs';
import {bindNestedOptions} from './nested-option-binding.mjs';
// Experimental source-first analysis only. Never imported by production.
import '../offline-replay/offline-guard.mjs';
import {bindStructuredPlans} from './structured-plan-binding.mjs';
import {materializeStructured} from './structured-materialization.mjs';
import {createHash} from 'node:crypto';
import {annotateHTML,structuredMarkets} from './attribution.mjs';
import {preserveQualifiers,qualifierSafety} from './qualifiers.mjs';
export const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
export const normalizeText=x=>String(x??'').replace(/\s+/gu,' ').trim();
export function decode(x){return x.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp|euro|pound|yen);/gi,(a,k)=>k[0]==='#'?String.fromCodePoint(Math.min(0x10ffff,k[1].toLowerCase()==='x'?parseInt(k.slice(2),16):+k.slice(1))):({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',euro:'€',pound:'£',yen:'¥'}[k.toLowerCase()]??a));}
const codes='USD EUR GBP CHF NOK DKK SEK PLN RON CZK HUF TRY ZAR VND INR IDR MYR SGD AUD CAD NZD HKD TWD JPY KRW CNY BRL MXN CLP COP PEN ARS EGP SAR QAR AED ILS THB PHP ISK BGN RUB UAH NGN KES PKR'.split(' ');
const token=`(?:${codes.join('|')}|Euro|US\\$|CA\\$|AU\\$|NZ\\$|R\\$|S\\$|HK\\$|NT\\$|€|£|₹|₫|₩|₺|₱|₪|L\\.E\\.?|円|¥|\\$|kr\\.?|zł|lei|Kč|Ft|฿)`;
const number='[0-9]+(?:[.,\u00a0\u202f \'’][0-9]+)*';
const moneyRE=new RegExp(`(?<![\\p{L}])(${token})(?![\\p{L}])\\s*(${number})|(${number})\\s*(${token})(?![\\p{L}])`,'giu');
const symbol={ 'Euro':'EUR','euro':'EUR','L.E':'EGP','L.E.':'EGP','円':'JPY','€':'EUR','£':'GBP','₹':'INR','₫':'VND','₩':'KRW','₺':'TRY','₱':'PHP','₪':'ILS','฿':'THB','zł':'PLN','lei':'RON','Kč':'CZK','Ft':'HUF','R$':'BRL','US$':'USD','CA$':'CAD','AU$':'AUD','NZ$':'NZD','S$':'SGD','HK$':'HKD','NT$':'TWD'};
export function amount(raw){
 if(typeof raw==='number')return Number.isFinite(raw)&&raw>=0&&/^\d+(?:\.\d+)?$/.test(String(raw))?String(raw):null;
 let s=String(raw).trim();if(!/^\d[\d.,\s'’]*$/.test(s))return null;
 // A separator is either a consistent thousands group or the one decimal mark.
 // Never erase separators first: two adjacent amounts would become a new number.
 const last=s.match(/([.,])(\d{1,2})$/),decimal=last?.[1],fraction=last?.[2]??'';
 let integer=last?s.slice(0,last.index):s;
 const grouping=integer.match(/[^\d]/g)??[];
 if(grouping.length){const sep=grouping[0];if(sep===decimal||grouping.some(x=>x!==sep)||!new RegExp('^\\d{1,3}(?:'+(sep==='.'?'\\.':sep)+ '\\d{3})+$').test(integer))return null;integer=integer.split(sep).join('');}
 if(!/^\d+$/.test(integer))return null;
 const normalizedFraction=fraction.replace(/0+$/,'');return (integer.replace(/^0+(?=\d)/,'')||'0')+(normalizedFraction?'.'+normalizedFraction:'');
}
export function monetary(text){const matches=[...text.matchAll(moneyRE)];for(const m of text.matchAll(/([0-9]+(?:[,][0-9]{3})*)円/gu)){if(!matches.some(x=>x.index===m.index))matches.push(Object.assign([m[0],undefined,undefined,m[1],'円'],{index:m.index}));}return matches.sort((a,b)=>a.index-b.index).map(m=>{const count=m[2]?.match(/\s+([1-9]\d?)$/u);if(count&&/^\s*[x×]\s*(?:monthly|months?|weeks?|days?|users?|seats?)\b/iu.test(text.slice(m.index+m[0].length))){m[2]=m[2].slice(0,count.index);m[0]=m[0].slice(0,m[0].length-count[0].length);}return m;}).filter(m=>{if(m[3]&&/\d\s*[.,]\s*$/.test(text.slice(0,m.index)))return false;if(m[2]&&/^\s*[.,]\s*\d/.test(text.slice(m.index+m[0].length)))return false;const t=m[1]??m[4];return !codes.includes(t.toUpperCase())||t===t.toUpperCase();}).map(m=>({raw:m[0],number:m[2]??m[3],currencyRaw:m[1]??m[4],start:m.index,end:m.index+m[0].length,amount:amount(m[2]??m[3])}));}
function currency(t,context){if(codes.includes(t.toUpperCase()))return t.toUpperCase();if(symbol[t])return symbol[t];const found=[...new Set(context.match(new RegExp(`\\b(?:${codes.join('|')})\\b`,'g'))??[])];return found.length===1?found[0]:null;}
const voids=new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const skip=new Set(['script','style','svg','noscript','template']);
// A non-executing lexical tree with source coordinates. Malformed structure is
// recorded and never eligible for L4. No CSS, script or external resource loads.
function isHidden(n){for(let a=n;a;a=a.parent)if(a.attrs?.['aria-hidden']==='true'||Object.hasOwn(a.attrs??{},'hidden')||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(a.attrs?.style??''))return true;return false;}
export function htmlTree(body){const root={tag:'root',start:0,end:body.length,children:[],parent:null,attrs:{},index:0};let stack=[root],nodes=[root],malformed=false;
 const re=/<!--[\s\S]*?-->|<![^>]*>|<\/?[A-Za-z][^>]*>|[^<]+|</g;let m;
 while((m=re.exec(body))){const t=m[0],p=stack.at(-1);if(t.startsWith('<!--')||t.startsWith('<!'))continue;
  if(t.startsWith('</')){const tag=t.match(/^<\/\s*([\w:-]+)/)?.[1].toLowerCase();let i=stack.length-1;while(i>0&&stack[i].tag!==tag)i--;if(!i){malformed=true;continue;}while(stack.length>i){const n=stack.pop();n.end=re.lastIndex;}continue;}
  if(t.startsWith('<')&&t.length>1){const tag=t.match(/^<([\w:-]+)/)?.[1].toLowerCase();if(!tag)continue;const attrs={};for(const a of t.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attrs[a[1].toLowerCase()]=decode(a[2]??a[3]??a[4]);if(/\shidden(?:\s|=|>)/i.test(t))attrs.hidden??='';const n={tag,attrs,start:m.index,openEnd:re.lastIndex,end:re.lastIndex,children:[],parent:p,index:p.children.length};p.children.push(n);nodes.push(n);
   if(skip.has(tag)){const close=new RegExp(`<\\/${tag}\\s*>`,'gi');close.lastIndex=re.lastIndex;const c=close.exec(body);n.raw=body.slice(re.lastIndex,c?.index??body.length);n.end=c?close.lastIndex:body.length;re.lastIndex=n.end;continue;}
   if(!voids.has(tag)&&!t.endsWith('/>'))stack.push(n);continue;}
  const n={tag:'#text',start:m.index,end:re.lastIndex,text:decode(t),children:[],parent:p,index:p.children.length};p.children.push(n);nodes.push(n);
 }
 while(stack.length>1){stack.pop().end=body.length;malformed=true;}
 for(const n of [...nodes].reverse()){n.text=n.tag==='#text'?n.text:skip.has(n.tag)?'':n.tag==='img'&&n.attrs.alt&&!isHidden(n)?normalizeText(n.attrs.alt):normalizeText(n.children.map(c=>c.text).join(' '));n.headings=/^h[1-6]$/.test(n.tag)?[n]:n.children.flatMap(c=>c.headings??[]);}
 return {root,nodes,malformed};}
const pathOf=n=>n.parent?pathOf(n.parent)+'/'+n.tag+'['+n.index+']':'$';
const genericLabel=/^(?:premium|pricing|prices?|plans?(?: and pricing)?|monthly|annual(?: only)?|yearly|\d+\s*(?:members?|months?|days?|GB|TB)|subscribe|choose your plan)$/i;
function label(n){const text=normalizeText(n?.text);return text&&/\p{L}/u.test(text)&&text.length<100&&text.split(' ').length<=7&&!/[?？;.!]/.test(text)&&!monetary(text).length&&!genericLabel.test(text)&&! /^(?:choose|compare|select|discover|enjoy|faqs?|questions|the (?:ultimate )?home)\b/i.test(text)?text:null;}
function identifiedCard(n){
 if(!n.attrs?.['data-product']||n.text.length>6000)return null;
 const descendants=[];const visit=x=>{for(const child of x.children??[]){descendants.push(child);visit(child);}};visit(n);
 if(descendants.some(x=>x.attrs?.['data-product']))return null;
 const labels=descendants.filter(x=>/(?:^|\s)plan-(?:name|title|info)(?:\s|$)/.test(x.attrs?.class??'')&&x.text.length<100&&!monetary(x.text).length);
 if(labels.length!==1||!labels[0].text||!monetary(n.text).length)return null;
 // This binding repairs an explicit ordinary monthly renewal card only. A
 // monthly-equivalent display on a long-term card must not acquire ownership.
 const money=monetary(n.text);
 if(new Set(money.map(m=>m.amount)).size!==1||!/\b(?:autorenews?|auto renews?|renews?|automatically renews?)\s+at\s+.{1,45}\bmonthly\b/i.test(n.text)||/\b(?:year|years|annual|annually|trial|introductory|first|prepaid|gift|bundle|add-on|from|starting at|starts at|discount|sale)\b/i.test(n.text))return null;
 return {name:labels[0].text,node:n,method:'IDENTIFIED_PRODUCT_CARD',strong:true,nameNode:labels[0],currency:n.attrs['data-currency']};
}
// Explicit provider component semantics can name a plan without an h1-h6 tag.
// Never search outside the card, borrow a sibling title, or use a CTA as title.
function semanticPlanCard(n){
 const marker=n.attrs?.['data-testid'];
 if(!/^(?:payment-)?plan-card$/.test(marker??'')||isHidden(n)||n.text.length>6000)return null;
 const descendants=[];const visit=x=>{for(const c of x.children){descendants.push(c);visit(c);}};visit(n);
 if(descendants.some(c=>/^(?:payment-)?plan-card$/.test(c.attrs?.['data-testid']??'')))return null;
 const titles=descendants.filter(c=>c.attrs?.role==='heading'||/^(?:payment-)?plan-card(?:__|-)title$/.test(c.attrs?.['data-testid']??''));
 if(titles.length!==1||isHidden(titles[0]))return null;
 const name=normalizeText(titles[0].text);
 if(!name||name.length>100||!/[\p{L}]/u.test(name)||monetary(name).length||/[?;!]/.test(name)||/\b(?:trial|gratis|free|join|subscribe|offer|promotion)\b/i.test(name))return null;
 if(!descendants.some(c=>['a','button'].includes(c.tag))||!monetary(n.text).length)return null;
 return {name,node:n,nameNode:titles[0],method:'EXPLICIT_SEMANTIC_PLAN_CARD',strong:true};
}
function owner(node){let n=node;for(let depth=0;n&&depth<12;depth++,n=n.parent){
  const semanticCard=semanticPlanCard(n);if(semanticCard)return semanticCard;
  const card=identifiedCard(n);if(card)return card;
  if(['li','tr'].includes(n.tag)){const first=n.children.find(c=>c.tag!=='#text');const bold=n.children.flatMap(c=>[c,...c.children,...c.children.flatMap(x=>x.children)]).find(c=>['b','strong','th'].includes(c.tag)||/font-weight:\s*(?:bold|[6-9]00)/.test(c.attrs?.style??''));const prefix=n.text.split(':')[0];const candidate=label(bold)||label(first)||(prefix.length<100&&prefix!==n.text&&!monetary(prefix).length&&!genericLabel.test(prefix)?prefix:null);if(candidate&&!/https?:/.test(candidate))return {name:candidate,node:n,method:n.tag==='tr'?'TABLE_ROW':'LIST_ITEM',strong:true};}
  const hs=n.headings??[];if(hs.length>1){const good=hs.filter(h=>label(h));if(good.length===1&&hs.every(h=>!label(h)||h===good[0]))return {name:label(good[0]),node:n,method:'HEADING_CONTAINER',strong:true};return {name:null,node:n,method:'MULTIPLE_HEADINGS',strong:false,cross:true};}
  if(hs.length===1&&label(hs[0])&&n.text.length<6000)return {name:label(hs[0]),node:n,method:'HEADING_CONTAINER',strong:true};
  if(['section','article','main','body'].includes(n.tag)&&depth>0)break;
 }return {name:null,node:node.parent??node,method:'UNRESOLVED',strong:false};}
export function semantics(text,local,original=false){const periods=[];if(/\b(?:month(?:ly)?|mo|monat|mensuel|mensual|mensal|maand|mese|miesiąc|måned|månad)|μήν|tháng|เดือน|月|شهري/iu.test(local))periods.push('MONTH');if(/\b(?:year(?:ly)?|annual(?:ly)?|annuel|anual|jahr|año|jaar|anno|år)\b|έτος|năm|年/iu.test(local))periods.push('YEAR');
 const promo=/trial|introduct|promo|offer|offerta|essai|prøve|gratis|free for|για \d|για τις|offre|för \d|za darmo/i.test(local)?'PROMOTION_OR_TRIAL':null;
 const patterns=[['PER_PERSON',/per (?:person|member)|\/person|pro (?:person|mitglied)/i],['MONTHLY_EQUIVALENT',/equivalent|billed annually|billed yearly|per month.*annual|month.*billed.*year/i],['BILLED_ANNUALLY',/billed annually|billed yearly|annual billing/i],['FROM',/\bfrom\b|\bstart(?:s|ing)?\s+at\b|ab |à partir|desde|vanaf/i],['TAX',/tax|VAT|TVA|MwSt/i],['STUDENT',/student|étudiant|studier|φοιτητ/i],['AFTER_INTRO',/thereafter|then|after|ensuite|danach|στη συνέχεια|και μετά/i]];
 // Locative device/work and location clauses do not modify a price. Preserve
 // every other from/starts-at signal, including another one in the same clause.
 const priceQualifierText=local.replace(/\bwork(?:s|ing)?\s+from\s+(?:their|your|our|my|his|her)\s+(?:phones?|devices?|computers?)\b|\bfrom\s+wherever\s+you\s+are\b/giu,' ');
 const qualifiers=patterns.filter(([id,re])=>re.test(id==='FROM'?priceQualifierText:local)).map(([id])=>id);if(/^(?:save|saving|savings|économisez|spare|ahorra|economize)\b/i.test(local))qualifiers.push('SAVINGS_AMOUNT_NOT_CHARGE');if(/extra members?|additional members?/i.test(local))qualifiers.push('EXTRA_MEMBER_ADD_ON');if(/\beach\b|per member/i.test(local))qualifiers.push('PER_MEMBER');if(original)qualifiers.push('REFERENCE_PRICE');const duration=local.match(/\b\d+\s*(?:months?|days?|weeks?|years?|Monate?|mois|μήνες|måneder)\b/iu)?.[0]??null;if(duration)qualifiers.push('EXPLICIT_DURATION:'+duration);
 const cadence=billingCadence(local);return {billingInterval:cadence.interval,cadenceFamily:cadence.interval?.cadenceFamily??null,billingPeriod:periods.length===1?periods[0]:cadence.interval?.normalized??null,billingPeriodAmbiguous:periods.length>1||cadence.ambiguous,qualifier:qualifiers,promotionOrTrial:original?'REFERENCE_PRICE':promo,qualifierAmbiguous:periods.length>1||(/\b(?:free|trial|offer|promo)\b/i.test(text)&&!promo&&!original),commercialContext:local};}
// A terminated provider declaration binds its own named subscription and amount.
// This is a grammatical identity/price relationship, not page-title inference.
function billingTableCell(n,m){
 let cell=n;while(cell&&!['td','th'].includes(cell.tag))cell=cell.parent;
 if(!cell||isHidden(cell))return null;const row=cell.parent;if(row?.tag!=='tr')return null;
 let table=row;while(table&&table.tag!=='table')table=table.parent;if(!table)return null;
 const rows=[];const walk=x=>{if(x!==table&&x.tag==='table')return;if(x.tag==='tr')rows.push(x);else for(const ch of x.children)walk(ch);};walk(table);
 if(rows.length<2||rows.length>32)return null;const cells=x=>x.children.filter(c=>['td','th'].includes(c.tag));const headers=cells(rows[0]),current=cells(row),index=current.indexOf(cell);
 if(headers.length<2||headers.length>8||current.length!==headers.length||index<1||row===rows[0])return null;
 if(!/^(?:plan|plan name|subscription|bundle category|product|tier)$/i.test(headers[0].text))return null;
 if(rows.some(r=>cells(r).some(c=>c.attrs.colspan||c.attrs.rowspan)))return null;
 const period=/^(?:monthly|per month)$/i.test(headers[index].text)?'MONTH':/^(?:yearly|annual|annually|per year)$/i.test(headers[index].text)?'YEAR':null;
 const plan=label(current[0]);if(!plan||!period||monetary(current[0].text).length)return null;
 const ms=monetary(cell.text);if(ms.length!==1||ms[0].amount!==m.amount||ms[0].currencyRaw!==m.currencyRaw)return null;
 return {plan,period,raw:normalizeText([plan,headers[index].text,cell.text,...table.children.filter(x=>x.tag==='caption').map(x=>x.text)].join(' ')),node:cell,tablePath:pathOf(table),planPath:pathOf(current[0]),billingPath:pathOf(headers[index]),pricePath:pathOf(cell),basis:'BOUNDED_PLAN_ROW_BILLING_COLUMN'};
}
// A labelled fee belongs to the immediately preceding peer plan section.
// No hierarchy-wide heading search, and no borrowing a channel/points amount.
function labelledSectionFee(n,m){
 if(n.tag!=='p'||isHidden(n)||!/^＜\s*月額利用料\s*＞/.test(n.text))return null;
 const ms=monetary(n.text);if(ms.length!==1||ms[0].amount!==m.amount||ms[0].currencyRaw!==m.currencyRaw)return null;
 const peers=n.parent?.children??[],i=peers.indexOf(n);let h=i-1;while(h>=0&&!/^h[1-6]$/.test(peers[h].tag))h--;
 if(h<0)return null;let end=i+1;while(end<peers.length&&!/^h[1-6]$/.test(peers[end].tag))end++;
 const region=peers.slice(h,end);if(region.length>32||region.some(x=>isHidden(x)))return null;
 const plan=label({text:peers[h].text.replace(/^[■●・]\s*/, '')}),raw=normalizeText(region.map(x=>x.text).join(' '));
 if(!plan||raw.length>3000||!region.some(x=>/サービスプランです。/.test(x.text)))return null;
 // Closed/restricted enrolment needs an independently resolved applicability claim.
 if(/新規受付を終了|特定の窓口からのみ|解約後の再開はできません/.test(raw))return null;
 return {plan,raw:normalizeText(plan+' '+n.text),context:raw,node:n,headingPath:pathOf(peers[h]),pricePath:pathOf(n),span:[peers[h].start,region.at(-1).end],basis:'BOUNDED_PLAN_SECTION_LABELLED_MONTHLY_FEE'};
}
// A complete named-plan heading owns its own price, never a sibling's amount.
// Deliberately closed grammar; other presentations keep their existing path.
function namedPlanHeading(n,m){
 if(!/^h[2-6]$/.test(n.tag)||isHidden(n)||n.text.length>240)return null;
 const match=n.text.match(/^(?:Plan|Subscription plan)\s+(.{1,70}?)\s*[–—:]\s*(.+?)\s*\/\s*(?:month|mes|mês|monat)\.?$/iu);
 if(!match)return null;
 const plan=normalizeText(match[1]);
 if(!label({text:plan})||/[+&/]|\b(?:plan|and|or|y|o|bundle|upgrade|add.on|extra|offer|promo|trial|from|desde)\b/iu.test(plan))return null;
 const ms=monetary(match[2]);if(ms.length!==1||ms[0].amount!==m.amount||ms[0].currencyRaw!==m.currencyRaw)return null;
 // Apart from a matching explicit currency code, the amount has no modifiers.
 const rest=normalizeText(match[2].slice(0,ms[0].start)+' '+match[2].slice(ms[0].end));
 const cur=currency(m.currencyRaw,match[2]);
 if(!cur||rest&&(!codes.includes(rest)||rest!==cur))return null;
 const peers=n.parent?.children??[],index=peers.indexOf(n),region=[n];
 for(let i=index+1;i<peers.length&&!/^h[1-6]$/.test(peers[i].tag);i++){region.push(peers[i]);if(region.length>24)return null;}
 const context=normalizeText((n.parent?.headings.length===1?n.parent.text:region.map(x=>x.text).join(' '))??'');
 if(context.length>4000)return null;
 if([...context.matchAll(/\b(?:Plan|Subscription plan)\s+[\p{Lu}\d]/gu)].length>1)return null;
 if(monetary(context).some(x=>x.amount!==m.amount||currency(x.currencyRaw,context)!==cur))return null;
 if(/\b(?:intro|trial|promo\w*|offer|oferta|from|desde|bundle|upgrade|add.on|prepaid|one.time|annual\w*|year\w*|anual|primer\w*|limited|equivalent|first|fixed)\b|\b(?:for|por)\s+(?:one|un|1)\s+(?:month|mes)\b/iu.test(context))return null;
 for(let a=n.parent;a&&a.tag!=='body';a=a.parent)if(a.attrs?.['data-campaign-id'])return null;
 return {plan,raw:n.text,offset:0,basis:'BOUNDED_NAMED_PLAN_MONTHLY_PRICE_HEADING',scopePath:pathOf(n),scopeSpan:[n.start,n.end]};
}
function subscriptionDeclaration(text,m){
 // An explicit grammatical named-membership offer is stronger than a generic
 // FAQ heading. One amount in the paragraph; preserve its full restrictions.
 const named=text.match(/\bour ([A-Z][\p{L}\p{N} -]{1,60} (?:Membership|Subscription|Plan)) at ([^.!?]{1,45}?per month)\b/u);
 if(named&&text.length<=1500&&monetary(text).length===1&&!/\b(?:comparison|compare|competitor|previous|formerly|was|annual|yearly|trial|introductory|promo\w*|prepaid|fixed|minimum|first\s+\d)\b/iu.test(text)){
  const ms=monetary(named[2]);if(ms.length===1&&ms[0].amount===m.amount&&ms[0].currencyRaw===m.currencyRaw&&label({text:named[1]}))return {plan:named[1],raw:text,offset:0,basis:'EXPLICIT_NAMED_MEMBERSHIP_PRICE_DECLARATION'};
 }

 // A terminated post-trial renewal clause owns its monthly branch. The
 // alternative yearly branch remains a separate, nonmonthly observation.
 const renewal=text.match(/Once your free trial ends, and providing you have not cancelled in the meantime, (your (.{1,60}?) subscription continues at ([^!?]{1,40}?\/month)) or ([^!?]{1,40}?\/year)\./u);
 if(renewal&&text.length<=1500&&monetary(text).length===2&&!/\b(?:discount|promo\w*|limited|bundle|add.on|upgrade|prepaid)\b/i.test(text)&&label({text:renewal[2]})&&!/\b(?:from|starting|bundle|add.on|upgrade|discount|promo\w*|first|fixed|prepaid|non.?renew\w*)\b/i.test(renewal[1])){
  const monthly=monetary(renewal[1]),annual=monetary(renewal[4]);
  if(monthly.length===1&&annual.length===1&&monthly[0].amount===m.amount&&monthly[0].currencyRaw===m.currencyRaw&&monthly[0].currencyRaw===annual[0].currencyRaw&&text.indexOf(renewal[0])===text.lastIndexOf(renewal[0]))return {plan:renewal[2],raw:renewal[1],offset:renewal.index+renewal[0].indexOf(renewal[1]),basis:'EXPLICIT_NAMED_POST_TRIAL_MONTHLY_RENEWAL_BRANCH',relationship:renewal[0]};
 }
 // Localized grammatical fee declaration: plan, monthly billing and amount are
 // co-owned in one bounded sentence. The full paragraph retains restrictions.
 const fee=text.match(/^(?:[0-9]+\.\s*)?Prețul abonamentului (.{1,80}?) lunar,? este în cuantum de /u);
 if(fee&&text.length<=1000&&!/promoțional|promoție|redus|avans|pentru.{0,20}luni|ofertă|prima lună/iu.test(text)){
  const ms=monetary(text),plan=normalizeText(fee[1]);
  if(ms.length===1&&ms[0].amount===m.amount&&ms[0].currencyRaw===m.currencyRaw&&label({text:plan}))return {plan,raw:text,offset:0,basis:'EXPLICIT_NAMED_MONTHLY_SUBSCRIPTION_FEE_DECLARATION'};
 }

 const recurring=text.match(/^Disfruta de (.{1,80}?) por (?:solo )?/u);
 if(recurring&&/con cobros automáticos mensuales/u.test(text)){
  const ms=monetary(text),plan=normalizeText(recurring[1]);
  if(text.length<=1000&&ms.length===1&&ms[0].amount===m.amount&&ms[0].currencyRaw===m.currencyRaw&&label({text:plan}))return {plan,raw:text,offset:0,basis:'EXPLICIT_NAMED_AUTOMATIC_MONTHLY_SUBSCRIPTION_DECLARATION'};
 }

 const tariff=text.match(/^([^.;!?]{1,80}\b(?:Tarif|Paket))\s+für\s+(.+?\bpro Monat)\.?$/u);
 if(tariff){const ms=monetary(tariff[0]),plan=normalizeText(tariff[1]);if(ms.length===1&&ms[0].amount===m.amount&&ms[0].currencyRaw===m.currencyRaw&&label({text:plan}))return {plan,raw:tariff[0],offset:0,basis:'EXPLICIT_NAMED_MONTHLY_TARIFF_DECLARATION'};}
 const matches=[...text.matchAll(/(?:^|[。！？]\s*)([^。！？]{1,80}?)は(?:[^。！？]{1,80}?が提供する)?月額[^。！？]{1,100}?の有料サービスです。/gu)];
 const bound=matches.filter(x=>{const ms=monetary(x[0]);return ms.length===1&&ms[0].amount===m.amount&&ms[0].currencyRaw===m.currencyRaw;});
 if(bound.length!==1)return null;const x=bound[0],plan=normalizeText(x[1]);
 if(!label({text:plan}))return null;return {plan,raw:normalizeText(x[0]),offset:x.index,basis:'EXPLICIT_NAMED_MONTHLY_PAID_SERVICE_DECLARATION'};
}
function base(m,text,owned,local,original=false){const sem=semantics(text,local,original);return {product:owned.name,plan:owned.name,amountRaw:m.raw,amountNormalized:m.amount,currency:currency(m.currencyRaw,local),currencyRaw:m.currencyRaw,...sem,ownershipAmbiguous:!owned.strong,crossCardRisk:!!owned.cross,nonPriceNumericRisk:false,rawEvidenceSnippet:null,normalizedEvidenceSnippet:local,structuralContainer:owned.method,parentHeading:owned.name,siblingLabels:[],structuredPath:null,sourceType:'HTML',discoveryCoordinates:null};}
export function extract(body){if(Buffer.byteLength(body)>4000000)throw Error('SOURCE_BODY_BOUND');const result=[],tree=htmlTree(body);let jsonCount=0;const diagnostics={malformedHtml:tree.malformed,unsupportedScriptPayloads:0,jsonPayloads:0};
 function walkJSON(v,p,parentOwner=null,inheritedCurrency=null,inheritedMarkets=[],parentNamePath=null,materialized=null){if(!v||typeof v!=='object')return;if(++jsonCount>300000)throw Error('STRUCTURED_NODE_BOUND');if(Array.isArray(v)){v.forEach((x,i)=>walkJSON(x,p+'/'+i,parentOwner,inheritedCurrency,inheritedMarkets,parentNamePath,materialized));return;}
  const offerOwned=materialized&&(v['@type']==='Offer'||v['@type']==='https://schema.org/Offer')&&parentOwner;
  const own=offerOwned?parentOwner:typeof(v.name??v.productName??v.planName??v.title)==='string'?(v.name??v.productName??v.planName??v.title):parentOwner;const nameKey=offerOwned?null:['name','productName','planName','title'].find(k=>typeof v[k]==='string');const namePath=nameKey?p+'/'+nameKey:parentNamePath;const cur=v.priceCurrency??v.currency??inheritedCurrency;const ownMarkets=structuredMarkets(v,p);const markets=ownMarkets.length?ownMarkets:inheritedMarkets;
  for(const [k,x]of Object.entries(v)){if(/^(?:price|amount|cost|regularPrice|salePrice|old_price|original_price|price_for_month)$/i.test(k)&&(typeof x==='number'||typeof x==='string')){const am=amount(x);if(am!==null){const raw=JSON.stringify(Object.fromEntries(Object.entries(v).filter(([k,v])=>['name','description','price','amount','cost','priceCurrency','currency','billingPeriod','billingInterval','duration','duration_type','recurring','valueAddedTaxIncluded','regularPrice','salePrice','old_price','original_price','price_for_month'].includes(k)&&typeof v!=='object')));const owned={name:own??null,strong:!!own&&!!label({text:own}),method:'JSON_OBJECT'};const m={raw:String(x),amount:am,currencyRaw:typeof cur==='string'?cur:''};const local=normalizeText([own,v.description,v.billingPeriod,v.billingInterval,v.duration,v.duration_type].filter(x=>x!==undefined).join(' '));const c=base(m,local,owned,local,/old|original|regular/i.test(k));preserveQualifiers(c,{localText:local,ownerText:local,localPath:p,ownerPath:p,ownerStrong:owned.strong});c.marketOwnerEvidence=markets;c.productOwnerEvidence={raw:own,path:namePath,method:'JSON_OBJECT'};c.sourceType='JSON';c.structuredPath=p+'/'+k;c.rawEvidenceSnippet=raw.slice(0,6000);c.snippetRepresentation='RESERIALIZED_RETAINED_FIELDS; ORIGINAL_OBJECT_AT_STRUCTURED_PATH';c.structuredContext={priceField:k,name:own??null,currency:cur??null,billingPeriod:v.billingPeriod??v.billingInterval??null,duration:v.duration??null,durationType:v.duration_type??null,recurring:v.recurring??null};const exactCadence=billingCadence('',c.structuredContext);if(exactCadence.interval&&exactCadence.interval.unit!=='MONTH'){c.billingInterval=exactCadence.interval;c.cadenceFamily=exactCadence.interval.cadenceFamily;c.billingPeriod=exactCadence.interval.normalized;}if(k==='price_for_month'){c.qualifier.push('DERIVED_DISPLAY_FIELD_UNRESOLVED');c.qualifierAmbiguous=true;}if(materialized?.[c.structuredPath])c.materialization=materialized[c.structuredPath];result.push(c);}}
   if(x&&typeof x==='object')walkJSON(x,p+'/'+k.replaceAll('~','~0').replaceAll('/','~1'),own,cur,markets,namePath,materialized);
  }
 }
 function json(raw,p){try{const v=JSON.parse(raw);if(v&&typeof v==='object'){diagnostics.jsonPayloads++;walkJSON(v,p);return true;}}catch{}return false;}
 if(/^[\s]*[\[{]/.test(body))json(body,'$');
 for(const n of tree.nodes.filter(n=>n.tag==='script')){if(!json(n.raw??'',pathOf(n))){diagnostics.unsupportedScriptPayloads++; // Do not eval machine code. Retain monetary literals as weak candidates.
   for(const m of monetary(decode(n.raw??''))){const c=base(m,'', {name:null,strong:false,method:'SCRIPT_LITERAL'},m.raw);c.sourceType='SCRIPT_LITERAL';c.rawEvidenceSnippet=m.raw;c.structuredPath=pathOf(n);result.push(c);}
  }}
 const linkedPlans=bindStructuredPlans(tree,{amount,monetary},hash(body));
 for(const b of linkedPlans.bindings){
  const local=b.name+' '+b.currency+' '+b.raw+' per month';
  const c=base({raw:b.raw,amount:b.value,currencyRaw:b.currency},local,{name:b.name,strong:true,method:'JSON_OBJECT'},local);
  c.sourceType='HTML';c.structuredPath=b.proof.cardPath;c.rawEvidenceSnippet=body.slice(...b.proof.cardSpan).slice(0,6000);c.productOwnerEvidence={raw:b.name,path:b.namePath,method:'JSON_OBJECT',structuredPlanBinding:b.proof};c.marketOwnerEvidence=[];
  c.structuredContext={priceField:'amount',name:b.name,currency:b.currency,billingPeriod:'MONTH',recurring:true};c.structuredPlanBinding=b.proof;
  preserveQualifiers(c,{localText:local,ownerText:local,localPath:b.path,ownerPath:b.proof.objectPath,ownerStrong:true});result.push(c);
 }
 const nested=bindNestedOptions(tree,{monetary},hash(body));
 for(const b of [...nested.bindings,...bindRecurringSkus(tree,{monetary},hash(body)).bindings]){
  const c=base(b.monetary,b.local,{name:b.name,strong:true,method:'JSON_OBJECT'},b.local);
  c.sourceType='JSON';c.structuredPath=b.path;c.rawEvidenceSnippet=JSON.stringify(b.proof.rawSubtitle);c.normalizedEvidenceSnippet=b.local;
  c.productOwnerEvidence={raw:b.name,path:b.proof.namePath,method:'JSON_OBJECT',structuredPlanBinding:b.proof};c.marketOwnerEvidence=[];c.structuredPlanBinding=b.proof;c.materialization=b.materialization;
  c.offerRole={role:b.role,basis:'EXPLICIT_CONTAINED_TEXT_RUN_TRANSITION',evidence:b.proof};
  preserveQualifiers(c,{localText:b.local,ownerText:b.local,localPath:b.path,ownerPath:b.proof.objectPath,ownerStrong:true});result.push(c);
 }
 const materialized=materializeStructured(tree,hash(body));
 diagnostics.structuredMaterialization={...materialized,payloads:materialized.payloads.map(p=>({path:p.path,metadata:p.metadata}))};
 for(const p of materialized.payloads)walkJSON(p.value,p.path,null,null,[],null,p.metadata);
 // Choose the smallest element containing the complete currency/amount expression.
 const cached=new Map(tree.nodes.map(n=>[n,skip.has(n.tag)?[]:monetary(n.text)]));
 for(const n of tree.nodes){if(n.tag==='#text'||skip.has(n.tag)||['root','head','html','body'].includes(n.tag))continue;const ms=cached.get(n);for(const m of ms){if(n.children.some(ch=>ch.tag!=='#text'&&cached.get(ch)?.some(x=>x.raw===m.raw)))continue;
   let owned=owner(n);const declaration=subscriptionDeclaration(n.text,m)??namedPlanHeading(n,m);const tableCell=billingTableCell(n,m);const sectionFee=labelledSectionFee(n,m);const localNode=['li','p','td','th','del','s'].includes(n.tag)?n:(n.parent&&n.parent.text.length<500?n.parent:n);let local=localNode!==n&&monetary(localNode.text).length>ms.length?n.text:localNode.text; // no borrowing qualifiers from adjacent product cards
   // Explicit parenthetical subclauses own their qualifiers. Do not apply an
   // extra-member price in parentheses to the principal price preceding it.
   const open=n.text.lastIndexOf('(',m.start),close=open>=0?n.text.indexOf(')',open):-1;
   if(open>=0&&close>=m.end)local=n.text.slice(open+1,close);
   else {const next=n.text.indexOf('(',m.end);if(next>=0&&monetary(n.text.slice(next)).length)local=n.text.slice(0,next);}
   if(local.length>1500)local=n.text.slice(Math.max(0,m.start-150),m.end+250);
   if(sectionFee){owned={name:sectionFee.plan,node:n,method:sectionFee.basis,strong:true};local=sectionFee.raw;}
   if(tableCell){owned={name:tableCell.plan,node:tableCell.node,method:tableCell.basis,strong:true};local=tableCell.raw;}
   if(declaration){owned={name:declaration.plan,node:n,method:declaration.basis,strong:true};local=declaration.raw;}
   let original=false;for(let a=n;a&&a!==owned.node.parent;a=a.parent)if(['s','del'].includes(a.tag)||/line-through/.test(a.attrs?.style??''))original=true;
   const c=base(m,declaration?.raw??tableCell?.raw??sectionFee?.context??owned.node.text,owned,local,original);if(owned.method==='EXPLICIT_SEMANTIC_PLAN_CARD')c.semanticPlanCardEvidence={bodyHash:hash(body),cardPath:pathOf(owned.node),cardSpan:[owned.node.start,owned.node.end],namePath:pathOf(owned.nameNode),nameSpan:[owned.nameNode.start,owned.nameNode.end],rawName:owned.nameNode.text};if(owned.method==='IDENTIFIED_PRODUCT_CARD'){
    const declared=owned.currency,visible=currency(m.currencyRaw,local),iso=[...new Set(owned.node.text.match(new RegExp('\\b(?:'+codes.join('|')+')\\b','g'))??[])];
    const symbolCompatible=m.currencyRaw==='$'?['USD','CAD','AUD','NZD','SGD','HKD','TWD'].includes(declared):/^kr\.?$/.test(m.currencyRaw)?['NOK','SEK','DKK','ISK'].includes(declared):visible===declared;
    if(codes.includes(declared)&&symbolCompatible&&(!visible||visible===declared)&&iso.every(x=>x===declared))c.currency=declared;
    c.identifiedCardEvidence={bodyHash:hash(body),productId:owned.node.attrs['data-product'],cardPath:pathOf(owned.node),cardSpan:[owned.node.start,owned.node.end],namePath:pathOf(owned.nameNode),currencyPath:pathOf(owned.node)+'/@data-currency',declaredCurrency:declared??null,conflict:!!declared&&(!symbolCompatible||!!visible&&visible!==declared||iso.some(x=>x!==declared))};
    if(c.identifiedCardEvidence.conflict){c.currency=null;c.qualifierAmbiguous=true;}else if(c.currency===declared)c.currencyResolution={kind:'IDENTIFIED_PRODUCT_CARD_CURRENCY_ATTRIBUTE',currency:declared,evidence:c.identifiedCardEvidence};
   }if(tableCell){const {node,...proof}=tableCell;c.billingTableEvidence={...proof,bodyHash:hash(body)};}if(sectionFee){const {node,...proof}=sectionFee;c.labelledSectionEvidence={...proof,bodyHash:hash(body)};}if(declaration)c.subscriptionDeclaration={...declaration,path:pathOf(n),bodyHash:hash(body),span:[n.start,n.end]};c.rawEvidenceSnippet=body.slice(n.start,n.end).slice(0,6000);c.structuredPath=pathOf(n);c.discoveryCoordinates={start:n.start,end:n.end,coordinate:'UTF16_RETAINED_BODY_NEW_ANALYSIS'};c.siblingLabels=(owned.node.headings??[]).map(h=>h.text);c.sourceType='HTML';if(n.tag==='img')c.semanticAttribute={name:'alt',value:n.attrs.alt,path:pathOf(n),span:[n.start,n.openEnd],basis:'ACTIVE_IMAGE_ALTERNATIVE_TEXT'};preserveQualifiers(c,{localText:declaration?.raw??tableCell?.raw??sectionFee?.raw??n.text,ownerText:declaration?.raw??tableCell?.raw??sectionFee?.context??owned.node.text,localPath:pathOf(n),ownerPath:pathOf(owned.node),ownerStrong:owned.strong,localMoneyCount:ms.length,ownerMoneyCount:cached.get(owned.node)?.length??0});result.push(c);
  }}
 if(result.length>20000)throw Error('CANDIDATE_BOUND');
 annotateHTML(result,tree);return {candidates:result,diagnostics};}

export function grade(c,context={}){const reasons=qualifierSafety(c);if(c.amountNormalized===null)reasons.push('VALUE_NORMALIZATION_UNRESOLVED');if(!c.currency)reasons.push('CURRENCY_UNRESOLVED');if(!c.product)reasons.push('PRODUCT_UNRESOLVED');if(c.ownershipAmbiguous)reasons.push('STRUCTURAL_OWNERSHIP_WEAK');if(c.crossCardRisk)reasons.push('CROSS_CARD_CONFLICT');if(c.nonPriceNumericRisk)reasons.push('NON_PRICE_NUMERIC');if(c.qualifierAmbiguous)reasons.push('PROMOTION_QUALIFIER_UNRESOLVED');if(c.billingPeriodAmbiguous)reasons.push('BILLING_BASIS_AMBIGUOUS');if(!context.authority)reasons.push('SOURCE_AUTHORITY_UNRESOLVED');if(!context.marketBound)reasons.push('MARKET_ATTRIBUTION_UNRESOLVED');if(context.excluded)reasons.push('HISTORICAL_SOURCE_EXCLUDED');
 let level=1;if(c.amountNormalized!==null&&c.currency&&c.product&&!c.nonPriceNumericRisk)level=2;if(level===2&&!c.ownershipAmbiguous&&!c.crossCardRisk&&!c.qualifierAmbiguous&&!c.billingPeriodAmbiguous)level=3;if(level===3&&context.authority&&context.marketBound&&!context.excluded&&!context.malformed&&c.sourceType!=='SCRIPT_LITERAL')level=4;
 if(qualifierSafety(c).length)level=Math.min(2,level);
 if(!context.marketBound||c.attribution?.blockingReasons.length){level=Math.min(2,level);reasons.push(...(c.attribution?.blockingReasons??[]));}
 if(c.qualifier.includes('SAVINGS_AMOUNT_NOT_CHARGE')){level=1;reasons.push('NON_CHARGE_MONETARY_AMOUNT');}
 return {...c,verificationLevel:level,blockingReasons:reasons,decisionReason:level===4?'OFFLINE_CANDIDATE_ONLY_NOT_PRODUCTION_VERIFIED':reasons.join('|')||'STRUCTURALLY_GROUNDED',billingPeriod:c.billingPeriod??null};}
