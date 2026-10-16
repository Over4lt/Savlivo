// Inert, source-visible schema records only. Never execute script or infer
// semantic propositions from keys. Original escaped bytes remain the citations.
import {embeddedState,parseDataLiteral} from './embedded-state.mjs';
export const structuredMaterialCapacity=Object.freeze({scripts:32,scriptBytes:262144,records:256,recordBytes:4096,tokens:131072});
export function structuredMaterial(body){
 const regions=[];let limited=false,scripts=0,tokens=0;
 for(const script of body.matchAll(/<script\b[^>]*>([^]*?)<\/script\s*>/gi)){
  const raw=script[1],base=script.index+script[0].indexOf('>')+1;
  if(!raw.includes('@type'))continue;
  if(++scripts>structuredMaterialCapacity.scripts){limited=true;break;}
  if(Buffer.byteLength(raw)>structuredMaterialCapacity.scriptBytes){limited=true;continue;}
  // Both ordinary JSON and JSON strings in inert transport scripts can expose
  // schema records. Braces are only located here; JSON.parse validates each.
  const stack=[];
  for(let i=0;i<raw.length;i++){
   if(++tokens>structuredMaterialCapacity.tokens){limited=true;break;}
   if(raw[i]==='{')stack.push(i);
   if(raw[i]!=='}'||!stack.length)continue;
   const start=stack.pop(),slice=raw.slice(start,i+1);if(Buffer.byteLength(slice)>structuredMaterialCapacity.recordBytes)continue;
   let value;try{value=JSON.parse(slice);}catch{try{value=JSON.parse(JSON.parse('"'+slice+'"'));}catch{continue;}}
   const types=Array.isArray(value?.['@type'])?value['@type']:[value?.['@type']];
   const type=types.find(t=>['Product','Service','Offer','AggregateOffer','UnitPriceSpecification'].includes(t));if(!type)continue;
   regions.push({start:base+start,end:base+i+1,type});if(regions.length>=structuredMaterialCapacity.records){limited=true;break;}
  }
  if(regions.length>=structuredMaterialCapacity.records||tokens>structuredMaterialCapacity.tokens)break;
 }
 // A complete bounded parent preserves price/benefit/billing relationships.
 // No overlapping duplicate segments or reconstructed strings are introduced.
 const selected=regions.sort((a,b)=>(b.end-b.start)-(a.end-a.start)).filter((r,i,all)=>!all.slice(0,i).some(p=>r.start>=p.start&&r.end<=p.end));
 return {regions:selected.sort((a,b)=>a.start-b.start),limited};
}

