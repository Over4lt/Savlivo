// Bounded structural projection of retained HTML; offsets always refer to the raw source.
import assert from 'node:assert/strict';
import {extractPage,retainedHtmlAttributes} from './public-web-adapter.mjs';
const voids=new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
export function providerPriceStructure(raw){
 const nodes=[],stack=[],ranges=[];let tokens=0;
 for(const m of raw.matchAll(/<!--[\s\S]*?-->|<\/?([a-z][a-z0-9-]*)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)){
  assert(++tokens<=150000,'HTML token bound');
  if(m[0].startsWith('<!--')){ranges.push([m.index,m.index+m[0].length]);continue;}
  const tag=m[1].toLowerCase();
  if(m[0].startsWith('</')){const i=stack.findLastIndex(n=>n.tag===tag);if(i<0)continue;for(const n of stack.splice(i)){n.end=m.index+m[0].length;if(n.hidden)ranges.push([n.start,n.end]);}continue;}
  const attrs=retainedHtmlAttributes(m[0]),parent=stack.at(-1),hidden=parent?.hidden||['script','style','noscript','svg','template','del','s'].includes(tag)||attrs['aria-hidden']==='true'||/\shidden(?:\s|=|>)/i.test(m[0])||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(attrs.style??'');
  const n={tag,start:m.index,openEnd:m.index+m[0].length,end:null,parent,children:[],hidden,attrs};parent?.children.push(n);nodes.push(n);assert(nodes.length<=75000,'HTML node bound');
  if(voids.has(tag)||m[0].endsWith('/>')){n.end=n.openEnd;if(hidden)ranges.push([n.start,n.end]);}else{stack.push(n);assert(stack.length<=256,'HTML depth bound');}
 }
 for(const n of stack)if(n.hidden)ranges.push([n.start,raw.length]);
 ranges.sort((a,b)=>a[0]-b[0]);let last=0,visible='';for(const[a,b]of ranges){if(b<=last)continue;visible+=raw.slice(last,Math.max(last,a))+' '.repeat(b-Math.max(last,a));last=b;}visible+=raw.slice(last);
 const text=n=>n.end?extractPage(visible.slice(n.start,n.end),'https://example.com',{maxText:20000,maxLinks:0}).text.trim():'';
 return {visible,nodes,text};
}
export function structuralPriceCards(structure,isRate){
 const {nodes,text}=structure,result=[];const seen=new Set();
 for(const leaf of nodes){if(leaf.hidden||!leaf.end||leaf.children.length||leaf.end-leaf.start>600)continue;const rate=text(leaf);if(!isRate(rate))continue;
  let branch=leaf;
  for(let parent=leaf.parent,depth=0;parent&&depth<8;branch=parent,parent=parent.parent,depth++){
   if(!parent.end||parent.end-parent.start>20000||['body','html'].includes(parent.tag))break;
   const siblings=parent.children.filter(n=>!n.hidden&&n.end),index=siblings.indexOf(branch);if(index<1)continue;
   const before=siblings[index-1],label=text(before).replace(/\s+/g,' ').trim();
   if(!label||label.length>100||/\n/.test(text(before))||isRate(label)||/^(recommended|popular|best value|save\b|features?|benefits?|monthly|annual|yearly)/i.test(label))continue;
   // A plan label adjacent to a rate must belong to an actionable offer/card, not arbitrary prose.
   const body=text(parent),control=siblings.some(n=>['button','a'].includes(n.tag)&&/get started|subscribe|choose|select|buy|purchase/i.test((n.attrs['aria-label']??'')+' '+text(n)));if(!control&&!/get started|subscribe|choose|select|buy|purchase/i.test(body)&&!['article','section'].includes(parent.tag)&&!/plan|pricing|offer|product|card/i.test(parent.attrs.class??''))continue;
   const id=parent.start+'|'+label;if(!seen.has(id)){seen.add(id);result.push({start:parent.start,end:parent.end,plan:label});}break;
  }
 }
 assert(result.length<=100,'Structural card bound');return result;
}

// Interpret provider-supplied interval semantics, not a locale/translation allow-list.
// These attributes remain in the same hash-bound offer fragment as the amount.
export function cardIntervalSemantics(structure,start,end){
 const intervals=[],types=[];
 for(const n of structure.nodes){if(n.hidden||n.start<start||!n.end||n.end>end)continue;
  const duration=n.attrs['data-billing-period']??n.attrs['data-billing-interval']??(n.attrs.itemprop==='billingDuration'?n.attrs.content??n.attrs.datetime??structure.text(n):null);
  if(duration!==null&&duration!==undefined)intervals.push({raw:duration,cadence:duration==='P1M'?'MONTH':duration==='P1Y'?'YEAR':null,offset:n.start});
  if(n.attrs['data-offer-type'])types.push(n.attrs['data-offer-type']);
 }
 const kinds=[...new Set(intervals.map(i=>i.cadence))],offers=[...new Set(types)];
 return {cadence:kinds.length===1?kinds[0]:null,cadenceConflict:kinds.length>1,offerType:offers.length===1&&['ORDINARY_RECURRING','PROMOTIONAL','INTRODUCTORY','TRIAL_FREE'].includes(offers[0])?offers[0]:null,offerConflict:offers.length>1,intervals};
}

// Semantic admission is structural, not a currency/language recognizer. The
// interpreter may return no offers; these fragments establish no price facts.
export function earlySemanticSections(structure){
 const candidates=[];
 for(const n of structure.nodes){
  if(n.hidden||!n.end||!['main','section','article','body','div'].includes(n.tag)||n.end-n.start>20000)continue;
  const text=structure.text(n);if(!text||!/[\p{L}\p{N}]/u.test(text)||Buffer.byteLength(text)>6000)continue;
  candidates.push({start:n.start,end:n.end,text,admission:'EARLY_STRUCTURAL_V1'});
 }
 // Prefer containing sections to isolated labels; never duplicate nested spans.
 candidates.sort((a,b)=>(b.end-b.start)-(a.end-a.start)||a.start-b.start);
 const selected=[];for(const c of candidates){if(selected.some(p=>c.start<p.end&&c.end>p.start))continue;selected.push(c);if(selected.length===4)break;}
 return selected.sort((a,b)=>a.start-b.start);
}
