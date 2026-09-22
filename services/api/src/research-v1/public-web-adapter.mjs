// Conservative public extraction: observations are never auto-verified.
import { createPublicReader } from './public-network.mjs';
import {createHash} from 'node:crypto';
const decode = text => text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all,key) => {
  if (key[0] === '#') { const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2),16) : Number(key.slice(1)); return n > 0 && n <= 0x10ffff && !(n>=0xd800 && n<=0xdfff) ? String.fromCodePoint(n) : all; }
  return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[key.toLowerCase()] ?? all;
});
const strip = s => decode(s.replace(/<[^>]*>/g,' ')).replace(/[\t\r ]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4]);
  return result;
}
const recurring = /subscri|membership|monthly|annually|per month|per year|abonn|monat|mensual|mensal|đăng ký|hàng tháng|gói|thuê bao|订阅|구독|定期|اشتراك/i;
const patterns = {
  availability:/available|country|region|south africa|românia|vietnam|disponib|beschikbaar|quốc gia/i,
  plans:/\b(?:plans?|packages?|membership)\b|abonn|gói|套餐|プラン/i,
  prices:/(?:[€£$]|\b(?:ZAR|USD|EUR|RON|VND|VAT|TVA)\b|R\s?\d|\d[.,]\d{2}|giá|price|pricing)/i,
  currency:/\b(?:currency|ZAR|USD|EUR|RON|VND|rand)\b|đồng/i,
  billingRoutes:/billed|billing|apple|google play|direct|bundle|partner|thanh toán/i,
  startWeb:/subscribe|sign up|join|purchase|abonn|đăng ký/i,
  manageWeb:/my account|manage|account settings|tài khoản/i,
  cancelWeb:/cancel|terminate|cancellation|kündig|annul|hủy|rezilier/i,
  lifecycle:/discontinu|shutdown|renamed|rebrand|merger|legacy|ngừng/i
};
export function extractPage(html, finalUrl, {maxText=30000,maxLinks=12,resolveDocumentBase=false} = {}) {
  const metadata = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const a = attributes(tag); const name = a.property ?? a.name;
    if (name && a.content && ['og:site_name','og:title','description','og:description','robots'].includes(name.toLowerCase())) metadata[name.toLowerCase()] = a.content.slice(0,1000);
  }
  const declaredLanguage = attributes(html.match(/<html\b[^>]*>/i)?.[0] ?? '').lang ?? null;
  const title = strip(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').slice(0,500);
  const clean = html.replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ');
  const text = strip(clean.replace(/<\/(?:p|div|li|h[1-6]|tr|section)>|<br\s*\/?>/gi,'\n')).slice(0,maxText);
  // Live discovery honours a retained same-origin document base. Legacy offline
  // projections retain their original URL resolution unless explicitly enabled.
  let documentBase=finalUrl;
  if(resolveDocumentBase){const head=clean.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1]??'';
    const href=attributes(head.match(/<base\b[^>]*>/i)?.[0]??'').href;
    if(href){try{const b=new URL(href,finalUrl),u=new URL(finalUrl);documentBase=b.protocol==='https:'&&b.origin===u.origin&&!b.username&&!b.password?b.href:null;}catch{documentBase=null;}}
  }
  const allLinks = [];
  for (const match of clean.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const a = attributes(match[1]); if (!a.href) continue;
    try {
      const u = documentBase===null?new URL(a.href):new URL(a.href,documentBase); if (!['http:','https:'].includes(u.protocol) || u.username || u.password) continue;
      u.hash = ''; const label = strip(match[2]).slice(0,200);
      const relevant = recurring.test(label+' '+u.pathname) || /help|support|faq|terms|legal|cancel|account|pricing/i.test(label+' '+u.pathname);
      if (relevant) allLinks.push({url:u.href,label});
    } catch { /* Not a navigable URL. */ }
  }
  const links = [...new Map(allLinks.map(l=>[l.url,l])).values()].slice(0,maxLinks);
  const snippets = Object.fromEntries(Object.entries(patterns).map(([fact,regex]) => [fact,text.split('\n').filter(line=>regex.test(line)
    && (!['prices','availability','lifecycle'].includes(fact) || recurring.test(line) || /\b(?:VAT|TVA|tax|pricing)\b/i.test(line)))
    .slice(0,2).map(line=>line.trim().slice(0,600))]));
  return {title,metadata,declaredLanguage,text,textTruncated:text.length>=maxText,links,snippets};
}
export function parseSearchFeed(xml, limit=6) {
  const rows=[];
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const get = name => decode(match[1].match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`,'i'))?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1') ?? '').trim();
    try { const url = new URL(get('link')); if (!['http:','https:'].includes(url.protocol)) continue;
      rows.push({url:url.href,title:strip(get('title')),snippet:strip(get('description')).slice(0,600),sourceType:'SECONDARY'});
    } catch { /* No invented search result. */ }
    if (rows.length>=limit) break;
  }
  return [...new Map(rows.map(r=>[r.url,r])).values()];
}
export function relevantResults(results, query) {
  const terms=[...new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])].filter(t=>!['the','and','for','with','www','https','com','site'].includes(t));
  if (!terms.length) return [];
  return results.filter(r=> {const text=(r.title+' '+r.snippet+' '+r.url).toLocaleLowerCase(); return terms.filter(t=>text.includes(t)).length>=Math.min(2,terms.length);});
}
export function createFreePublicAdapter({ reader=createPublicReader(), clock=()=>new Date().toISOString(), authorities=[], maxResults=4, maxLinks=4, retainRaw=false } = {}) {
  const classify = url => {
    const host=new URL(url).hostname;
    const authority=authorities.find(a=>a.hostname===host && a.sourceUrl && a.checkedAt && ['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT','OFFICIAL_STORE','OFFICIAL_OPERATOR'].includes(a.sourceType));
    return { sourceType:authority?.sourceType ?? 'SECONDARY', authority:authority ? {status:'CONFIGURED_REVIEWED',...authority} : {status:'UNKNOWN'},
      pageKind:/pricing|plans|checkout|subscribe/i.test(new URL(url).pathname)?'PRICING_OR_PRODUCT_HINT':/support|help|faq/i.test(host+new URL(url).pathname)?'SUPPORT_HINT':/terms|legal|privacy/i.test(new URL(url).pathname)?'LEGAL_HINT':'PAGE' };
  };
  return {
    provider:'public-bing-rss-and-http',costClass:'FREE',
    async search({query,locale,targetCountry,signal,maxRedirects,consumeNetwork}) {
      const url=new URL('https://www.bing.com/search'); url.searchParams.set('format','rss');url.searchParams.set('q',query);
      if (locale) url.searchParams.set('setlang',locale);
      const checkedAt=clock();
      try {
        const response=await reader(url.href,{locale,signal,maxRedirects,consumeNetwork});
        if (response.status!==200 || !/<rss\b/i.test(response.text)) return {costClass:'FREE',results:[],failure:{code:'SEARCH_UNAVAILABLE',status:response.status},query,locale,targetCountry,checkedAt};
        const parsed=parseSearchFeed(response.text,Math.min(maxResults*3,30));
        const results=relevantResults(parsed,query).slice(0,maxResults);
        return {costClass:'FREE',results,...(results.length?{}:{failure:{code:'SEARCH_NO_RELEVANT_RESULTS'}}),
          rawResultCount:parsed.length,query,locale,targetCountry,checkedAt,searchUrl:response.url,redirects:response.redirects};
      } catch(e) { return {costClass:'FREE',results:[],failure:{code:e.code ?? 'NETWORK_FAILED'},...(e.accessDecisions?{accessDecisions:e.accessDecisions}:{}),query,locale,targetCountry,checkedAt}; }
    },
    async read({url,locale,targetCountry,signal,maxRedirects,consumeNetwork}) {
      const checkedAt=clock();
      const base={costClass:'FREE',url,locale,targetCountry,checkedAt,redirects:[],sourceType:'SECONDARY',observations:[],links:[],discoveries:[],gaps:[]};
      try {
        const response=await reader(url,{locale,signal,maxRedirects,consumeNetwork});
        const source=classify(response.url);
        if(response.scriptScan)return {...base,url:response.url,redirects:response.redirects,outcome:'SCAN_ONLY',httpStatus:response.status,contentType:response.contentType,
          scriptScan:response.scriptScan,...(response.accessDecisions?{accessDecisions:response.accessDecisions}:{})};
        const extracted=response.contentType==='application/json'?{title:'',metadata:{},declaredLanguage:null,text:response.text,textTruncated:false,links:[],snippets:{}}:extractPage(response.text,response.url,{maxLinks,resolveDocumentBase:true});
        const blocked=[401,403,407,429,451].includes(response.status) || /captcha|verify (?:you are|that you are) human|access denied|just a moment|unusual traffic/i.test(extracted.title+' '+extracted.text.slice(0,600));
        const outcome=blocked?'ACCESS_CONTROL_STOP':response.status===200?'OK':'UNRESOLVED';
        const page={...base,...(retainRaw ? {rawSource:{text:response.text,contentType:response.contentType},sourceIntegrity:{version:1,sha256:createHash('sha256').update(response.text).digest('hex'),checkedAt}} : {}),url:response.url,redirects:response.redirects,...source,outcome,httpStatus:response.status,
          ...(response.runtimeCorsHeaders?{runtimeCorsHeaders:response.runtimeCorsHeaders}:{}),contentType:response.contentType,declaredLanguage:response.declaredLanguage ?? extracted.declaredLanguage,extraction:extracted,
          ...(response.accessDecisions ? {accessDecisions:response.accessDecisions} : {}),
          ...(response.indexingDirectives ? {indexingDirectives:response.indexingDirectives} : {})};
        if (outcome!=='OK') {page.failure={code:blocked?'ACCESS_CONTROL':'HTTP_STATUS',status:response.status};return page;}
        // All extraction remains uncertain. No regex is allowed to assert a price or web flow.
        for(const [fact,quotes] of Object.entries(extracted.snippets)) for(const quote of quotes) page.observations.push({fact,value:null,status:'REVIEW_REQUIRED',basis:'UNCERTAIN',countryCode:targetCountry,quote});
        const name=extracted.metadata['og:site_name'];
        if (name && recurring.test(extracted.text)) {
          page.discoveries.push({countryCode:targetCountry,serviceName:name,reason:'Page declares this site identity and contains subscription/membership language; recurrence, significance and market relevance need independent review.',localName:name,aliases:[],provider:null,category:null});
          page.observations.push({fact:'identity',value:null,status:'REVIEW_REQUIRED',basis:'UNCERTAIN',countryCode:targetCountry,quote:`og:site_name: ${name}`});
        }
        page.links=extracted.links.map(l=>l.url);
        // Explicit observed restriction only; no transport error/IP assumption proves a geo gap.
        const geo=extracted.text.match(/[^\n.]{0,120}(?:not available in your (?:country|region)|only available in [^\n.]{1,70})[^\n.]{0,80}/i)?.[0];
        if(geo && ['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(source.sourceType)) page.gaps.push({fact:'availability',requiresTargetGeo:true,reason:`Observed region wording (not proof of target-market availability): ${geo}`});
        return page;
      } catch(e) {return {...base,outcome:e.code==='ROBOTS_ACCESS_STOP'?'ACCESS_CONTROL_STOP':'UNRESOLVED',redirects:e.redirects??[],
        ...(e.redirectDiagnostic?{redirectDiagnostic:e.redirectDiagnostic}:{}),...(e.bodyDiagnostic?{bodyDiagnostic:e.bodyDiagnostic}:{}),
        ...(e.accessDecisions ? {accessDecisions:e.accessDecisions} : {}),failure:{code:e.code??'NETWORK_FAILED'}};}
    }
  };
}

export {attributes as retainedHtmlAttributes};