// Parse complete inert JSON, recording original lexical spans and JSON pointers.
// Numeric/key relevance is a routing signal, never an evidence proposition.
export function structuredSources(body,contentType='text/html') {
 const islands=[],records=[],endpoints=[];let limited=false;
 if(['application/json','application/ld+json'].includes(contentType))islands.push({raw:body,start:0});
 else for(const m of body.matchAll(/<script\b([^>]*)>([^]*?)<\/script\s*>/gi)) {
  if(!/\btype\s*=\s*["']application\/(?:ld\+)?json["']|\bid\s*=\s*["'](?:__NEXT_DATA__|__NUXT_DATA__)["']/i.test(m[1]))continue;
  if(islands.length>=structuredMaterialCapacity.scripts){limited=true;break;}
  islands.push({raw:m[2],start:m.index+m[0].indexOf('>')+1});
 }
 for(const island of islands) {
  if(Buffer.byteLength(island.raw)>structuredMaterialCapacity.scriptBytes){limited=true;continue;}
  try{JSON.parse(island.raw);}catch{continue;}
  let i=0,nodes=0;
  const ws=()=>{while(/\s/.test(island.raw[i]??'')&&i<island.raw.length)i++;};
  const string=()=>{const start=i++;while(i<island.raw.length){if(island.raw[i++]==='"')break;if(island.raw[i-1]==='\\')i++;}return JSON.parse(island.raw.slice(start,i));};
  const read=(pointer,depth)=>{
   ws();const start=i;if(++nodes>4096||depth>32||pointer.length>2048)throw Error('BOUND');const ch=island.raw[i];
   if(ch==='{'||ch==='['){
    i++;ws();let count=0;
    while(island.raw[i]!== (ch==='{'?'}':']')) {
     let key;if(ch==='{'){key=string();ws();i++;}else key=String(count);
     read(pointer+'/'+key.replaceAll('~','~0').replaceAll('/','~1'),depth+1);count++;ws();if(island.raw[i]===','){i++;ws();}else break;
    }
    i++;const raw=island.raw.slice(start,i);
    if(ch==='{'&&Buffer.byteLength(raw)<=structuredMaterialCapacity.recordBytes&&/\p{N}/u.test(raw)&&(/(?:price|amount|currency|billing|payment|renewal|cost|credit|benefit|offer|plan|subscription|recurr|membership)/i.test(raw)||/\p{Sc}|"[A-Z]{3}"/u.test(raw))){const record={start:island.start+start,end:island.start+i,type:'StructuredObject',pointer,parent:pointer.slice(0,pointer.lastIndexOf('/')),routingOnly:true,priority:(raw.match(/currency|payment|billing|renewal|effectiveCost|price/gi)??[]).length};if(records.length<structuredMaterialCapacity.records)records.push(record);else{limited=true;const lowest=records.reduce((n,r,j)=>r.priority<records[n].priority?j:n,0);if(record.priority>records[lowest].priority)records.splice(lowest,1,record);}}
   }else if(ch==='"'){
    const value=string();if(/\/(?:url|href|endpoint|apiUrl|configUrl|pricingUrl|subscriptionUrl|contentUrl)$/i.test(pointer)&&/^(?:https:\/\/|\/)/.test(value)&&endpoints.length<256)endpoints.push({url:value,start:island.start+start,end:island.start+i,pointer});
   }else{while(i<island.raw.length&&!/[\s,}\]]/.test(island.raw[i]))i++;}
  };
  try{read('',0);}catch{limited=true;}
 }
 if(!['application/json','application/ld+json','text/plain'].includes(contentType)) {
  const embedded=embeddedState(body);limited ||= embedded.limited;
  for(const root of embedded.roots)for(const node of root.nodes) {
   const raw=body.slice(node.start,node.end);
   if(Array.isArray(node.value)||Buffer.byteLength(raw)>structuredMaterialCapacity.recordBytes||offeringRoutingValue(raw)<4)continue;
   const pointer='/embedded-'+root.root.start+node.path;
   const record={start:node.start,end:node.end,type:'StructuredObject',pointer,parent:pointer.slice(0,pointer.lastIndexOf('/')),routingOnly:true,priority:offeringRoutingValue(raw),embedded:{representation:'STATIC_DATA_LITERAL',binding:root.binding,script:root.script,declaration:root.declaration,root:root.root,rootComplete:root.complete,unsupported:root.unsupported,numericSpans:root.numericSpans.filter(s=>s.start>=node.start&&s.end<=node.end)}};
   if(records.some(r=>r.start===record.start&&r.end===record.end))continue;
   if(records.length<structuredMaterialCapacity.records)records.push(record);
   else{limited=true;const lowest=records.reduce((n,r,j)=>r.priority<records[n].priority?j:n,0);if(record.priority>records[lowest].priority)records.splice(lowest,1,record);}
  }
 }
 const scored=records.map(r=>({...r,routingValue:offeringRoutingValue(body.slice(r.start,r.end))}));
 const independent=scored.filter(r=>!scored.some(c=>c!==r&&c.start>=r.start&&c.end<=r.end&&c.routingValue>r.routingValue));
 const regions=independent.sort((a,b)=>(b.end-b.start)-(a.end-a.start)).filter((r,i,all)=>!all.slice(0,i).some(p=>r.start>=p.start&&r.end<=p.end)).slice(0,structuredMaterialCapacity.records).sort((a,b)=>a.start-b.start);
 return {regions,records,endpoints,limited:limited||records.length>structuredMaterialCapacity.records};
}

// Routing signals, never semantic assertions. Inspect one source-local object,
// not its neighbours: repeated page metadata must not outrank an offer region.
export function offeringRoutingValue(text) {
    let value;try{value=JSON.parse(text);}catch{value=parseDataLiteral(text);}
    if(!value||Array.isArray(value)||typeof value!=='object')return 0;
    const entries=Object.entries(value),keys=entries.map(([k])=>k.replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase());
    const recurring=entries.some(([k,v])=>v===true&&/recurr|subscription|membership/i.test(k));
    const monetary=keys.some(k=>/price|payment|billing|cost/.test(k));
    const identity=keys.some(k=>/name|title|header|identifier/.test(k));
    const action=keys.some(k=>/action|button|purchase|checkout/.test(k));
    const peripheral=keys.some(k=>/credit|benefit|saving|tax|analytics/.test(k));
    // A coherent wrapper may bind one product-like child to distinct monetary
    // role objects. Prefer it over stripping the child from taxes/incentives.
    const productChildren=entries.filter(([,v])=>v&&!Array.isArray(v)&&typeof v==='object'&&Object.keys(v).some(k=>/name|title|identifier/i.test(k))&&Object.entries(v).some(([k,x])=>x!==null&&(/price|cost|charge|amount/i.test(k)&&['string','number','object'].includes(typeof x)||/subscription|billing|payment|cadence|term|recurr/i.test(k)&&typeof x==='object')));
    const relatedMoney=keys.filter(k=>/amount|subtotal|total|tax|price|payment|billing/i.test(k)).length;
    const wrapper=productChildren.length===1&&relatedMoney>=2?12:0;
    return Math.max(wrapper,(recurring?8:0)+(monetary?4:0)+(identity?2:0)+(action?1:0)-(peripheral&&!monetary?4:0));
}
