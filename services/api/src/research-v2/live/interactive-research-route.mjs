import {sourceLinks} from './source-frontier-links.mjs';
import {normalizePublicUrl} from '../../research-v1/public-network.mjs';
import {semanticReasons} from './source-frontier.mjs';

// An acquired, hash-checked provider page may point to one safe read-only
// pricing destination. The link is navigation evidence, never price evidence.
export function interactiveNavigationDestination(body,baseUrl){
 let base;try{base=normalizePublicUrl(baseUrl);}catch{return null;}
 const candidates=[];
 for(const link of sourceLinks(body,{maxBytes:2*1024*1024,maxLinks:80}).links){
  if(link.mechanism!=='ANCHOR')continue;
  let url;try{url=normalizePublicUrl(new URL(link.url,base).href);}catch{continue;}
  if(url.origin!==base.origin||url.href===base.href)continue;
  const semantic=semanticReasons(url.href,link.label,link.mechanism);
  if(semantic.reject||!semantic.reasons.includes('SUBSCRIPTION_PRODUCT_PRICING'))continue;
  candidates.push({url:url.href,priority:semantic.priority,offset:link.reference?.offset??0});
 }
 candidates.sort((a,b)=>a.priority-b.priority||a.offset-b.offset);
 return candidates[0]?.url??null;
}

export function interactiveRouteRequiresBrowser(body,baseUrl){
 if(interactiveNavigationDestination(body,baseUrl))return true;
 const text=String(body??'').slice(0,2*1024*1024);
 return /<(?:button|input|form)\b[^>]{0,1000}(?:next|continue|choose|select|plan|pricing|subscription)[^>]{0,1000}>/iu.test(text)||/<button\b[^>]{0,1000}>[^<]{0,120}(?:next|continue|choose|select|plans?|pricing)[^<]{0,120}<\/button>/iu.test(text);
}
