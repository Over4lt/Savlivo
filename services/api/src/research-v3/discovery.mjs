// Source-owned research candidates. All signals below are advisory, never truth.
import {structuredSources} from './structured-material.mjs';
import {gapQueries} from './research-gaps.mjs';
import {adaptiveQueries} from './research-strategist.mjs';
import {providerStates} from './provider-states.mjs';
import {digest,normalizeUrl} from './model.mjs';
import {navigationOwned,authorityBinding,navigationParametersSafe} from './discovery-authority.mjs';
export const discoveryCapacity=Object.freeze({tokens:131072,extracted:2048,sourceSlice:4096,label:240,jsonBytes:262144,jsonNodes:4096,jsonDepth:32,jsonScripts:32,jsonPointer:2048,sitemapEntries:4096,provenance:8,advisoryCandidates:64,advisoryMs:1000});
const decode=s=>String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(all,k)=>k[0]==='#'?(()=>{const n=k[1].toLowerCase()==='x'?parseInt(k.slice(2),16):Number(k.slice(1));return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):all;})():({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[k.toLowerCase()]));
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m=>[m[1].toLowerCase(),decode(m[2]??m[3]??m[4])]));
const label=s=>decode(s.replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim().slice(0,discoveryCapacity.label);
const assets=/\.(?:png|jpe?g|gif|svg|webp|ico|woff2?|css|js|mp[34]|zip|exe)(?:$|\?)/i;
function safeCandidate(raw,base,objective) {
    const url=normalizeUrl(decode(raw),base);
    if(!url||!navigationOwned(objective,url)||assets.test(new URL(url).pathname))return null;
    const u=new URL(url);
    if(!navigationParametersSafe(url))return null;
    // A redirect-shaped query does not authorize an otherwise unreviewed destination.
    for(const key of ['url','target','next','continue','return','redirect','redirect_uri'])for(const value of u.searchParams.getAll(key)) {
        if(/^(?:https?:|\/\/)/i.test(value)&&(!normalizeUrl(value,url)||!navigationOwned(objective,new URL(value,url).href)))return null;
    }
    return url;
}
export function rankCandidate(c,objective) {
    let score=1;
    if(c.context==='NAVIGATION'||c.context==='HEADER')score+=3;
    if(c.kind==='ALTERNATE')score+=2;
    if(c.kind==='SITEMAP')score+=1;
    if(c.kind==='STRUCTURED_NAVIGATION')score+=3;
    if(c.kind==='PROVIDER_STATE')score+=5;
    if(c.kind==='PROVIDER_ENDPOINT')score-=8;
    const target=objective.serviceName.normalize('NFKC').toLocaleLowerCase('en').split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>2);
    const candidate=(c.label+' '+new URL(c.url).hostname+' '+new URL(c.url).pathname).normalize('NFKC').toLocaleLowerCase('en');
    if(target.length)score+=Math.round(12*target.filter(w=>candidate.includes(w)).length/target.length);
    const words=(new URL(c.url).pathname+' '+c.label).normalize('NFKC');
    // Small optional native hints, not a multilingual interpretation engine.
    if(/\b(?:pricing|plans?|subscription|membership|premium)\b/i.test(words))score+=5;
    if(objective.kind==='SERVICE_QUALIFICATION'&&/\b(?:account|login|sign in|billing|manage|cancel)\b/i.test(words))score+=4;
    if(c.context==='FOOTER')score-=2;
    const region=c.locale?.match(/-([a-z]{2})$/i)?.[1]?.toUpperCase();
    if(region&&objective.markets.includes(region))score+=3;
    else if(region)score-=1;
    return Math.max(1,Math.min(20,score));
}
export function extractNavigation(o,objective,needs) {
    if(o.outcome!=='OK'||o.truncated||o.completeness==='INCOMPLETE'||o.sha256!==digest(o.body))return {candidates:[],limited:false};
    const body=o.body,candidates=[],stack=[],sourceHashes=new Map(),base=documentBase(o);let tokens=0,limited=base.limited,jsonScripts=0;
    const add=(raw,kind,start,end,extra={})=>{
        if(candidates.length>=discoveryCapacity.extracted){limited=true;return;}
        if(base.limited&&!/^https:\/\//i.test(raw))return;
        const url=safeCandidate(raw,base.url??o.url,objective);if(!url)return;
        if(base.invalid&&!/^https:\/\//i.test(raw))return;
        const spanKey=start+':'+end;
        if(!sourceHashes.has(spanKey))sourceHashes.set(spanKey,digest(body.slice(start,end)));
        const c={id:'nav-'+digest([o.id,o.sha256,kind,start,end,url,extra.pointer??null]).slice(0,24),url,kind,label:label(extra.label??''),locale:extra.locale??null,context:extra.context??stack.at(-1)??'CONTENT',resource:kind==='SITEMAP'?'SITEMAP':'PAGE',needs:[...new Set(needs)],authority:authorityBinding(objective,url),source:{observation:o.id,bodySha256:o.sha256,start,end,...(base.source?{base:base.source}:{}),sha256:sourceHashes.get(spanKey),...(extra.pointer!==undefined?{pointer:extra.pointer}:{})},...(extra.state?{state:extra.state}:{})};
        c.score=rankCandidate(c,objective);c.family=c.state?.group??(c.kind==='ALTERNATE'?'alternate-'+o.id:new URL(c.url).origin+new URL(c.url).pathname.replace(/\/[^/]*$/, '/'));c.signals={structure:c.context,kind:c.kind,service:objective.serviceName,state:c.state??null,locale:c.locale,discoveryOnly:true};candidates.push(c);
    };
    const structuredJson=/^application\/(?:ld\+)?json$/i.test(o.contentType??'');
    const token=/<!--[^]*?-->|<\/?([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
    for(let m;!structuredJson&&(m=token.exec(body));) {
        if(++tokens>discoveryCapacity.tokens){limited=true;break;}
        if(!m[1])continue;
        const tag=m[1].toLowerCase(),closing=m[0][1]==='/';
        if(closing){if(['nav','header','footer'].includes(tag))stack.pop();continue;}
        const a=attrs(m[0]);
        if(['nav','header','footer'].includes(tag))stack.push(tag==='nav'?'NAVIGATION':tag.toUpperCase());
        if(['script','style','template','textarea','title'].includes(tag)) {
            const end=new RegExp('</'+tag+'\\s*>','gi');end.lastIndex=token.lastIndex;const close=end.exec(body),stop=close?.index??body.length;
            if(tag==='script'&&/^(?:application\/ld\+json|application\/json)$/i.test(a.type??'')&&stop-token.lastIndex<=discoveryCapacity.jsonBytes&&++jsonScripts<=discoveryCapacity.jsonScripts) {
                try {
                    const data=JSON.parse(body.slice(token.lastIndex,stop));let count=0;
                    const walk=(v,pointer,depth,navigation=false)=>{
                        if(++count>discoveryCapacity.jsonNodes||depth>discoveryCapacity.jsonDepth||pointer.length>discoveryCapacity.jsonPointer){limited=true;return;}
                        if(!v||typeof v!=='object')return;
                        const types=Array.isArray(v['@type'])?v['@type']:[v['@type']];
                        const local=navigation||types.includes('SiteNavigationElement');
                        const stateCollection=/\/(?:states|variants|options|choices)\/\d+$/.test(pointer);
                        const destination=v.url??v.href;
                        if((local||stateCollection)&&typeof destination==='string')add(destination,stateCollection?'PROVIDER_STATE':'STRUCTURED_NAVIGATION',m.index,close?end.lastIndex:stop,{pointer,label:label(String(v.name??v.label??'')),...(stateCollection?{state:{group:'metadata-'+digest([o.id,pointer.replace(/\/\d+$/,'')]).slice(0,24),variant:pointer,selected:v.selected===true,observation:o.id,bodySha256:o.sha256}}:{})});
                        for(const [k,x]of Object.entries(v)){if(count>=discoveryCapacity.jsonNodes)break;walk(x,pointer+'/'+k.replaceAll('~','~0').replaceAll('/','~1'),depth+1,local||['navigation','menu','links'].includes(k));}
                    };walk(data,'',0);
                }catch{/* Malformed inert metadata is not navigation evidence. */}
            }
            token.lastIndex=close?end.lastIndex:body.length;continue;
        }
        if(tag==='a'&&a.href) {
            const tail=body.slice(token.lastIndex,token.lastIndex+discoveryCapacity.sourceSlice),end=tail.search(/<\/a\s*>/i),visible=end<0?'':tail.slice(0,end);
            const image=attrs(visible.match(/<img\b[^>]*>/i)?.[0]??'');
            add(a.href,'ANCHOR',m.index,token.lastIndex,{label:label(a['aria-label']??visible??image.alt??''),context:stack.at(-1)});
            if(!candidates.at(-1)?.label&&image.alt&&candidates.at(-1)?.source.start===m.index)candidates.at(-1).label=label(image.alt);
        }
        if(tag==='link'&&a.href) {
            const rel=(a.rel??'').toLowerCase().split(/\s+/);
            if(rel.includes('canonical'))add(a.href,'CANONICAL',m.index,token.lastIndex);
            if(rel.includes('alternate'))add(a.href,'ALTERNATE',m.index,token.lastIndex,{locale:a.hreflang??null});
            if(rel.includes('sitemap'))add(a.href,'SITEMAP',m.index,token.lastIndex);
        }
        if(tag==='option'&&a.value&&/^(?:https:\/\/|\/)/.test(a.value))add(a.value,'LOCALE_OPTION',m.index,token.lastIndex,{locale:a.lang??null,label:a.label??''});
        if(tag==='form'&&a.action&&(a.method??'get').toLowerCase()==='get')add(a.action,'GET_FORM',m.index,token.lastIndex,{label:label(a['aria-label']??'' )});
    }
    for(const endpoint of structuredSources(body,o.contentType).endpoints.filter(e=>!candidates.some(c=>c.url===safeCandidate(e.url,base.url??o.url,objective))))add(endpoint.url,'PROVIDER_ENDPOINT',endpoint.start,endpoint.end,{pointer:endpoint.pointer,label:endpoint.pointer});
    const states=providerStates(o);limited||=states.limited;
    for(const group of states.groups)for(const variant of group.variants)if(variant.destination)add(variant.destination,'PROVIDER_STATE',variant.source.start,variant.source.end,{label:variant.label,state:{group:group.id,variant:variant.id,selected:variant.selected,scope:group.scope,observation:o.id,bodySha256:o.sha256,context:o.context,source:variant.source}});
    return {candidates:candidates.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)),limited};
}
export function extractSitemap(o,objective,needs) {
    if(o.sha256!==digest(o.body)||o.outcome!=='OK'||o.truncated||o.completeness==='INCOMPLETE')throw Error('SITEMAP_INCOMPLETE');
    if(/<!DOCTYPE|<!ENTITY/i.test(o.body)||!/<(?:[\w.-]+:)?(?:urlset|sitemapindex)\b/i.test(o.body)||!/<\/(?:[\w.-]+:)?(?:urlset|sitemapindex)\s*>/i.test(o.body))throw Error('SITEMAP_UNSUPPORTED');
    const index=/<(?:[\w.-]+:)?sitemapindex\b/i.test(o.body),candidates=[];let inspected=0,limited=false;
    for(const m of o.body.matchAll(/<(?:[\w.-]+:)?loc\b[^>]*>([^<]{1,4096})<\/(?:[\w.-]+:)?loc\s*>/gi)) {
        if(++inspected>discoveryCapacity.sitemapEntries){limited=true;break;}
        const url=safeCandidate(m[1].trim(),o.url,objective);if(!url)continue;
        const c={id:'nav-'+digest([o.id,o.sha256,m.index,url]).slice(0,24),url,kind:index?'SITEMAP':'SITEMAP_ENTRY',resource:index?'SITEMAP':'PAGE',label:'',locale:null,context:'SITEMAP',needs:[...new Set(needs)],authority:authorityBinding(objective,url),source:{observation:o.id,bodySha256:o.sha256,start:m.index,end:m.index+m[0].length,sha256:digest(m[0])}};
        c.score=rankCandidate(c,objective);c.family=c.state?.group??(c.kind==='ALTERNATE'?'alternate-'+o.id:new URL(c.url).origin+new URL(c.url).pathname.replace(/\/[^/]*$/, '/'));c.signals={structure:c.context,kind:c.kind,service:objective.serviceName,state:c.state??null,locale:c.locale,discoveryOnly:true};candidates.push(c);
    }
    return {candidates:candidates.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)),limited,inspected};
}
export function queryFamilies(objective,market,needs,knowledge) {
    const scope=[...new Set([...objective.providerHosts,...(objective.providerNamespaces??[]).map(s=>s.domain)])].map(h=>'site:'+h).join(' OR '),service=objective.serviceName;
    const intents=objective.kind==='PRICE'?['subscription pricing plans','subscription billing renewal terms','subscription availability official']:['official service subscription','account membership support','official service information'];
    return [...gapQueries(objective,market,needs,knowledge),...adaptiveQueries(objective,market,needs,knowledge),...intents.map((intent,index)=>({kind:'DISCOVER',market,needs,family:'objective-'+index,query:[service,market,intent,'('+scope+')'].filter(Boolean).join(' ').slice(0,1000),reason:'Bounded provider discovery family '+index+' for unresolved objective',value:2-index/10}))];
}

