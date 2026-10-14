// Small deterministic interpretation of ordinary subscription pages. A
// Service may come from a coherent page/component product presentation or a
// page identity with sibling plan cards; headings and money alone are never
// promoted into Services or offerings.
import {digest} from './model.mjs';

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

function parse(body,url){
 let host=null;try{host=new URL(url).hostname;}catch{}
 const root={tag:'#document',start:0,openEnd:0,contentEnd:body.length,end:body.length,parent:null,attrs:{},hidden:false},nodes=[],segments=[],stack=[root];let cursor=0,tokens=0,limited=false;
 const token=/<!--[^]*?-->|<\/?([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/giu;
 const add=end=>{if(end<=cursor)return;const parent=stack.at(-1),raw=body.slice(cursor,end),text=normalized(raw);if(text&&!parent.hidden)segments.push({start:cursor,end,text,parent});};
 for(let match;(match=token.exec(body));){if(++tokens>131072){limited=true;break;}add(match.index);cursor=token.lastIndex;if(!match[1])continue;
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
  if(node.tag==='title'){const value=parsed.text(node);if(value)rows.push({kind:'TITLE',value,node,start:node.openEnd,end:node.contentEnd});}
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

const symbolCurrency=new Map([['€','EUR'],['£','GBP'],['¥','JPY'],['CA$','CAD'],['A$','AUD'],['US$','USD']]);
function number(raw){const value=raw.replace(/[\u00a0\u202f ]/gu,'');if(/^\d+$/.test(value))return Number(value);if(/^\d+[.,]\d{1,2}$/.test(value))return Number(value.replace(',','.'));if(/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(value))return Number(value.replaceAll(',',''));if(/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(value))return Number(value.replaceAll('.','').replace(',','.'));return null;}
const money=/((?:[A-Z]{3}|CA\$|A\$|US\$|[$€£¥])\s*)?(\d+(?:[ .\u00a0\u202f]\d{3})*(?:[.,]\d{1,2})?)\s*((?:[A-Z]{3}|[$€£¥]))?/gu;
function charges(text){
 const rows=[];for(const match of text.matchAll(money)){const mark=normalized((match[1]??'')||(match[3]??'')),currency=/^[A-Z]{3}$/.test(mark)?mark:symbolCurrency.get(mark)??null;if(!currency)continue;const amount=number(match[2]);if(amount===null)continue;
  const after=text.slice(match.index+match[0].length,match.index+match[0].length+48),cadenceMatch=after.match(/^\s*(?:(?:\/|per\s+|a\s+|each\s+|every\s+)\s*)?(months?|monthly|mo\b|years?|yearly|annually|annual\b|yr\b)/iu);if(!cadenceMatch)continue;const cadence=/month|monthly|\bmo\b/iu.test(cadenceMatch[1])?'MONTHLY':'YEARLY',left=Math.max(0,match.index-64),right=Math.min(text.length,match.index+match[0].length+cadenceMatch[0].length+96),context=text.slice(left,right),trial=/\b(?:trial|introductory|first\s+(?:month|\d+\s+months?))\b/iu.test(context),nonCharge=/\b(?:save|saving|discount|credit|benefit|worth|value)\b[^.;]{0,32}$/iu.test(text.slice(left,match.index));if(nonCharge)continue;
  const billing=[...context.matchAll(/\b(?:billed|billing|charged|paid|pay|payment(?:s)?)\s+(?:[^.;]{0,32}?)(monthly|yearly|annually|every month|every year|per month|per year)\b|\b(monthly|yearly|annual)\s+(?:billing|payments?)\b/giu)].map(m=>/month/iu.test(m[1]??m[2])?'MONTHLY':'YEARLY'),prefix=text.slice(Math.max(0,match.index-32),match.index),stated=/(?:\bis\b|\bcosts?\b|\bpriced\s+at\b|\bor\b)\s*$/iu.test(prefix)?cadence:null,unique=[...new Set([...billing,...(stated?[stated]:[])])];
  const billingCadence=unique.length===1?unique[0]:'UNKNOWN';rows.push({amount,currency,cadence,billingCadence,consumer:true,relationship:'SUBSCRIPTION',role:trial?'TRIAL':'ORDINARY',monetaryKind:trial?'TRIAL_CHARGE':'SUBSCRIPTION_CHARGE',amountDerivation:billingCadence!=='UNKNOWN'&&billingCadence!==cadence?'ARITHMETIC':'EXPLICIT',text:match[0]+cadenceMatch[0]});
 }
 return rows;
}

function localCharges(parsed,node){
 const segments=parsed.within(node),rows=[];
 for(let index=0;index<segments.length;index++)for(let width=1;width<=3&&index+width<=segments.length;width++){
  const text=segments.slice(index,index+width).map(row=>row.text).join(' ');for(const charge of charges(text)){const key=[charge.amount,charge.currency,charge.cadence,charge.role].join('|'),at=rows.findIndex(row=>[row.amount,row.currency,row.cadence,row.role].join('|')===key);if(at<0)rows.push(charge);else if(rows[at].billingCadence==='UNKNOWN'&&charge.billingCadence!=='UNKNOWN')rows[at]=charge;}
 }
 return rows;
}

function planCards(parsed){
 const cards=[];
 for(const node of parsed.nodes){if(node.hidden||!(node.tag==='article'||/(?:^|\/)(?:Offer|Product)$/i.test(node.attrs.itemtype??''))||ancestors(node).some(a=>peripheral.has(a.tag)))continue;
  const headings=parsed.nodes.filter(h=>/^h[2-4]$/.test(h.tag)&&h.start>=node.openEnd&&h.end<=node.contentEnd&&!h.hidden&&!ancestors(h).some(a=>a!==node&&a.tag==='article')),names=[...new Set(headings.map(h=>parsed.text(h)).filter(name=>name&&name.length<=80))];if(names.length!==1)continue;
  const own=localCharges(parsed,node);if(!own.length)continue;cards.push({node,name:names[0],nameNode:headings[0],charges:own});
 }
 const groups=new Map();for(const card of cards){const key=card.node.parent?.start??-1,rows=groups.get(key)??[];rows.push(card);groups.set(key,rows);}
 return [...groups.values()].filter(rows=>rows.length>=2||rows[0].node.attrs.itemtype).flat();
}

function enrichFromProse(parsed,offerings){
 for(const segment of parsed.segments){const sentences=segment.text.split(/(?<=[.!?])\s+/u);for(const sentence of sentences){const owners=offerings.filter(o=>exactWord(sentence,o.name));if(owners.length!==1)continue;for(const charge of charges(sentence)){const key=[charge.amount,charge.currency,charge.cadence,charge.role].join('|'),at=owners[0].charges.findIndex(row=>[row.amount,row.currency,row.cadence,row.role].join('|')===key),composition=locator(parsed.body,segment.start,segment.end);if(at<0)owners[0].charges.push({...charge,prose:true,composition});else if(owners[0].charges[at].billingCadence==='UNKNOWN'&&charge.billingCadence!=='UNKNOWN')owners[0].charges[at]={...owners[0].charges[at],billingCadence:charge.billingCadence,amountDerivation:charge.amountDerivation,composition};}}
 }
}

export function interpretSubscriptionPage({body,url,providerName=null}){
 if(typeof body!=='string'||!body)return {services:[],offerings:[],limited:false};const parsed=parse(body,url),cards=planCards(parsed),components=componentIdentities(parsed,providerName),planServices=planPageIdentities(parsed,cards.length>0),presented=pagePresentationIdentity(parsed,providerName)??nativePlanPresentationIdentity(parsed,providerName),services=components.length?components:planServices.length?planServices:presented?[presented]:[],offerings=cards.map(card=>({name:card.name,nameLocator:locator(body,card.nameNode.openEnd,card.nameNode.contentEnd),presentation:locator(body,card.node.start,card.node.end),charges:card.charges}));enrichFromProse(parsed,offerings);
 return {services,offerings,limited:parsed.limited};
}
