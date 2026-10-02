// Source-visible controls are research metadata. No script execution, inferred
// routes, price assertions, market assertions, or POST submissions.
import {digest,normalizeUrl} from './model.mjs';
export const stateCapacity=Object.freeze({tokens:131072,depth:128,controls:512,groups:128,variants:64,fields:24,contextSegments:16,labelBytes:1024});
const cache=new WeakMap();
const decode=s=>s.replace(/&(?:amp|quot|apos|lt|gt);/g,m=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'}[m]));
const attributes=s=>{const out={};for(const m of s.matchAll(/([^\s=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)){const key=m[1].toLowerCase();if(!key.startsWith('<'))out[key]=decode(m[2]??m[3]??m[4]??'');}return out;};
const money=s=>/\p{Sc}\s*\p{N}|\b[A-Z]{3}\s*\d|\d[\d.,]*\s*(?:\p{Sc}|[A-Z]{3}\b)/u.test(s);
const voids=new Set(['input','img','br','hr','meta','link','area','base','embed','wbr','source','param','col','track']);
export function providerStates(o) {
 if(!['text/html','application/xhtml+xml'].includes(o.contentType)||o.truncated||o.completeness==='INCOMPLETE')return {groups:[],limited:false};
 const old=cache.get(o);if(old?.body===o.body&&old.sha256===o.sha256&&old.id===o.id)return old.value;
 if(o.sha256!==digest(o.body))return {groups:[],limited:false};
 const nodes=[],stack=[],controls=[];let limited=false,count=0;
 const token=/<!--[^]*?-->|<\/?([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
 for(let m;(m=token.exec(o.body));){
  if(++count>stateCapacity.tokens){limited=true;break;}if(!m[1])continue;
  const tag=m[1].toLowerCase();if(m[0][1]==='/'){const i=stack.findLastIndex(n=>n.tag===tag);if(i>=0){for(const n of stack.slice(i))n.end=token.lastIndex;stack.length=i;}continue;}
  if(['script','style','template','textarea'].includes(tag)){const end=new RegExp('</'+tag+'\\s*>','gi');end.lastIndex=token.lastIndex;const close=end.exec(o.body);token.lastIndex=close?end.lastIndex:o.body.length;continue;}
  const attrs=attributes(m[0].slice(tag.length+1,-1)),n={tag,attrs,start:m.index,openEnd:token.lastIndex,end:token.lastIndex,parent:stack.at(-1)??null};nodes.push(n);
  if(tag==='input'&&['radio','checkbox'].includes((attrs.type??'').toLowerCase())||tag==='option'||tag==='button'&&attrs.name&&attrs.value!==undefined||['tab','radio','checkbox'].includes(attrs.role)||attrs['aria-current']!==undefined||attrs['aria-pressed']!==undefined){
   if(controls.length<stateCapacity.controls)controls.push(n);else limited=true;
  }
  if(!voids.has(tag)&&!m[0].endsWith('/>')){if(stack.length>=stateCapacity.depth){limited=true;break;}stack.push(n);}
 }
 for(const n of stack)n.end=o.body.length;
 const labels=new Map(nodes.filter(n=>n.tag==='label'&&n.attrs.for).map(n=>[n.attrs.for,n])),formFields=new Map();
 const ancestors=n=>{const rows=[];for(let p=n.parent;p;p=p.parent)rows.push(p);return rows;};
 const labelSpans=n=>{
  const opening=o.body.slice(n.start,n.openEnd),aria=opening.match(/\baria-label\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  if(aria){const raw=aria[1]??aria[2];if(Buffer.byteLength(raw)>stateCapacity.labelBytes)limited=true;const start=n.start+aria.index+aria[0].indexOf(raw);return [{start,end:start+raw.length}];}
  const linked=n.attrs.id?labels.get(n.attrs.id):null;
  const enclosing=ancestors(n).find(x=>x.tag==='label'),owner=linked??enclosing??(n.tag==='option'||n.tag==='button'||n.tag==='a'?n:null);
  const start=owner?owner.openEnd:n.openEnd,end=owner?owner.end:o.body.indexOf('<',start);
  const spans=[];const part=o.body.slice(start,end<0?o.body.length:end);let cursor=start;
  for(const m of part.matchAll(/<[^>]*>/g)){if(o.body.slice(cursor,start+m.index).trim())spans.push({start:cursor,end:start+m.index});cursor=start+m.index+m[0].length;}
  if(o.body.slice(cursor,end).trim())spans.push({start:cursor,end});
  if(spans.length>4||spans.some(s=>Buffer.byteLength(o.body.slice(s.start,s.end))>stateCapacity.labelBytes))limited=true;
  return spans.filter(s=>s.end>s.start).slice(0,4);
 };
 const groups=new Map();
 for(const n of controls){
  const type=(n.attrs.type??'').toLowerCase(),parents=ancestors(n),form=parents.find(x=>x.tag==='form'),select=parents.find(x=>x.tag==='select'),roleGroup=parents.find(x=>['tablist','radiogroup','group'].includes(x.attrs.role));
  const eligible=['radio','checkbox'].includes(type)||n.tag==='option'||['tab','radio','checkbox'].includes(n.attrs.role)||n.attrs['aria-pressed']!==undefined||n.tag==='button'&&n.attrs.name&&n.attrs.value!==undefined||n.tag==='a'&&(n.attrs['aria-current']!==undefined||roleGroup);
  if(!eligible)continue;
  const identity=n.attrs.name??select?.attrs.name??null;
  if(parents.some(p=>Object.hasOwn(p.attrs,'hidden')||p.attrs['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attrs.style??'')))continue;
  const related=identity?controls.filter(c=>c.attrs.name===identity&&ancestors(c).find(x=>x.tag==='form')===form):[];
  const common=related.length>1?parents.find(p=>related.every(c=>c.start>=p.start&&c.end<=p.end)):null;
  const root=select??roleGroup??form??common??parents.find(p=>p.tag!=='label');if(!root)continue;
  const key=[root.start,identity??n.attrs.role??type].join(':');
  if(!groups.has(key)){if(groups.size>=stateCapacity.groups){limited=true;break;}groups.set(key,{id:'state-'+digest([o.id,o.sha256,key]).slice(0,24),root,form,variants:[]});}
  const group=groups.get(key),spans=labelSpans(n),selected=Object.hasOwn(n.attrs,'checked')||Object.hasOwn(n.attrs,'selected')||['true','page'].includes(n.attrs['aria-selected']??n.attrs['aria-checked']??n.attrs['aria-pressed']??n.attrs['aria-current']);
  if(group.variants.length<stateCapacity.variants)group.variants.push({id:'variant-'+digest([o.id,o.sha256,n.start]).slice(0,24),node:n,name:identity,value:n.attrs.value??null,selected,labelSpans:spans,label:spans.map(s=>o.body.slice(s.start,s.end)).join(' ').slice(0,stateCapacity.labelBytes)});else limited=true;
 }
 const result=[];
 for(const group of groups.values()){
  // A selected control may qualify prices only through a shared enclosing
  // content container, never through navigation/footer or page-wide coincidence.
  let scope=group.root;
  while(scope&&!money(o.body.slice(scope.start,scope.end))&&scope.parent)scope=scope.parent;
  const peripheral=scope&&ancestors(scope).concat(scope).some(n=>['nav','header','footer'].includes(n.tag));
  const scoped=scope&&['section','div','article','form'].includes(scope.tag)&&!peripheral&&group.variants.every(v=>v.node.start>=scope.start&&v.node.end<=scope.end);
  const form=group.form,method=(form?.attrs.method??'get').toLowerCase();
  const variants=group.variants.map(v=>{
   let destination=null;
   if(v.node.attrs.href)destination=normalizeUrl(v.node.attrs.href,o.url);
   else if(v.node.tag==='option'&&/^(?:https:\/\/|\/)/.test(v.value??''))destination=normalizeUrl(v.value,o.url);
   else if(form&&method==='get'&&v.name&&v.value!==null&&!Object.hasOwn(v.node.attrs,'disabled')){
    if(!formFields.has(form.start))formFields.set(form.start,nodes.filter(n=>n.tag==='input'&&n.start>=form.start&&n.end<=form.end&&!Object.hasOwn(n.attrs,'disabled')&&n.attrs.name&&['hidden','radio','checkbox'].includes((n.attrs.type??'').toLowerCase())));
    const fields=formFields.get(form.start),successful=fields.filter(n=>n.attrs.name!==v.name&&((n.attrs.type??'').toLowerCase()==='hidden'||Object.hasOwn(n.attrs,'checked')));if(successful.length+1>stateCapacity.fields)limited=true;
    if(successful.length+1<=stateCapacity.fields&&!fields.some(n=>/^(?:password|authorization|access_token|api[_-]?key|secret|session_token|csrf.*|nonce)$/i.test(n.attrs.name))){
     const raw=normalizeUrl(form.attrs.action||o.url,o.url);if(raw){const u=new URL(raw);for(const n of fields)if(n.attrs.name!==v.name&&((n.attrs.type??'').toLowerCase()==='hidden'||Object.hasOwn(n.attrs,'checked')))u.searchParams.append(n.attrs.name,n.attrs.value??'');for(const c of controls.filter(c=>c.tag==='option'&&Object.hasOwn(c.attrs,'selected')&&c.start>=form.start&&c.end<=form.end)){const s=ancestors(c).find(n=>n.tag==='select');if(s?.attrs.name&&s.attrs.name!==v.name&&!Object.hasOwn(s.attrs,'disabled'))u.searchParams.append(s.attrs.name,c.attrs.value??'');}u.searchParams.set(v.name,v.value);destination=normalizeUrl(u.href);}
    }
   }
   return {id:v.id,name:v.name,value:v.value,selected:v.selected,label:v.label,labelSpans:v.labelSpans,destination,source:{start:v.node.start,end:v.node.openEnd,sha256:digest(o.body.slice(v.node.start,v.node.openEnd))}};
  });
  // Checkbox omission is native GET form behavior, not an invented value.
  for(const [i,v] of group.variants.entries())if(v.node.attrs.type?.toLowerCase()==='checkbox'&&variants[i].destination&&variants.length<stateCapacity.variants){const u=new URL(variants[i].destination);u.searchParams.delete(v.name);variants.push({...variants[i],id:'variant-'+digest([variants[i].id,'OMITTED_GET_FIELD']).slice(0,24),selected:!v.selected,destination:normalizeUrl(u.href),submission:'OMIT'});}
  result.push({id:group.id,scope:scoped?{start:scope.start,end:scope.end}:null,variants});
 }
 const value={groups:result,limited};cache.set(o,{body:o.body,sha256:o.sha256,id:o.id,value});return value;
}
export function selectedStateContext(o,p) {
 return providerStates(o).groups.filter(g=>g.scope&&p.start>=g.scope.start&&p.end<=g.scope.end).flatMap(g=>g.variants.filter(v=>v.selected&&v.submission!=='OMIT').map(v=>({group:g.id,variant:v.id,scope:g.scope,source:v.source,spans:v.labelSpans}))).slice(0,stateCapacity.contextSegments);
}
