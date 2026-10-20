// Small deterministic interpretation of ordinary subscription pages. A
// Service may come from a coherent page/component product presentation or a
// page identity with sibling plan cards; headings and money alone are never
// promoted into Services or offerings.
import {digest} from './model.mjs';
import {nonStandalonePresentation} from './offering-scope.mjs';

const voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
const peripheral=new Set(['nav','header','footer','aside']);
const decode=s=>s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|middot);/gi,(all,key)=>{
 if(key[0]!=='#')return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',middot:'·'}[key.toLowerCase()]??all;
 const n=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):all;
});
const attrs=raw=>Object.fromEntries([...raw.matchAll(/([^\s=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map(m=>[m[1].toLowerCase(),decode(m[2]??m[3]??m[4]??'')]));
const normalized=s=>decode(s).normalize('NFKC').replace(/\s+/gu,' ').trim();
const comparable=s=>normalized(s).toLocaleLowerCase('en');
const exactWord=(text,name)=>new RegExp('(?:^|[^\\p{L}\\p{N}])'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^\\p{L}\\p{N}])','iu').test(text);

function sourceCondition(expression,host){
 if(!expression||!host)return null;const labels=new Set(host.toLowerCase().split('.'));
 const one=expression.match(/^\s*location\.hostname\.includes\((['"])([a-z0-9-]+)\1\)\s*$/i);if(one)return labels.has(one[2].toLowerCase());
 const none=expression.match(/^\s*!\[([^\]]+)\]\.some\(\s*\w+\s*=>\s*location\.hostname\.includes\(\s*\w+\s*\)\s*\)\s*$/i);
 if(none){const values=[...none[1].matchAll(/(['"])([a-z0-9-]+)\1/gi)].map(m=>m[2].toLowerCase());return values.length?!values.some(v=>labels.has(v)):null;}
 return null;
}

function parse(body,url,{maskScripts=false}={}){
 let host=null;try{host=new URL(url).hostname;}catch{}
 // The Max ES page includes a script string resembling an open HTML tag.
 // Mask script contents for this proven layout while keeping every offset
 // aligned to the unmodified source used by V3 locators and hashes.
 const scanned=maskScripts?body.replace(/(<script\b(?:[^>"']|"[^"]*"|'[^']*')*>)[^]*?(<\/script\s*>)/giu,(whole,open,close)=>open+' '.repeat(whole.length-open.length-close.length)+close):body;
 const root={tag:'#document',start:0,openEnd:0,contentEnd:body.length,end:body.length,parent:null,attrs:{},hidden:false},nodes=[],segments=[],stack=[root];let cursor=0,tokens=0,limited=false;
 const token=/<!--[^]*?-->|<\/?([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/giu;
 const add=end=>{if(end<=cursor)return;const parent=stack.at(-1),raw=scanned.slice(cursor,end),text=normalized(raw);if(text&&!parent.hidden)segments.push({start:cursor,end,text,parent});};
 for(let match;(match=token.exec(scanned));){if(++tokens>131072){limited=true;break;}add(match.index);cursor=token.lastIndex;if(!match[1])continue;
  const tag=match[1].toLowerCase(),closing=match[0][1]==='/';
  if(closing){const index=stack.findLastIndex(n=>n.tag===tag);if(index>0){for(const node of stack.slice(index)){node.contentEnd=match.index;node.end=token.lastIndex;}stack.length=index;}continue;}
  const attributes=attrs(match[0].slice(tag.length+1,-1)),parent=stack.at(-1),condition=sourceCondition(attributes['x-show'],host),staticHidden=/display\s*:\s*none|visibility\s*:\s*hidden/i.test(attributes.style??'')&&!Object.hasOwn(attributes,'x-show'),hidden=parent.hidden||Object.hasOwn(attributes,'hidden')||attributes['aria-hidden']==='true'||staticHidden||condition===false;
  const node={tag,start:match.index,openEnd:token.lastIndex,contentEnd:token.lastIndex,end:token.lastIndex,parent,attrs:attributes,hidden};nodes.push(node);
  if(!voids.has(tag)&&!match[0].endsWith('/>')){if(stack.length>=128){limited=true;break;}stack.push(node);}
 }
 add(limited?cursor:body.length);for(const node of stack.slice(1)){node.contentEnd=body.length;node.end=body.length;}
 const within=node=>segments.filter(s=>s.start>=node.openEnd&&s.end<=node.contentEnd&&!ancestors(s.parent).some(n=>n.hidden));
 const text=node=>within(node).map(s=>s.text).join(' ').replace(/\s+/gu,' ').trim();
 return {body,host,nodes,segments,root,within,text,limited};
}
const ancestors=node=>{const rows=[];for(let current=node;current&&current.tag!=='#document';current=current.parent)rows.push(current);return rows;};
const locator=(body,start,end)=>({kind:'SPAN',start,end,quote:body.slice(start,end),sha256:digest(body.slice(start,end))});

function fieldRows(parsed){
 const rows=[];
 for(const node of parsed.nodes){
  if(node.hidden)continue;
  if(node.tag==='title'&&ancestors(node).some(parent=>parent.tag==='head')){const value=parsed.text(node);if(value)rows.push({kind:'TITLE',value,node,start:node.openEnd,end:node.contentEnd});}
  if(node.tag==='meta'&&['title','description','application-name'].includes(node.attrs.name?.toLowerCase())||node.tag==='meta'&&['og:title','og:description','og:site_name'].includes(node.attrs.property?.toLowerCase())){
   const value=normalized(node.attrs.content??'');if(value){const raw=parsed.body.slice(node.start,node.openEnd),at=raw.indexOf(node.attrs.content);rows.push({kind:(node.attrs.name??node.attrs.property).toUpperCase(),value,node,start:at<0?node.start:node.start+at,end:at<0?node.openEnd:node.start+at+node.attrs.content.length});}
  }
 }
 return rows;
}

function planPageIdentities(parsed,hasPlanSet){
 if(!hasPlanSet)return [];
 const fields=fieldRows(parsed),claims=[];
 for(const row of fields){const match=row.value.match(/(?:^|[|–—:]\s*)([\p{L}\p{N}][\p{L}\p{N}&'’.+ -]{1,118}?)\s+(subscriptions?|memberships?)\b/iu);if(!match)continue;const name=normalized(match[1].split(/\s+[|–—]\s+/u).at(-1));if(!name||name.length>120)continue;const local=row.value.indexOf(match[1])+match[1].lastIndexOf(name),relationAt=row.value.toLocaleLowerCase('en').indexOf(match[2].toLocaleLowerCase('en'));claims.push({name,type:/\bapp(?:lication)?\b/iu.test(name)?'SoftwareApplication':'Service',identity:locator(parsed.body,row.start+Math.max(0,local),row.start+Math.max(0,local)+name.length),subscription:{kind:/membership/iu.test(match[2])?'EXPLICIT_MEMBERSHIP':'EXPLICIT_SUBSCRIPTION',locator:locator(parsed.body,row.start+relationAt,row.start+relationAt+match[2].length)},field:row.kind});}
 const primary=claims.filter(row=>['TITLE','OG:TITLE'].includes(row.field));if(new Set(primary.map(row=>comparable(row.name))).size>1)return [];const byName=new Map();for(const claim of primary){const key=comparable(claim.name),rows=byName.get(key)??[];rows.push(claim);byName.set(key,rows);}
 const identities=[];for(const rows of byName.values()){
  const name=rows[0].name,corroborated=fields.some(field=>!['TITLE','OG:TITLE'].includes(field.kind)&&new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s+(?:subscriptions?|memberships?)\\b','iu').test(field.value))||parsed.nodes.some(n=>n.tag==='h1'&&comparable(parsed.text(n))===comparable(name));
  if(new Set(rows.map(r=>r.field)).size>=2||corroborated)identities.push({...rows[0],support:[...new Set([...rows.map(r=>r.field),...(corroborated?['PAGE_IDENTITY_CORROBORATION']:[])])]});
 }
 return identities.length===1?identities:[];
}

const relationshipWord=/\b(subscriptions?|memberships?)\b/iu;
const productWord=/\b(?:app(?:lication)?|membership|platform|product|service|software)\b/iu;
const descriptiveProductWord=/\b(?:access|app(?:lication)?|library|magazines?|membership|newspapers?|platform|product|service|software)\b/iu;
const providerPredicate=/\b(?:is|offers?|provides?|gives?|delivers?|lets?|helps?|brings?|makes?|transforms?|connects?)\b/iu;
const genericName=/^(?:plans?|pricing|subscriptions?|memberships?|premium|pro|plus|basic|free|monthly|annual|yearly|account|login)$/iu;
const peripheralName=/\b(?:support|help(?: center)?|login|account|authentication|billing portal|article|blog)\b/iu;
const escaped=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const uniqueRow=rows=>{const values=new Map();for(const row of rows)values.set(comparable(row.value),row);return values.size===1?[...values.values()][0]:null;};
const exactLocator=(parsed,row,value)=>{const raw=parsed.body.slice(row.start,row.end),match=new RegExp(escaped(value),'iu').exec(raw);return match?locator(parsed.body,row.start+match.index,row.start+match.index+match[0].length):null;};
const relationLocator=(parsed,row)=>{const raw=parsed.body.slice(row.start,row.end),match=relationshipWord.exec(raw);return match?{kind:/membership/iu.test(match[0])?'EXPLICIT_MEMBERSHIP':'EXPLICIT_SUBSCRIPTION',locator:locator(parsed.body,row.start+match.index,row.start+match.index+match[0].length)}:null;};
const sourceProductClaim=(value,providerName,name,{description=false,requireProvider=false}={})=>{
 const relationship=description?descriptiveProductWord:relationshipWord;if(!relationship.test(value)||(description?true:productWord.test(value))===false)return false;
 if((!requireProvider||comparable(providerName??'')===comparable(name))&&new RegExp('^'+escaped(name)+'(?:\\s|[,.:;—-])','iu').test(value)&&providerPredicate.test(value))return true;
 return !!providerName&&new RegExp('^'+escaped(providerName)+'(?:\\s|[,.:;—-]).*\\b(?:creates?|develops?|makes?|offers?|operates?|provides?|publishes?)\\b[^.]{0,120}\\b'+escaped(name)+'\\b','iu').test(value);
};
function presentationName(title,siteIdentity){
 if(siteIdentity)return siteIdentity.value;
 const separated=title.value.match(/^(.{2,120}?)\s*(?:[|·–—:]\s*)/u)?.[1],suffix=title.value.match(/^(.{2,120}?)\s+(?:(?:consumer|digital|online|personal)\s+)?(?:(?:app(?:lication)?|platform|service|software)\s+)?(?:subscription|membership)(?:\s+(?:app|plans?|service))?$/iu)?.[1];
 return normalized(separated??suffix??'');
}
function pagePresentationIdentity(parsed,providerName){
 const fields=fieldRows(parsed),titles=fields.filter(row=>row.kind==='TITLE'),openGraphTitles=fields.filter(row=>row.kind==='OG:TITLE'),descriptions=fields.filter(row=>['DESCRIPTION','OG:DESCRIPTION'].includes(row.kind)),siteRows=fields.filter(row=>['APPLICATION-NAME','OG:SITE_NAME'].includes(row.kind)),title=uniqueRow(titles),openGraphTitle=uniqueRow(openGraphTitles),siteIdentity=siteRows.length?uniqueRow(siteRows):null;
 if(!title||!openGraphTitle||comparable(title.value)!==comparable(openGraphTitle.value)||(siteRows.length&&!siteIdentity))return null;
 const name=presentationName(title,siteIdentity);if(!name||name.length<2||name.length>120||genericName.test(name)||peripheralName.test(name)||!exactWord(title.value,name)||!exactWord(openGraphTitle.value,name))return null;
 if(siteIdentity&&comparable(siteIdentity.value)!==comparable(name))return null;
 const description=descriptions.length?uniqueRow(descriptions):null;if(descriptions.length&&!description)return null;
 const metadataSupport=description&&sourceProductClaim(description.value,providerName,name,{description:true}),headings=parsed.nodes.filter(node=>node.tag==='h1'&&!node.hidden&&comparable(parsed.text(node))===comparable(name)),bodySupport=parsed.segments.find(row=>exactWord(row.text,name)&&sourceProductClaim(row.text,providerName,name)),relationRows=[title,openGraphTitle,...descriptions,...(bodySupport?[{...bodySupport,value:bodySupport.text}]:[])].filter(row=>relationshipWord.test(row.value)&&productWord.test(row.value));
 if(!relationRows.length||(!metadataSupport&&!(headings.length===1&&bodySupport)))return null;
 const identity=exactLocator(parsed,siteIdentity??title,name),subscription=relationLocator(parsed,relationRows[0]);if(!identity||!subscription)return null;
 const material=[title.value,openGraphTitle.value,description?.value??'',bodySupport?.text??''].join(' '),type=/\b(?:app(?:lication)?|software)\b/iu.test(material)?'SoftwareApplication':'Service';
 return {name,type,identity,subscription,support:['PAGE_TITLE','OPEN_GRAPH_TITLE',...(metadataSupport?['PRODUCT_DESCRIPTION']:['PAGE_IDENTITY_CORROBORATION'])]};
}

function nativeSubscriptionPlanSet(body){
 let scripts=0,nodes=0;
 for(const match of body.matchAll(/<script\b([^>]*)>([^]*?)<\/script\s*>/gi)){
  if(++scripts>32)break;const raw=match[2];
  if(Buffer.byteLength(raw)>1_000_000||!/\btype\s*=\s*["']application\/(?:ld\+)?json["']/i.test(match[1]))continue;
  let root;try{root=JSON.parse(raw);}catch{continue;}const stack=[{value:root,depth:0}];
  while(stack.length&&nodes++<8192){const {value,depth}=stack.pop();if(!value||typeof value!=='object'||depth>32)continue;
   for(const [key,child]of Object.entries(value)){
    if(/^(?:subscription|membership)Plans$/i.test(key)&&child&&typeof child==='object'){
     const plans=Array.isArray(child)?child:Object.values(child),valid=plans.filter(plan=>plan&&typeof plan==='object'&&!Array.isArray(plan)&&Object.entries(plan).some(([name,v])=>/(?:price|amount)/i.test(name)&&(typeof v==='number'||typeof v==='string'&&v.trim()))&&Object.entries(plan).some(([name,v])=>/(?:renewal|billing|cadence|interval|period|display_name|selection_key)/i.test(name)&&/^(?:P?1?[MY]|months?|monthly|years?|yearly|annual)$/i.test(String(v))));
     if(valid.length)return true;
    }
    if(child&&typeof child==='object')stack.push({value:child,depth:depth+1});
   }
  }
 }
 return false;
}

function nativePlanPresentationIdentity(parsed,providerName){
 if(!nativeSubscriptionPlanSet(parsed.body)||typeof providerName!=='string')return null;
 const name=normalized(providerName),fields=fieldRows(parsed),title=uniqueRow(fields.filter(row=>row.kind==='TITLE')),openGraphRows=fields.filter(row=>row.kind==='OG:TITLE'),openGraphTitle=openGraphRows.length?uniqueRow(openGraphRows):null,descriptions=fields.filter(row=>['DESCRIPTION','OG:DESCRIPTION'].includes(row.kind)),description=descriptions.length?uniqueRow(descriptions):null,siteRows=fields.filter(row=>['APPLICATION-NAME','OG:SITE_NAME'].includes(row.kind)),siteIdentity=siteRows.length?uniqueRow(siteRows):null;
 if(!title||!description||!name||name.length<2||name.length>120||genericName.test(name)||peripheralName.test(name)||(openGraphRows.length&&(!openGraphTitle||comparable(openGraphTitle.value)!==comparable(title.value)))||(siteRows.length&&(!siteIdentity||comparable(siteIdentity.value)!==comparable(name))))return null;
 if(!/\b(?:plans?|subscriptions?|memberships?)\b/iu.test(title.value)||!exactWord(description.value,name)||!relationshipWord.test(description.value)||!/\b(?:plans?|service|app(?:lication)?|membership)\b/iu.test(description.value))return null;
 const identity=exactLocator(parsed,description,name),subscription=relationLocator(parsed,description);if(!identity||!subscription)return null;
 const type=/\b(?:app(?:lication)?|software)\b/iu.test(description.value)?'SoftwareApplication':'Service';
 return {name,type,identity,subscription,support:['PAGE_TITLE','PRODUCT_DESCRIPTION','NATIVE_SUBSCRIPTION_PLAN_SET']};
}

function componentIdentities(parsed,providerName){
 const found=[];
 for(const node of parsed.nodes){if(node.hidden||node.tag!=='section'||ancestors(node).some(parent=>peripheral.has(parent.tag)))continue;
  const headings=parsed.nodes.filter(row=>/^h[1-3]$/.test(row.tag)&&!row.hidden&&row.start>=node.openEnd&&row.end<=node.contentEnd&&!ancestors(row).some(parent=>parent!==node&&['article','section'].includes(parent.tag))),names=[...new Set(headings.map(row=>parsed.text(row)).filter(Boolean))];if(names.length!==1)continue;
  const name=names[0];if(name.length<2||name.length>120||genericName.test(name)||peripheralName.test(name))continue;
  const relationship=parsed.within(node).find(row=>exactWord(row.text,name)&&sourceProductClaim(row.text,providerName,name,{requireProvider:true}));if(!relationship)continue;
  const raw=parsed.body.slice(relationship.start,relationship.end),match=relationshipWord.exec(raw);if(!match)continue;const type=/\b(?:app(?:lication)?|software)\b/iu.test(relationship.text)?'SoftwareApplication':'Service';
  found.push({name,type,identity:locator(parsed.body,headings[0].openEnd,headings[0].contentEnd),subscription:{kind:/membership/iu.test(match[0])?'EXPLICIT_MEMBERSHIP':'EXPLICIT_SUBSCRIPTION',locator:locator(parsed.body,relationship.start+match.index,relationship.start+match.index+match[0].length)},support:['COMPONENT_IDENTITY','COMPONENT_PRODUCT_RELATIONSHIP'],range:node.end-node.start});
 }
 const byName=new Map();for(const row of found.sort((a,b)=>a.range-b.range))if(!byName.has(comparable(row.name)))byName.set(comparable(row.name),row);return [...byName.values()].map(({range,...row})=>row);
}

const symbolCurrency=new Map([['€','EUR'],['£','GBP'],['¥','JPY'],['CA$','CAD'],['A$','AUD'],['US$','USD'],['S$','SGD'],['R$','BRL'],['RM','MYR'],['Kč','CZK'],['zł','PLN'],['NTD','TWD'],['₱','PHP'],['Rp','IDR'],['NIS','ILS']]);
const validCurrencies=new Set(Intl.supportedValuesOf('currency'));
const currencyNames=new Map();
const displayCurrencies=new Intl.DisplayNames(['en'],{type:'currency'});
for(const code of Intl.supportedValuesOf('currency')){const name=displayCurrencies.of(code)?.toLocaleLowerCase('en');if(name)currencyNames.set(name,currencyNames.has(name)?null:code);}
function headingCurrency(text){const name=/^pricing\s*\(([^)]+)\)/iu.exec(text)?.[1]?.trim().toLocaleLowerCase('en'),code=name?currencyNames.get(name):null;return code&&new Intl.NumberFormat('en',{style:'currency',currency:code,currencyDisplay:'narrowSymbol'}).formatToParts(1).find(part=>part.type==='currency')?.value==='$'?code:null;}
function number(raw){const value=raw.replace(/[\u00a0\u202f ]/gu,'');if(/^\d+$/.test(value))return Number(value);if(/^\d+[.,]\d{1,2}$/.test(value))return Number(value.replace(',','.'));if(/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(value))return Number(value.replaceAll(',',''));if(/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(value))return Number(value.replaceAll('.','').replace(',','.'));return null;}
const money=/(?<![\p{L}\p{N}])((?:[A-Z]{3}|RM|TL|CA\$|A\$|US\$|S\$|R\$|Kč|zł|Rp|Lei|R|₱|[$€£¥])\s*)?(?<![\d.,])(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[ .\u00a0\u202f]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![\d.,])\s*((?:[A-Z]{3}|RM|TL|S\$|R\$|Kč|zł|Rp|Lei|R|₱|[$€£¥]))?(?![\p{L}\p{N}])/gu;
function charges(text,currencyHint=null,marketCurrencyHint=null){
 const rows=[];for(const match of text.matchAll(money)){const mark=normalized((match[1]??'')||(match[3]??'')),currency=/^[A-Z]{3}$/.test(mark)&&validCurrencies.has(mark)?mark:symbolCurrency.get(mark)??(mark==='$'?currencyHint:mark==='Lei'&&marketCurrencyHint==='RON'?'RON':mark==='R'&&marketCurrencyHint==='ZAR'?'ZAR':mark==='TL'&&marketCurrencyHint==='TRY'?'TRY':null);if(!currency)continue;const amount=number(match[2]);if(amount===null)continue;
  const after=text.slice(match.index+match[0].length,match.index+match[0].length+48),cadenceMatch=after.match(/^\s*(?:(?:\/|per\s+|a\s+|each\s+|every\s+)\s*)?(months?|monthly|mo\b|years?|yearly|annually|annual\b|yr\b)/iu);if(!cadenceMatch)continue;const cadence=/month|monthly|\bmo\b/iu.test(cadenceMatch[1])?'MONTHLY':'YEARLY',left=Math.max(0,match.index-64),right=Math.min(text.length,match.index+match[0].length+cadenceMatch[0].length+96),context=text.slice(left,right),trial=/\b(?:trial|introductory|first\s+(?:month|\d+\s+months?))\b/iu.test(context),nonCharge=/\b(?:save|saving|discount|credit|benefit|worth|value)\b[^.;]{0,32}$/iu.test(text.slice(left,match.index));if(nonCharge)continue;
  const billing=[...context.matchAll(/\b(?:billed|billing|charged|paid|pay|payment(?:s)?)\s+(?:[^.;]{0,32}?)(monthly|yearly|annually|every month|every year|per month|per year)\b|\b(monthly|yearly|annual)\s+(?:billing|payments?)\b/giu)].map(m=>/month/iu.test(m[1]??m[2])?'MONTHLY':'YEARLY'),prefix=text.slice(Math.max(0,match.index-32),match.index),stated=/(?:\bis\b|\bcosts?\b|\bpriced\s+at\b|\bor\b)\s*$/iu.test(prefix)?cadence:null,unique=[...new Set([...billing,...(stated?[stated]:[])])];
  const billingCadence=unique.length===1?unique[0]:'UNKNOWN';rows.push({amount,currency,cadence,billingCadence,consumer:true,relationship:'SUBSCRIPTION',role:trial?'TRIAL':'ORDINARY',monetaryKind:trial?'TRIAL_CHARGE':'SUBSCRIPTION_CHARGE',amountDerivation:billingCadence!=='UNKNOWN'&&billingCadence!==cadence?'ARITHMETIC':'EXPLICIT',text:match[0]+cadenceMatch[0],...(mark==='$'&&currencyHint?{currencyBasis:'CONTEXTUAL_DOLLAR'}:{})});
 }
 return rows;
}

function localCharges(parsed,node,currencyHint=null,marketCurrencyHint=null){
 const segments=parsed.within(node),rows=[];
 for(let index=0;index<segments.length;index++)for(let width=1;width<=3&&index+width<=segments.length;width++){
  const text=segments.slice(index,index+width).map(row=>row.text).join(' ');for(const charge of charges(text,currencyHint,marketCurrencyHint)){const key=[charge.amount,charge.currency,charge.cadence,charge.role].join('|'),at=rows.findIndex(row=>[row.amount,row.currency,row.cadence,row.role].join('|')===key);if(at<0)rows.push(charge);else if(rows[at].billingCadence==='UNKNOWN'&&charge.billingCadence!=='UNKNOWN')rows[at]=charge;}
 }
 return rows;
}

function planCards(parsed,currencyHint=null,marketCurrencyHint=null){
 const cards=[];
 for(const node of parsed.nodes){if(node.hidden||!(node.tag==='article'||/(?:^|\/)(?:Offer|Product)$/i.test(node.attrs.itemtype??''))||ancestors(node).some(a=>peripheral.has(a.tag)))continue;
  const headings=parsed.nodes.filter(h=>/^h[2-4]$/.test(h.tag)&&h.start>=node.openEnd&&h.end<=node.contentEnd&&!h.hidden&&!ancestors(h).some(a=>a!==node&&a.tag==='article')),names=[...new Set(headings.map(h=>parsed.text(h)).filter(name=>name&&name.length<=80))];if(names.length!==1)continue;
  const own=localCharges(parsed,node,currencyHint,marketCurrencyHint);if(!own.length)continue;cards.push({node,name:names[0],nameNode:headings[0],charges:own});
 }
 const groups=new Map();for(const card of cards){const key=card.node.parent?.start??-1,rows=groups.get(key)??[];rows.push(card);groups.set(key,rows);}
 return [...groups.values()].filter(rows=>rows.length>=2||rows[0].node.attrs.itemtype).flat();
}

// Some provider help pages publish the plans as sibling list items under a
// pricing heading. Keep each top-level item as its own source presentation;
// nested list items describe add-ons and must never become subscription plans.
function pricingLists(parsed,currencyHint=null,marketCurrencyHint=null){
 const rows=[],billingStatements=parsed.segments.filter(row=>/\bplans?\s+(?:are|is)\s+(?:billed|charged|paid)\s+(?:monthly|yearly|annually)\b/iu.test(row.text)).map(row=>row.text),monthly=billingStatements.some(row=>/\bplans?\s+(?:are|is)\s+(?:billed|charged|paid)\s+monthly\b/iu.test(row)),yearly=billingStatements.some(row=>/\bplans?\s+(?:are|is)\s+(?:billed|charged|paid)\s+(?:yearly|annually)\b/iu.test(row));
 for(const heading of parsed.nodes.filter(node=>/^h[2-4]$/.test(node.tag)&&!node.hidden&&/^pricing(?:\s|$|\()/iu.test(parsed.text(node))&&!ancestors(node).some(parent=>peripheral.has(parent.tag)))){
  const dollarHint=headingCurrency(parsed.text(heading))??currencyHint;
  const scope=/\bfor (?:customers|members|subscribers|consumers|residents) in ([\p{L} .-]+)$/iu.exec(parsed.text(heading))?.[1]?.trim().replace(/^the\s+/iu,'')??null,regions=new Intl.DisplayNames(['en'],{type:'region'}),market=scope?([...Array(26)].flatMap((_,a)=>[...Array(26)].map((_,b)=>String.fromCharCode(65+a,65+b))).find(code=>regions.of(code).toLocaleLowerCase('en')===scope.toLocaleLowerCase('en'))??null):null;
  const next=parsed.nodes.filter(node=>node.parent===heading.parent&&node.start>=heading.end&&!node.hidden).sort((a,b)=>a.start-b.start)[0];
  if(next?.tag!=='ul'&&next?.tag!=='ol')continue;
  const items=parsed.nodes.filter(node=>node.tag==='li'&&node.parent===next&&!node.hidden);
  if(items.length<2||items.length>24)continue;
  for(const item of items){
   const own=parsed.within(item).filter(segment=>!ancestors(segment.parent).some(node=>node!==item&&node.tag==='li'));
   const value=own.map(segment=>segment.text).join(' ').replace(/\s+/gu,' ').trim(),match=/^([\p{L}\p{N}][\p{L}\p{N} &'’+.-]{0,79}?)\s*(?:[*†‡]+\s*)?:\s*/u.exec(value);
   if(!match)continue;
   const name=match[1].trim(),parsedCharges=charges(value.slice(match[0].length),dollarHint,marketCurrencyHint);
   if(parsedCharges.length!==1||parsedCharges[0].role!=='ORDINARY')continue;
   const raw=parsed.body.slice(item.openEnd,item.contentEnd),nameAt=raw.indexOf(name);
   if(nameAt<0)continue;
   const charge=parsedCharges[0];
   if(charge.billingCadence==='UNKNOWN'&&monthly&&!yearly&&charge.cadence==='MONTHLY')charge.billingCadence='MONTHLY';
   rows.push({name,nameLocator:locator(parsed.body,item.openEnd+nameAt,item.openEnd+nameAt+name.length),presentation:locator(parsed.body,item.start,item.end),market,charges:[charge]});
  }
 }
 return rows;
}


// Provider pricing tables often put the cadence label before the charge. Keep
// each row separate; buttonless rows require explicit monthly billing and a
// coherent source-bound pricing-table identity.
function pricingTables(parsed,currencyHint=null,providerName=null,marketCurrencyHint=null){
 const rows=[];
 for(const table of parsed.nodes.filter(node=>node.tag==='table'&&!node.hidden&&!ancestors(node).some(parent=>peripheral.has(parent.tag)))){
  const heading=parsed.nodes.filter(node=>/^h[2-4]$/.test(node.tag)&&!node.hidden&&node.end<=table.start).at(-1);
  const caption=parsed.nodes.find(node=>node.tag==='caption'&&node.start>=table.openEnd&&node.end<=table.contentEnd&&!node.hidden);
  const headingText=heading?parsed.text(heading):'';
  if(nonStandalonePresentation(headingText,providerName)||caption&&nonStandalonePresentation(parsed.text(caption),providerName)||/\b(?:annual|yearly|anual|promotions?|trials?)\b/iu.test(headingText))continue;
  const header=parsed.nodes.filter(node=>node.tag==='th'&&node.start>=table.openEnd&&node.end<=table.contentEnd&&!node.hidden).at(-1);
  const headerText=header?parsed.text(header):'';
  const previous=parsed.nodes.filter(node=>node.parent===table.parent&&node.end<=table.start&&!node.hidden).at(-1);
  const sectionText=previous?.tag==='p'?parsed.text(previous):'';
  const sharedMonthly=/^(?:monthly (?:price|payment)|price per month)$/iu.test(headerText)||/\bplans?\s+(?:are|is)\s+(?:billed|charged|paid)\s+monthly\b/iu.test(sectionText)&&!/\b(?:annual|yearly|equivalent)\b/iu.test(sectionText);
  const candidates=[];
  for(const row of parsed.nodes.filter(node=>node.tag==='tr'&&node.start>=table.openEnd&&node.end<=table.contentEnd&&!node.hidden)){
   const cells=parsed.nodes.filter(node=>node.tag==='td'&&node.parent===row&&!node.hidden).sort((a,b)=>a.start-b.start);
   if(cells.length<2||cells.length>6)continue;
   const nameSegment=parsed.within(cells[0])[0],name=nameSegment?.text??'';
   if(!name||name.length>80||/^(?:monthly|mensal|mensual|annual|anual|features?|plans?|planos?)$/iu.test(name)||/\b(?:[2-9]|1[0-2]|six)\s*[- ]?\s*months?\b/iu.test(name)||/(?:^|[^\p{L}])(?:membros?\s+extras?|miembros?\s+extras?|promo(?:ç(?:ão|ões)|tional?|cional)?|pacote|combo)(?=$|[^\p{L}])/iu.test(name)||nonStandalonePresentation(name,providerName)||/\b(?:no longer available|not available to purchase|unavailable to purchase|discontinued)\b/iu.test(parsed.text(row)))continue;
   const priceCell=cells.at(-1),parts=parsed.within(priceCell),priceText=parts.map(part=>part.text).join(' ');
   const hasPlanAction=/\b(?:select|choose|subscribe|join)\s+(?:(?:a|payment)\s+)?plan\b|\bseleccionar\s+plan\b/iu.test(priceText);
   if(!hasPlanAction&&!parts.some(part=>/^(?:monthly|mensal|mensual)(?:\s+payment\s+plan)?\s*:/iu.test(part.text)))continue;
   const monthly=[];
   for(let i=0;i<parts.length;i++){
    const label=/^(?:monthly|mensal|mensual)(?:\s+payment\s+plan)?\s*:\s*(.*)$/iu.exec(parts[i].text);
    if(!label)continue;
    const amountText=label[1]||(parts[i+1]?.text??'');
    if(/(?:annual|yearly|anual|equivalent|equivalente|billed\s+yearly|promo|discount|desconto|trial|introductory|primeiro\s+m[eê]s|bundle|pacote|combo|\*{2,})/iu.test(amountText))continue;
    const prices=[...amountText.matchAll(money)];
    if(prices.length!==1)continue;
    const values=charges(prices[0][0]+' /month',currencyHint,marketCurrencyHint).filter(charge=>charge.cadence==='MONTHLY'&&charge.role==='ORDINARY');
    if(values.length===1)monthly.push({...values[0],billingCadence:'MONTHLY',amountDerivation:'EXPLICIT',text:parts[i].text+' '+amountText});
   }
   if(!monthly.length&&hasPlanAction){
    for(let i=0;i+1<parts.length;i++){
     if(!/\b(?:select|choose|subscribe|join)\s+(?:(?:a|payment)\s+)?plan\b|\bseleccionar\s+plan\b/iu.test(parts[i+1].text))continue;
     const display=parts[i].text;
     if(/\b(?:annual|yearly|equivalent|trial|introductory|first month|promo(?:tional)?|discount|one.time|weekly|billed\s+yearly)\b/iu.test(display))continue;
     const values=charges(display,currencyHint,marketCurrencyHint).filter(charge=>charge.cadence==='MONTHLY'&&charge.billingCadence!=='YEARLY'&&charge.role==='ORDINARY'&&charge.amountDerivation!=='ARITHMETIC');
     if(values.length===1)monthly.push({...values[0],billingCadence:'MONTHLY',amountDerivation:'EXPLICIT',text:display+'; '+parts[i+1].text});
    }
   }
   if(!monthly.length&&hasPlanAction&&sharedMonthly&&!/\b(?:annual|yearly|equivalent|trial|introductory|first month|promo(?:tional)?|discount|one.time|weekly)\b/iu.test(priceText)){
    const prices=[...priceText.matchAll(money)].filter(match=>/^(?:[A-Z]{3}|CA\$|A\$|US\$|S\$|R\$|Kč|zł|Rp|Lei|R|₱|[$€£¥])\s*/u.test(match[0]));
    if(prices.length===1){const values=charges(prices[0][0]+' /month',currencyHint,marketCurrencyHint).filter(charge=>charge.cadence==='MONTHLY'&&charge.role==='ORDINARY');if(values.length===1)monthly.push({...values[0],billingCadence:'MONTHLY',amountDerivation:'EXPLICIT',text:prices[0][0]+'; '+(headerText||sectionText)});}
   }
   if(monthly.length!==1)continue;
   candidates.push({name,nameLocator:locator(parsed.body,nameSegment.start,nameSegment.end),presentation:locator(parsed.body,row.start,row.end),charges:monthly,hasPlanAction});
  }
  if(candidates.length>=1&&candidates.length<=24&&new Set(candidates.map(candidate=>comparable(candidate.name))).size===candidates.length&&(candidates.length===1?candidates[0].hasPlanAction&&!!pricingTableIdentity(parsed,providerName,candidates):candidates.every(candidate=>candidate.hasPlanAction)||pricingTableIdentity(parsed,providerName,candidates)))rows.push(...candidates.map(({hasPlanAction,...candidate})=>candidate));
 }
 return rows;
}

function pricingTableIdentity(parsed,providerName,tables){
 if(!providerName||tables.length<1)return null;
 const fields=fieldRows(parsed),title=uniqueRow(fields.filter(row=>row.kind==='TITLE')),description=uniqueRow(fields.filter(row=>row.kind==='DESCRIPTION'));
 if(!title||!description||!exactWord(title.value,providerName)||!exactWord(description.value,providerName)||!/\b(?:plans?|planos?|planes?)\b/iu.test(title.value)||!/\b(?:subscriptions?|memberships?|assinaturas?|suscripci(?:ón|ones))\b/iu.test(description.value))return null;
 const headings=parsed.nodes.filter(node=>node.tag==='h1'&&!node.hidden&&exactWord(parsed.text(node),providerName)&&/\b(?:plans?|planos?|planes?)\b/iu.test(parsed.text(node)));
 if(headings.length!==1)return null;
 const identity=exactLocator(parsed,title,providerName),relation=/\b(?:subscriptions?|memberships?|assinaturas?|suscripci(?:ón|ones))\b/iu.exec(description.value);
 if(!identity||!relation)return null;
 const at=parsed.body.slice(description.start,description.end).toLocaleLowerCase('en').indexOf(relation[0].toLocaleLowerCase('en'));
 if(at<0)return null;
 return {name:providerName,type:'Service',identity,subscription:{kind:/membership/iu.test(relation[0])?'EXPLICIT_MEMBERSHIP':'EXPLICIT_SUBSCRIPTION',locator:locator(parsed.body,description.start+at,description.start+at+relation[0].length)},support:['PAGE_TITLE','PRODUCT_DESCRIPTION','PRICING_TABLE']};
}

function pricingPageIdentity(parsed,providerName,lists){
 if(!providerName||lists.length<2)return null;
 const fields=fieldRows(parsed),title=uniqueRow(fields.filter(row=>row.kind==='TITLE')),description=uniqueRow(fields.filter(row=>row.kind==='DESCRIPTION'));
 if(!title||!description||!exactWord(title.value,providerName)||!exactWord(description.value,providerName)||!/\b(?:plans?|pricing)\b/iu.test(title.value)||!/\bplans?\b/iu.test(description.value)||!/\b(?:prices?|costs?|subscriptions?)\b/iu.test(description.value))return null;
 const bill=parsed.segments.find(row=>exactWord(row.text,providerName)&&new RegExp(escaped(providerName)+'\\s+plans?\\s+(?:are|is)\\s+(?:billed|charged|paid)\\s+monthly\\b','iu').test(row.text));
 const identity=exactLocator(parsed,title,providerName),relation=bill&&/\bplans?\b/iu.exec(bill.text),at=relation?parsed.body.slice(bill.start,bill.end).indexOf(relation[0]):-1;
 if(!bill||!identity||at<0)return null;
 return {name:providerName,type:'Service',identity,subscription:{kind:'EXPLICIT_SUBSCRIPTION',locator:locator(parsed.body,bill.start+at,bill.start+at+relation[0].length)},support:['PAGE_TITLE','PRODUCT_DESCRIPTION','MONTHLY_PLAN_BILLING']};
}

// HBO Max's help article uses linked plan names followed by distinct monthly
// and annual alternatives. Keep only the explicit monthly charge in each
// direct list item; nearby bundle and discount sections are separate content.
function maxHelpPricingRows(parsed,providerName,currencyHint,marketCurrencyHint){
 if(providerName!=='Max'||parsed.host!=='help.hbomax.com'||marketCurrencyHint!=='USD')return [];
 const selectedCountries=[...parsed.body.matchAll(/HHURL\.config\.selectedCountry\s*=\s*["']([^"']+)["']/gu)].map(match=>match[1].toUpperCase());
 if(!parsed.nodes.some(node=>node.tag==='html'&&/^en(?:-US)?$/iu.test(node.attrs.lang??''))||selectedCountries.length!==1||selectedCountries[0]!=='US'||!parsed.segments.some(row=>row.text==='United States'))return [];
 const heading=parsed.nodes.find(node=>node.tag==='h1'&&!node.hidden&&comparable(parsed.text(node))==='hbo max plans and prices');
 const intro=parsed.nodes.find(node=>node.tag==='p'&&!node.hidden&&/^Here are the HBO Max plans and prices:$/iu.test(parsed.text(node))&&heading&&node.start>heading.end);
 const scope=intro?.parent,prior=scope&&parsed.nodes.find(node=>node.tag==='p'&&node.parent===scope&&node.end<=intro.start&&/\bmonthly or yearly billing\b/iu.test(parsed.text(node)));
 const list=scope&&parsed.nodes.find(node=>node.tag==='div'&&node.parent===scope&&node.start>=intro.end&&node.attrs.class?.split(/\s+/u).includes('itemizedlist'));
 const ul=list&&parsed.nodes.find(node=>node.tag==='ul'&&node.parent===list);
 if(!prior||!ul)return [];
 const rows=[];
 for(const item of parsed.nodes.filter(node=>node.tag==='li'&&node.parent===ul&&!node.hidden)){
  const link=parsed.nodes.find(node=>node.tag==='a'&&ancestors(node).includes(item)&&!node.hidden),name=link&&parsed.text(link),value=parsed.text(item);
  if(!name||name.length>80||nonStandalonePresentation(name,providerName)||/\b(?:student|trial|introductory|promo(?:tional)?|discount)\b/iu.test(value))continue;
  if(!value.startsWith(name+' - '))continue;
  const remainder=value.slice(name.length+3),match=/^(\$\d+(?:\.\d{2})?\s*\/\s*month)\s+or\s+\$\d+(?:\.\d{2})?\s*\/\s*year\b/iu.exec(remainder);
  if(!match)continue;
  const found=charges(match[1],currencyHint??'USD',marketCurrencyHint).filter(row=>row.currency==='USD'&&row.cadence==='MONTHLY'&&row.role==='ORDINARY');
  if(found.length!==1)continue;
  const raw=parsed.body.slice(link.openEnd,link.contentEnd),nameAt=raw.indexOf(name);if(nameAt<0)continue;
  rows.push({name,nameLocator:locator(parsed.body,link.openEnd+nameAt,link.openEnd+nameAt+name.length),presentation:locator(parsed.body,item.start,item.end),charges:[{...found[0],billingCadence:'MONTHLY',amountDerivation:'EXPLICIT'}]});
 }
 return rows.length>=2&&rows.length<=8&&new Set(rows.map(row=>comparable(row.name))).size===rows.length?rows:[];
}

// The GB article separates ordinary HBO Max Entertainment plans from TNT
// Sports and Saver plans. Read only the linked, explicit monthly rows between
// those section headings; the URL and country marker are parser guards, not
// substitutes for the independent G1 market receipt required by V3.
function maxGBHelpPricingRows(parsed,providerName,marketCurrencyHint,url){
 if(providerName!=='Max'||parsed.host!=='help.hbomax.com'||marketCurrencyHint!=='GBP')return [];
 try{if(new URL(url).pathname!=='/gb/Answer/Detail/000002547')return [];}catch{return [];}
 const selectedCountries=[...parsed.body.matchAll(/HHURL\.config\.selectedCountry\s*=\s*["']([^"']+)["']/gu)].map(match=>match[1].toUpperCase());
 if(selectedCountries.length!==1||selectedCountries[0]!=='GB'||!parsed.nodes.some(node=>node.tag==='html'&&/^en(?:-GB)?$/iu.test(node.attrs.lang??''))||!parsed.segments.some(row=>row.text==='United Kingdom'))return [];
 const title=parsed.nodes.find(node=>node.tag==='h1'&&!node.hidden&&comparable(parsed.text(node))==='all about hbo max plans');
 const intro=title&&parsed.nodes.find(node=>node.tag==='p'&&!node.hidden&&node.start>title.end&&/^Here are the HBO Max plans and prices:$/iu.test(parsed.text(node)));
 const section=intro&&parsed.nodes.find(node=>node.tag==='h3'&&!node.hidden&&node.start>=intro.end&&comparable(parsed.text(node))==='hbo max entertainment plans');
 const nextSection=section&&parsed.nodes.find(node=>node.tag==='h3'&&!node.hidden&&node.start>section.end);
 const lists=section&&nextSection?parsed.nodes.filter(node=>node.tag==='div'&&!node.hidden&&node.attrs.class?.split(/\s+/u).includes('itemizedlist')&&node.start>=section.end&&node.end<=nextSection.start):[];
 if(lists.length!==1||comparable(parsed.text(nextSection))!=='hbo max entertainment & tnt sports plans')return [];
 const ul=parsed.nodes.find(node=>node.tag==='ul'&&node.parent===lists[0]);if(!ul)return [];
 const rows=[];
 for(const item of parsed.nodes.filter(node=>node.tag==='li'&&node.parent===ul&&!node.hidden)){
  const links=parsed.nodes.filter(node=>node.tag==='a'&&ancestors(node).includes(item)&&!node.hidden);if(links.length!==1)continue;
  const link=links[0],name=parsed.text(link),value=parsed.text(item);
  if(!name||name.length>80||nonStandalonePresentation(name,providerName)||/\b(?:sports?|saver|student|trial|introductory|promo(?:tional)?|discount)\b/iu.test(name+' '+value)||!value.startsWith(name+' - '))continue;
  const monthly=/^£(\d+(?:\.\d{2})?)\s*\/\s*month$/iu.exec(value.slice(name.length+3));if(!monthly)continue;
  const amount=number(monthly[1]);if(amount===null)continue;
  const raw=parsed.body.slice(link.openEnd,link.contentEnd),nameAt=raw.indexOf(name);if(nameAt<0)continue;
  rows.push({name,nameLocator:locator(parsed.body,link.openEnd+nameAt,link.openEnd+nameAt+name.length),presentation:locator(parsed.body,item.start,item.end),charges:[{amount,currency:'GBP',cadence:'MONTHLY',billingCadence:'MONTHLY',consumer:true,relationship:'SUBSCRIPTION',role:'ORDINARY',monetaryKind:'SUBSCRIPTION_CHARGE',amountDerivation:'EXPLICIT',text:monthly[0]}]});
 }
 return rows.length>=2&&rows.length<=8&&new Set(rows.map(row=>comparable(row.name))).size===rows.length?rows:[];
}

// The Ireland help article has a single list of ordinary monthly plans.
// Its separate Standard with Ads Upgrade paragraph is an add-on, not a plan.
function maxIEHelpPricingRows(parsed,providerName,marketCurrencyHint,url){
 if(providerName!=='Max'||parsed.host!=='help.hbomax.com'||marketCurrencyHint!=='EUR')return [];
 try{if(new URL(url).pathname!=='/ie/Answer/Detail/000002547')return [];}catch{return [];}
 const selectedCountries=[...parsed.body.matchAll(/HHURL\.config\.selectedCountry\s*=\s*["']([^"']+)["']/gu)].map(match=>match[1].toUpperCase());
 if(selectedCountries.length!==1||selectedCountries[0]!=='IE'||!parsed.nodes.some(node=>node.tag==='html'&&/^en(?:-IE)?$/iu.test(node.attrs.lang??''))||!parsed.segments.some(row=>row.text==='Ireland'))return [];
 const title=parsed.nodes.find(node=>node.tag==='h1'&&!node.hidden&&comparable(parsed.text(node))==='all about hbo max plans');
 const intro=title&&parsed.nodes.find(node=>node.tag==='p'&&!node.hidden&&node.start>title.end&&/^Here are the HBO Max plans:$/iu.test(parsed.text(node)));
 const list=intro&&parsed.nodes.find(node=>node.tag==='div'&&node.parent===intro.parent&&!node.hidden&&node.start>=intro.end&&node.attrs.class?.split(/\s+/u).includes('itemizedlist'));
 const ul=list&&parsed.nodes.find(node=>node.tag==='ul'&&node.parent===list);
 if(!ul)return [];
 const rows=[];
 for(const item of parsed.nodes.filter(node=>node.tag==='li'&&node.parent===ul&&!node.hidden)){
  const links=parsed.nodes.filter(node=>node.tag==='a'&&ancestors(node).includes(item)&&!node.hidden);
  if(links.length!==1)continue;
  const link=links[0],name=parsed.text(link),value=parsed.text(item);
  if(!name||name.length>80||nonStandalonePresentation(name,providerName)||/\b(?:upgrade|bundle|add-?on|student|trial|introductory|promo(?:tional)?|discount|annual|yearly)\b/iu.test(name+' '+value)||!value.startsWith(name+' - '))continue;
  const monthly=/^€(\d+(?:[.,]\d{2})?)\s*\/\s*month$/iu.exec(value.slice(name.length+3));if(!monthly)continue;
  const amount=number(monthly[1]);if(amount===null)continue;
  const raw=parsed.body.slice(link.openEnd,link.contentEnd),nameAt=raw.indexOf(name);if(nameAt<0)continue;
  rows.push({name,nameLocator:locator(parsed.body,link.openEnd+nameAt,link.openEnd+nameAt+name.length),presentation:locator(parsed.body,item.start,item.end),charges:[{amount,currency:'EUR',cadence:'MONTHLY',billingCadence:'MONTHLY',consumer:true,relationship:'SUBSCRIPTION',role:'ORDINARY',monetaryKind:'SUBSCRIPTION_CHARGE',amountDerivation:'EXPLICIT',text:monthly[0]}]});
 }
 return rows.length>=2&&rows.length<=8&&new Set(rows.map(row=>comparable(row.name))).size===rows.length?rows:[];
}

// The German provider homepage presents three sibling div cards in its
// monthly picker. Each price is bound to its own plan heading and monthly
// purchase action, rather than to surrounding hero, bundle or add-on prices.
function maxMonthlyDivCards(parsed,providerName,marketCurrencyHint){
 if(providerName!=='Max'||parsed.host!=='www.hbomax.com'||marketCurrencyHint!=='EUR'||!parsed.nodes.some(node=>node.tag==='html'&&node.attrs.lang==='de-DE'))return [];
 const groups=parsed.nodes.filter(node=>node.tag==='div'&&!node.hidden&&node.attrs.class?.split(/\s+/u).includes('max-plan-picker-group-monthly')&&node.attrs.class.split(/\s+/u).includes('max-plan-picker-group'));
 if(groups.length!==1)return [];
 const group=groups[0],cards=parsed.nodes.filter(node=>node.tag==='div'&&!node.hidden&&node.attrs.class?.split(/\s+/u).includes('max-plan-picker-group__card')&&ancestors(node).includes(group));
 const rows=[];
 for(const card of cards){
  if(/\b(?:introductory|trial|promotion(?:al)?|discount|billed yearly|annual equivalent|rabatt|sonderpreis|j[aä]hrlich abgerechnet|nicht mehr erh[aä]ltlich|erste[nrs]?\s+\d+\s+monate)\b/iu.test(parsed.text(card)))continue;
  const headings=parsed.nodes.filter(node=>node.tag==='h3'&&!node.hidden&&ancestors(node).includes(card));
  if(headings.length!==1)continue;
  const name=parsed.text(headings[0]);if(!name||name.length>80||nonStandalonePresentation(name,providerName))continue;
  const prices=parsed.nodes.filter(node=>node.tag==='h4'&&!node.hidden&&ancestors(node).includes(card)).map(node=>({node,text:parsed.text(node)})).filter(row=>/^\d+(?:,\d{2})?\s*€\s*\/\s*Monat$/iu.test(row.text));
  const actions=parsed.nodes.filter(node=>node.tag==='a'&&!node.hidden&&ancestors(node).includes(card)).filter(node=>{
   try{const url=new URL(node.attrs.href);return url.hostname==='auth.hbomax.com'&&url.pathname==='/product'&&/^[a-z-]+-monthly$/u.test(url.searchParams.get('route')??'')&&/^TARIF AUSWÄHLEN$/iu.test(parsed.text(node));}catch{return false;}
  });
  if(prices.length!==1||actions.length!==1)continue;
  const amount=number(prices[0].text.match(/^(\d+(?:,\d{2})?)\s*€/u)?.[1]??'');if(amount===null)continue;
  rows.push({name,nameLocator:locator(parsed.body,headings[0].openEnd,headings[0].contentEnd),presentation:locator(parsed.body,card.start,card.end),charges:[{amount,currency:'EUR',cadence:'MONTHLY',billingCadence:'MONTHLY',consumer:true,relationship:'SUBSCRIPTION',role:'ORDINARY',monetaryKind:'SUBSCRIPTION_CHARGE',amountDerivation:'EXPLICIT',text:prices[0].text+'; '+parsed.text(actions[0])}]});
 }
 return rows.length>=2&&rows.length<=8&&new Set(rows.map(row=>comparable(row.name))).size===rows.length?rows:[];
}

// Spain's official Max page presents the selected monthly tab and sibling
// data-testid cards. Bind each ordinary price to its own purchase action.
function maxSpanishMonthlyCards(parsed,providerName,marketCurrencyHint){
 if(providerName!=='Max'||parsed.host!=='www.hbomax.com'||marketCurrencyHint!=='EUR'||!parsed.nodes.some(node=>node.tag==='html'&&node.attrs.lang==='es-ES'))return [];
 const tabs=parsed.nodes.filter(node=>node.tag==='button'&&node.attrs.role==='tab'&&node.attrs['aria-selected']==='true'&&!node.hidden);
 if(tabs.length!==1||tabs[0].attrs['aria-label']!=='mensual')return [];
 const containers=parsed.nodes.filter(node=>node.tag==='div'&&node.attrs['data-testid']==='plan-card-container'&&!node.hidden);
 if(containers.length!==1)return [];
 const cards=parsed.nodes.filter(node=>node.tag==='div'&&node.attrs['data-testid']==='plan-card'&&node.parent===containers[0]&&!node.hidden);
 const rows=[];
 for(const card of cards){
  const headings=parsed.nodes.filter(node=>node.attrs['data-testid']==='plan-card-title'&&ancestors(node).includes(card)&&!node.hidden);
  if(headings.length!==1)continue;
  const name=parsed.text(headings[0]);
  if(!name||name.length>80||nonStandalonePresentation(name,providerName)||/\bDAZN\b/iu.test(name))continue;
  const prices=parsed.nodes.filter(node=>node.attrs['data-testid']==='price-container'&&ancestors(node).includes(card)&&!node.hidden);
  if(prices.length!==1)continue;
  const price=parsed.text(prices[0]),match=/^(\d+(?:,\d{2})?)\s*€\s*\/\s*mes$/iu.exec(price);
  if(!match)continue;
  const amount=number(match[1]);if(amount===null)continue;
  const actions=parsed.nodes.filter(node=>node.tag==='a'&&ancestors(node).includes(card)&&!node.hidden).filter(node=>{
   try{const url=new URL(node.attrs.href.replaceAll('&amp;','&'));return url.hostname==='auth.hbomax.com'&&url.pathname==='/addon-picker'&&url.searchParams.get('pricePlanId')===card.attrs.id&&url.searchParams.get('flow')==='purchase'&&/^Seleccionar plan$/iu.test(parsed.text(node));}catch{return false;}
  });
  if(actions.length!==1)continue;
  rows.push({name,nameLocator:locator(parsed.body,headings[0].openEnd,headings[0].contentEnd),presentation:locator(parsed.body,card.start,card.end),charges:[{amount,currency:'EUR',cadence:'MONTHLY',billingCadence:'MONTHLY',consumer:true,relationship:'SUBSCRIPTION',role:'ORDINARY',monetaryKind:'SUBSCRIPTION_CHARGE',amountDerivation:'EXPLICIT',text:price+'; '+parsed.text(actions[0])}]});
 }
 return rows.length>=2&&rows.length<=8&&new Set(rows.map(row=>comparable(row.name))).size===rows.length?rows:[];
}

// A provider may ship complete plan cards in inert Next.js hydration data
// even when the initial DOM has no pricing cards. Read only a bounded JSON
// script, and bind each offer to its own exact lexical object in that script.
const hydrationMonthlyLabels=new Map([
 ['Monthly',{periodicity:'Monthly',period:'month'}],
 ['Mensal',{periodicity:'Por mês',period:'mês'}],
 ['miesięcznie',{periodicity:'Miesięcznie',period:'miesiąc'}],
]);
export const subscriptionExtractionVersion=1;
export const hydrationFieldBindings=Object.freeze({planIdentity:'pricePlan.id',planName:'productName.plainText',monthlyAmount:'price.amount.plainText',currency:'price.currencyCode',period:'price.period.plainText',periodicity:'periodicityText',purchaseAction:'ctas',market:'V3_SOURCE_BOUND_MARKET_EVIDENCE'});
export const htmlFieldBindings=Object.freeze({planIdentity:'offering.nameLocator',planName:'offering.nameLocator',monthlyAmount:'offering.charges[].text',currency:'offering.charges[].currency',period:'offering.charges[].billingCadence',periodicity:'offering.charges[].cadence',purchaseAction:'sourceBoundPresentation',market:'V3_SOURCE_BOUND_MARKET_EVIDENCE'});
export const htmlExtractionRules=Object.freeze(['MAX_HELP_PRICING_ROWS','MAX_GB_HELP_PRICING_ROWS','MAX_IE_HELP_PRICING_ROWS','MAX_MONTHLY_DIV_CARDS','MAX_SPANISH_MONTHLY_CARDS','HTML_PLAN_CARDS','HTML_PRICING_LIST','HTML_PRICING_TABLE']);
const extractionHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const extractionExact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===keys.sort().join('|');
export function validHydrationExtractionRecipe(value){
 if(!extractionExact(value,['version','rule','sourceFormat','collectionKey','monthlyCollectionLabel','collectionPath','fieldBindings','presentationHashes']))return false;
 if(value.version!==1||value.rule!=='NEXT_DATA_MAPPED_MONTHLY_PLAN_CARD'||value.sourceFormat!=='HYDRATED_JSON'||value.collectionPath!=='props.pageProps.mappedData.*.items.*[].content.planCard')return false;
 if(typeof value.collectionKey!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value.collectionKey)||/[a-f0-9]{32}/i.test(value.collectionKey))return false;
 if(!['Monthly','Mensal','miesięcznie'].includes(value.monthlyCollectionLabel)||!extractionExact(value.fieldBindings,Object.keys(hydrationFieldBindings))||Object.entries(hydrationFieldBindings).some(([key,field])=>value.fieldBindings[key]!==field))return false;
 return Array.isArray(value.presentationHashes)&&value.presentationHashes.length>=2&&value.presentationHashes.length<=8&&value.presentationHashes.every(extractionHash)&&new Set(value.presentationHashes).size===value.presentationHashes.length;
}
export function validHtmlExtractionRecipe(value){
 if(!extractionExact(value,['version','rule','sourceFormat','fieldBindings','presentationHashes']))return false;
 if(value.version!==1||value.sourceFormat!=='HTML'||!htmlExtractionRules.includes(value.rule)||!extractionExact(value.fieldBindings,Object.keys(htmlFieldBindings))||Object.entries(htmlFieldBindings).some(([key,field])=>value.fieldBindings[key]!==field))return false;
 return Array.isArray(value.presentationHashes)&&value.presentationHashes.length>=1&&value.presentationHashes.length<=16&&value.presentationHashes.every(extractionHash);
}
export const validExtractionRecipe=value=>validHydrationExtractionRecipe(value)||validHtmlExtractionRecipe(value);
function hydrationPlanCards(parsed,providerName,marketCurrencyHint,trace=null,preferred=null){
 if(!providerName||!marketCurrencyHint)return [];
 const scripts=[...parsed.body.matchAll(/<script\b([^>]*)>([^]*?)<\/script\s*>/giu)].filter(match=>{const a=attrs(match[1]);return a.id==='__NEXT_DATA__'&&a.type==='application/json';});
 if(scripts.length!==1)return [];
 const script=scripts[0],openEnd=script.index+script[0].indexOf('>')+1,raw=script[2];
 if(Buffer.byteLength(raw)>1_500_000)return [];
 let root;try{root=JSON.parse(raw);}catch{return [];}
 const mapped=root?.props?.pageProps?.mappedData;
 if(!mapped||typeof mapped!=='object'||Array.isArray(mapped))return [];
 const spans=[];
 for(const match of raw.matchAll(/"planCard"\s*:\s*\{/gu)){
  if(spans.length>=64)return [];
  const start=match.index+match[0].lastIndexOf('{');let depth=0,quoted=false,escape=false,end=-1;
  for(let i=start;i<raw.length&&i-start<=4096;i++){
   const c=raw[i];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue;}
   if(c==='"'){quoted=true;continue;}if(c==='{')depth++;else if(c==='}'&&!--depth){end=i+1;break;}
  }
  if(end<0)continue;
  try{spans.push({start:openEnd+start,end:openEnd+end,value:JSON.parse(raw.slice(start,end))});}catch{/* An incomplete object is not evidence. */}
 }
 const rows=[],seenPlans=new Map();
 for(const [collectionKey,collection] of Object.entries(mapped).slice(0,128)){
  if(preferred&&collectionKey!==preferred.collectionKey)continue;
  const groups=Object.entries(collection?.items??{}).filter(([label])=>hydrationMonthlyLabels.has(label)&&(!preferred||label===preferred.monthlyCollectionLabel));
  if(groups.length!==1)continue;
  const [label,items]=groups[0],cadence=hydrationMonthlyLabels.get(label);
  if(label!=='Monthly'&&(providerName!=='Max'||parsed.host!=='www.hbomax.com'))continue;
  if(!Array.isArray(items)||items.length<2||items.length>8)continue;
  const planIds=items.map(item=>item?.content?.planCard?.pricePlan?.id);
  if(planIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/u.test(id))||new Set(planIds).size!==planIds.length)continue;
  for(const [itemIndex,item] of items.entries()){
   const card=item?.content?.planCard,price=card?.price,name=card?.productName?.plainText,amount=number(String(price?.amount?.plainText??''));
   const action=card?.ctas?.find(cta=>
    (/^(?:select|choose|subscribe)(?:\s+(?:a\s+)?plan|\s+now)?$/iu.test(cta?.text??'')||label==='Mensal'&&cta?.text==='Selecionar plano')&&/(?:purchase|subscription|account-creation)/iu.test(cta?.code??'')||
    label==='miesięcznie'&&cta?.text==='Wybierz pakiet'&&cta?.code==='choose.plan.add-on');
   if(item?.collectionTitle!==label||card?.periodicityText!==cadence.periodicity||price?.period?.plainText!==cadence.period||!validCurrencies.has(price?.currencyCode)||price.currencyCode!==marketCurrencyHint||amount===null||amount<0||
    typeof name!=='string'||!name||name.length>80||nonStandalonePresentation(name,providerName)||!action||/\b(?:student|trial|introductory|promotion(?:al)?|discount|first month)\b/iu.test(JSON.stringify(card?.badge??'')+' '+name))continue;
   const matching=spans.filter(span=>JSON.stringify(span.value)===JSON.stringify(card));if(!matching.length)continue;
   const identity=card.pricePlan.id,facts=JSON.stringify([name,amount,price.currencyCode,label,action.text,action.code]);
   if(seenPlans.has(identity)){if(seenPlans.get(identity)!==facts)return [];continue;}
   const span=matching[0];
   const source=parsed.body.slice(span.start,span.end),productAt=source.indexOf('"productName"'),nameText='"plainText":'+JSON.stringify(name),nameAt=productAt<0?-1:source.indexOf(nameText,productAt),actionText='"text":'+JSON.stringify(action.text),actionAt=source.indexOf(actionText);
   if(nameAt<0||actionAt<0)continue;
   seenPlans.set(identity,facts);
   if(trace)trace.push({collectionKey,label,itemIndex,presentationSha256:locator(parsed.body,span.start,span.end).sha256});
   rows.push({name,nameLocator:locator(parsed.body,span.start+nameAt+12,span.start+nameAt+nameText.length),presentation:locator(parsed.body,span.start,span.end),actionLocator:locator(parsed.body,span.start+actionAt+7,span.start+actionAt+actionText.length),charges:[{amount,currency:price.currencyCode,cadence:'MONTHLY',billingCadence:'MONTHLY',consumer:true,relationship:'SUBSCRIPTION',role:'ORDINARY',monetaryKind:'SUBSCRIPTION_CHARGE',amountDerivation:'EXPLICIT',text:price.currencyCode+' '+price.amount.plainText+'/'+price.period.plainText+'; '+action.text}]});
  }
 }
 return rows.length>=2&&rows.length<=8&&new Set(rows.map(row=>comparable(row.name))).size===rows.length?rows:[];
}

function tracedHydrationRows(parsed,providerName,marketCurrencyHint,trace,hint){
 const rows=[];
 const ordinary=hydrationPlanCards(parsed,providerName,marketCurrencyHint,rows);
 if(trace)trace.hydrationRows=rows;
 if(!hint||hint.version!==subscriptionExtractionVersion||hint.rule!=='NEXT_DATA_MAPPED_MONTHLY_PLAN_CARD'||hint.sourceFormat!=='HYDRATED_JSON'||!hint.collectionKey||!hint.monthlyCollectionLabel){
  if(trace)trace.hintOutcome=hint?'INCOMPATIBLE':'NONE';
  return ordinary;
 }
 const preferredRows=[];
 const preferred=hydrationPlanCards(parsed,providerName,marketCurrencyHint,preferredRows,hint);
 // A learned collection may be tried first, but cannot change V3 candidates.
 // A changed layout or second collection falls back to the ordinary parser.
 const same=preferred.length>0&&JSON.stringify(preferred)===JSON.stringify(ordinary);
 if(trace)trace.hintOutcome=same?'APPLIED':'FALLBACK';
 return same?preferred:ordinary;
}

function replayHtmlRule(rule,parsed,providerName,currencyHint,marketCurrencyHint,url){
 switch(rule){
  case 'MAX_HELP_PRICING_ROWS':return maxHelpPricingRows(parsed,providerName,currencyHint,marketCurrencyHint);
  case 'MAX_GB_HELP_PRICING_ROWS':return maxGBHelpPricingRows(parsed,providerName,marketCurrencyHint,url);
  case 'MAX_IE_HELP_PRICING_ROWS':return maxIEHelpPricingRows(parsed,providerName,marketCurrencyHint,url);
  case 'MAX_MONTHLY_DIV_CARDS':return maxMonthlyDivCards(parsed,providerName,marketCurrencyHint);
  case 'MAX_SPANISH_MONTHLY_CARDS':return maxSpanishMonthlyCards(parsed,providerName,marketCurrencyHint);
  case 'HTML_PLAN_CARDS':return planCards(parsed,currencyHint,marketCurrencyHint);
  case 'HTML_PRICING_LIST':return pricingLists(parsed,currencyHint,marketCurrencyHint);
  case 'HTML_PRICING_TABLE':return pricingTables(parsed,currencyHint,providerName,marketCurrencyHint);
  default:return [];
 }
}

function hydrationPlanIdentity(parsed,providerName,offerings){
 if(!offerings.length||!providerName)return null;
 const fields=fieldRows(parsed),title=uniqueRow(fields.filter(row=>row.kind==='TITLE')),openGraph=uniqueRow(fields.filter(row=>row.kind==='OG:TITLE'));
 if(!title||!openGraph||comparable(title.value)!==comparable(openGraph.value)||!exactWord(title.value,providerName))return null;
 const identity=exactLocator(parsed,title,providerName),subscription=offerings[0].actionLocator;
 return identity&&subscription?{name:providerName,type:'Service',identity,subscription:{kind:'EXPLICIT_SUBSCRIPTION',locator:subscription},support:['PAGE_TITLE','OPEN_GRAPH_TITLE','SOURCE_BOUND_PLAN_PURCHASE_ACTION']}:null;
}

function maxSourceIdentity(parsed,providerName,offerings){
 if(providerName!=='Max'||offerings.length<2||!['help.hbomax.com','www.hbomax.com'].includes(parsed.host))return null;
 const title=uniqueRow(fieldRows(parsed).filter(row=>row.kind==='TITLE'));
 if(!title||!exactWord(title.value,'HBO Max'))return null;
 const spanish=parsed.host==='www.hbomax.com'&&parsed.nodes.some(node=>node.tag==='html'&&node.attrs.lang==='es-ES');
 const statement=parsed.segments.find(row=>parsed.host==='help.hbomax.com'?/\bYou can subscribe to HBO Max\b/iu.test(row.text):spanish?/\bplanes de HBO Max\b/iu.test(row.text):/Wähle einen unserer HBO Max Tarife\b/iu.test(row.text));
 if(!statement)return null;
 const relation=parsed.host==='help.hbomax.com'?/subscribe/iu.exec(statement.text):spanish?/planes/iu.exec(statement.text):/Tarife/iu.exec(statement.text);
 const source=parsed.body.slice(statement.start,statement.end),at=relation&&source.indexOf(relation[0]);
 const identity=exactLocator(parsed,title,'Max');if(!identity||!relation||at<0)return null;
 return {name:'Max',type:'Service',identity,subscription:{kind:'EXPLICIT_SUBSCRIPTION',locator:locator(parsed.body,statement.start+at,statement.start+at+relation[0].length)},support:['PAGE_TITLE','PROVIDER_PLAN_RELATIONSHIP']};
}

function enrichFromProse(parsed,offerings){
 for(const segment of parsed.segments){const sentences=segment.text.split(/(?<=[.!?])\s+/u);for(const sentence of sentences){const owners=offerings.filter(o=>exactWord(sentence,o.name));if(owners.length!==1)continue;for(const charge of charges(sentence)){const key=[charge.amount,charge.currency,charge.cadence,charge.role].join('|'),at=owners[0].charges.findIndex(row=>[row.amount,row.currency,row.cadence,row.role].join('|')===key),composition=locator(parsed.body,segment.start,segment.end);if(at<0)owners[0].charges.push({...charge,prose:true,composition});else if(owners[0].charges[at].billingCadence==='UNKNOWN'&&charge.billingCadence!=='UNKNOWN')owners[0].charges[at]={...owners[0].charges[at],billingCadence:charge.billingCadence,amountDerivation:charge.amountDerivation,composition};}}
 }
}

export function interpretSubscriptionPage({body,url,providerName=null,currencyHint=null,marketCurrencyHint=null,extractionHint=null,extractionTrace=null}){
 if(typeof body!=='string'||!body)return {services:[],offerings:[],limited:false};let maxSpanishSource=false;try{maxSpanishSource=providerName==='Max'&&new URL(url).hostname==='www.hbomax.com'&&/<html\b[^>]*\blang=["']es-ES["']/iu.test(body.slice(0,2048));}catch{/* Invalid URLs use the ordinary parser. */}const parsed=parse(body,url,{maskScripts:maxSpanishSource}),maxHelpRows=maxHelpPricingRows(parsed,providerName,currencyHint,marketCurrencyHint),maxGBRows=maxGBHelpPricingRows(parsed,providerName,marketCurrencyHint,url),maxIERows=maxIEHelpPricingRows(parsed,providerName,marketCurrencyHint,url),maxDivRows=maxMonthlyDivCards(parsed,providerName,marketCurrencyHint),maxSpanishRows=maxSpanishMonthlyCards(parsed,providerName,marketCurrencyHint),maxRows=[...maxHelpRows,...maxGBRows,...maxIERows,...maxDivRows,...maxSpanishRows],hydrationRows=maxRows.length?[]:tracedHydrationRows(parsed,providerName,marketCurrencyHint,extractionTrace,extractionHint),cards=maxRows.length||hydrationRows.length?[]:planCards(parsed,currencyHint,marketCurrencyHint),lists=maxRows.length||hydrationRows.length||cards.length?[]:pricingLists(parsed,currencyHint,marketCurrencyHint),tables=maxRows.length||hydrationRows.length||cards.length||lists.length?[]:pricingTables(parsed,currencyHint,providerName,marketCurrencyHint),components=componentIdentities(parsed,providerName),planServices=planPageIdentities(parsed,cards.length>0),presented=maxSourceIdentity(parsed,providerName,maxRows)??hydrationPlanIdentity(parsed,providerName,hydrationRows)??pagePresentationIdentity(parsed,providerName)??nativePlanPresentationIdentity(parsed,providerName)??pricingPageIdentity(parsed,providerName,lists)??pricingTableIdentity(parsed,providerName,tables),services=components.length?components:planServices.length?planServices:presented?[presented]:[],offerings=[...maxRows,...hydrationRows,...cards.map(card=>({name:card.name,nameLocator:locator(body,card.nameNode.openEnd,card.nameNode.contentEnd),presentation:locator(body,card.node.start,card.node.end),charges:card.charges})),...lists,...tables].filter(row=>!nonStandalonePresentation(row.name,providerName));enrichFromProse(parsed,offerings.filter(row=>!maxRows.includes(row)&&!hydrationRows.includes(row)&&!tables.includes(row)));
 if(extractionTrace){
  const maxRules=[['MAX_HELP_PRICING_ROWS',maxHelpRows],['MAX_GB_HELP_PRICING_ROWS',maxGBRows],['MAX_IE_HELP_PRICING_ROWS',maxIERows],['MAX_MONTHLY_DIV_CARDS',maxDivRows],['MAX_SPANISH_MONTHLY_CARDS',maxSpanishRows]].filter(([,rows])=>rows.length);
  const rule=maxRows.length?(maxRules.length===1?maxRules[0][0]:null):hydrationRows.length?'NEXT_DATA_MAPPED_MONTHLY_PLAN_CARD':cards.length?'HTML_PLAN_CARDS':lists.length?'HTML_PRICING_LIST':tables.length?'HTML_PRICING_TABLE':null;
  if(extractionHint?.sourceFormat==='HTML'){
   const selected=maxRows.length?maxRows:cards.length?cards:lists.length?lists:tables;
   extractionTrace.hintOutcome=rule===extractionHint.rule&&validHtmlExtractionRecipe(extractionHint)&&JSON.stringify(replayHtmlRule(rule,parsed,providerName,currencyHint,marketCurrencyHint,url))===JSON.stringify(selected)?'APPLIED':'FALLBACK';
  }
  if(rule&&offerings.length){
   const hydration=rule==='NEXT_DATA_MAPPED_MONTHLY_PLAN_CARD',rows=extractionTrace.hydrationRows??[];
   extractionTrace.recipe={version:subscriptionExtractionVersion,rule,sourceFormat:hydration?'HYDRATED_JSON':'HTML',
    ...(hydration&&rows.length&&rows.every(row=>row.collectionKey===rows[0].collectionKey&&row.label===rows[0].label)?{collectionKey:rows[0].collectionKey,monthlyCollectionLabel:rows[0].label,collectionPath:'props.pageProps.mappedData.*.items.*[].content.planCard',fieldBindings:hydrationFieldBindings}:!hydration?{fieldBindings:htmlFieldBindings}:{}),
    presentationHashes:offerings.map(row=>row.presentation.sha256)};
  }
  delete extractionTrace.hydrationRows;
 }
 return {services,offerings,limited:parsed.limited};
}