function documentBase(o) {
    const token=/<!--[^]*?-->|<\/?([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;let count=0;
    for(let m;(m=token.exec(o.body));) {
        if(++count>discoveryCapacity.tokens)return {url:o.url,limited:true};
        if(!m[1]||m[0][1]==='/')continue;
        const tag=m[1].toLowerCase();
        if(['script','style','template','textarea','title'].includes(tag)) {
            const end=new RegExp('</'+tag+'\\s*>','gi');end.lastIndex=token.lastIndex;const close=end.exec(o.body);token.lastIndex=close?end.lastIndex:o.body.length;continue;
        }
        if(tag==='base') {
            const a=attrs(m[0]);if(a.href===undefined)continue;
            const source={start:m.index,end:token.lastIndex,sha256:digest(m[0])};
            try{return {url:new URL(a.href,o.url).href,source,limited:false};}catch{return {url:o.url,source,invalid:true,limited:false};}
        }
    }
    return {url:o.url,limited:false};
}

// Breadth without crawling: retain high-value representatives of source families
// before letting repeated global/locale navigation consume the bounded frontier.
export function diverseCandidates(candidates,limit) {
 const groups=new Map();for(const c of candidates){const key=c.family??c.url;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}
 const output=[];for(let round=0;output.length<limit;round++){
  let added=false;for(const rows of groups.values())if(rows[round]&&output.length<limit){output.push(rows[round]);added=true;}
  if(!added)break;
 }return output;
}
