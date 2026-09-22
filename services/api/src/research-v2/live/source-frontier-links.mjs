// Pure, bounded source-link interpretation. No script execution, fetch or verification imports.
export const decodeEntities=s=>String(s??'').replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,(m,k)=>k[0]==='#'?String.fromCodePoint(Math.min(0x10ffff,parseInt(k.slice(k[1].toLowerCase()==='x'?2:1),k[1].toLowerCase()==='x'?16:10))):({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[k.toLowerCase()]));
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:-]{1,128})\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m=>[m[1].toLowerCase(),decodeEntities(m[2]??m[3]??m[4])]));
export function sourceLinks(body,{maxBytes=8000000,maxLinks=2000,maxJsonNodes=20000}={}){
 const links=[],stops=[];if(typeof body!=='string'||Buffer.byteLength(body)>maxBytes)return {links,stops:['SOURCE_SCAN_BYTE_LIMIT']};
 const add=(url,mechanism,reference,label='',locale=null)=>{if(links.length>=maxLinks){if(!stops.includes('SOURCE_LINK_LIMIT'))stops.push('SOURCE_LINK_LIMIT');return false;}links.push({url:decodeEntities(url),mechanism,reference,label:String(label).slice(0,1200).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').slice(0,300),locale});return true;};
 let nodes=0;function json(raw,ref){let v;try{v=JSON.parse(raw);}catch{return;}const stack=[[v,'$',0]];while(stack.length){const[v,p,d]=stack.pop();if(++nodes>maxJsonNodes){stops.push('JSON_NODE_LIMIT');break;}if(d>40){stops.push('JSON_DEPTH_LIMIT');continue;}if(!v||typeof v!=='object')continue;for(const[k,x]of Object.entries(v)){const ptr=p+'/'+k.replaceAll('~','~0').replaceAll('/','~1');if(typeof x==='string'&&/^(?:url|href|@id|endpoint|pricingUrl|subscriptionUrl|checkoutUrl|apiUrl|configUrl|contentUrl)$/i.test(k)&&/^(?:https:\/\/|\/[^/]|\.\.?\/)/.test(x))add(x,'STRUCTURED_URL',{...ref,jsonPointer:ptr},[v.name,v.label,v.title,k].filter(y=>typeof y==='string').join(' '),v.inLanguage??v.locale??null);else if(x&&typeof x==='object')stack.push([x,ptr,d+1]);}}}
 if(/^\s*[\[{]/.test(body))json(body,{offset:0,length:body.length});
 // Comments and raw script/style contents are consumed atomically, preventing fake anchors in strings.
 const tags=/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<(a|link|form|option)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
 for(const m of body.matchAll(tags)){if(links.length>=maxLinks){stops.push('SOURCE_LINK_LIMIT');break;}const ref={offset:m.index,length:m[0].length,coordinate:'UTF16_CODE_UNITS'};if(/^<script\b/i.test(m[0])){const start=m[0].indexOf('>')+1,raw=m[0].slice(start,m[0].lastIndexOf('</'));json(raw,{offset:m.index+start,length:raw.length});continue;}if(!m[1])continue;const a=attrs(m[0]),tag=m[1].toLowerCase(),close=body.indexOf('</'+tag,m.index+m[0].length),label=body.slice(m.index+m[0].length,close>=0?Math.min(close,m.index+1000):m.index+m[0].length);
 if(tag==='a'&&a.href)add(a.href,'ANCHOR',ref,label,a.hreflang);
 if(tag==='link'&&a.href&&/\b(canonical|alternate)\b/i.test(a.rel??''))add(a.href,'PROVIDER_CANONICAL_OR_LOCALE',ref,a.rel,a.hreflang);
 if(tag==='link'&&a.href&&a.type==='application/json')add(a.href,'JSON_LINK',ref,a.rel);
 if(tag==='form'&&a.action){if((a.method??'get').toLowerCase()==='get')add(a.action,'FORM_GET_READ_ONLY',ref,[a['aria-label'],a.id].filter(Boolean).join(' '));else stops.push('NON_GET_FORM_IGNORED');}
 if(tag==='option'&&a.value&&/^(https:\/\/|\/[^/])/.test(a.value))add(a.value,'COUNTRY_SELECTOR',ref,label,a.lang);
 }
 return {links,stops:[...new Set(stops)].sort()};
}
