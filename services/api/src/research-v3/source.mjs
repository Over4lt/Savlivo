// Bounded deterministic HTML/text interpretation. No network, model calls or V2 policy.
import {digest, pricePropositions, servicePropositions} from './model.mjs';

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, key) => {
    if (key[0] !== '#') return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[key.toLowerCase()];
    const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2),16) : Number(key.slice(1));
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : all;
});
const text = s => decode(s.replace(/<!--[^]*?-->/g,' ').replace(/<(script|style|template)\b[^>]*>[^]*?<\/\1\s*>/gi,' ').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const attrs = s => Object.fromEntries([...s.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m => [m[1].toLowerCase(),decode(m[2]??m[3]??m[4])]));
const blocks = new Set(['p','li','article','section','div','h1','h2','h3','title','a']);
const voids = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

function document(body, contentType) {
    if (contentType === 'text/plain') return {nodes: body.split(/\n\s*\n/).map(part => ({tag:'p',start:body.indexOf(part),end:body.indexOf(part)+part.length,inner:part,text:part.trim(),attrs:{}})), limited:false};
    const nodes=[], stack=[],hidden=[]; let limited=false, tokens=0;
    const visibleText=(start,end)=>{
        let cursor=start, material='';
        for(const range of hidden.filter(r=>r.start>=start&&r.end<=end).sort((a,b)=>a.start-b.start||b.end-a.end)) {
            if(range.end<=cursor)continue;
            material+=body.slice(cursor,Math.max(cursor,range.start));cursor=range.end;
        }
        return text(material+body.slice(cursor,end));
    };
    const token=/<\!--[^]*?-->|<\/?([a-z][\w:-]*)\b[^>]*>/gi;
    for (let m; (m=token.exec(body));) {
        if (++tokens > 20000) {limited=true; break;}
        if (!m[1]) continue;
        const tag=m[1].toLowerCase(), closing=m[0][1]==='/';
        if (!closing && ['script','style','template'].includes(tag)) {
            const end=new RegExp('</'+tag+'\\s*>','gi'); end.lastIndex=token.lastIndex;
            const close=end.exec(body); token.lastIndex=close?end.lastIndex:body.length; continue;
        }
        if (!closing && !voids.has(tag) && !m[0].endsWith('/>')) {
            if (stack.length >= 128) {limited=true; break;}
            const attributes=attrs(m[0]);
            stack.push({tag,start:m.index,openEnd:token.lastIndex,attrs:attributes,hidden:stack.some(n=>n.hidden)||/\shidden(?:\s|=|>)/i.test(m[0])||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(attributes.style??'')});
        } else if (closing) {
            const index=stack.findLastIndex(n=>n.tag===tag); if(index<0) continue;
            const n=stack[index]; stack.length=index;
            if(n.hidden)hidden.push({start:n.start,end:token.lastIndex});
            if (blocks.has(tag)) {
                const inner=body.slice(n.openEnd,m.index), visible=visibleText(n.openEnd,m.index);
                if (visible && !n.hidden) nodes.push({...n,end:token.lastIndex,inner,text:visible});
            }
        }
    }
    return {nodes:nodes.sort((a,b)=>a.start-b.start),limited};
}

const currencies=new Set(Intl.supportedValuesOf('currency'));
const regionNames=new Intl.DisplayNames(['en'],{type:'region'});
function explicitMarket(s) {
    const m=s.match(/(?:available (?:only )?in|for (?:customers|members|subscribers|consumers|residents) in|market\s*:)\s*([A-Za-z][A-Za-z .-]{1,60})/i);
    if(!m) return null;
    const region=m[1].trim();
    const code=region.match(/^([A-Z]{2})(?=\b|$)/)?.[1];
    if(code) return code;
    for(let a=65;a<=90;a++) for(let b=65;b<=90;b++) {
        const c=String.fromCharCode(a,b), name=regionNames.of(c);
        if(name!==c && new RegExp('^'+escape(name)+'(?=[.,;]|$|\\s+(?:and|with|for)\\b)','i').test(region)) return c;
    }
    return null;
}
function monetary(s) {
    const found=[];
    const amount=raw=>{
        if(/^\d+$/.test(raw)||/^\d+\.\d{1,2}$/.test(raw))return Number(raw);
        if(/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(raw))return Number(raw.replaceAll(',',''));
        if(/^\d+,\d{1,2}$/.test(raw))return Number(raw.replace(',','.'));
        if(/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(raw))return Number(raw.replaceAll('.','').replace(',','.'));
        return null;
    };
    const re=/\b([A-Z]{3})\s*(\d+(?:[.,]\d+)*)(?!\d|[.,]\d)\b|\b(\d+(?:[.,]\d+)*)(?!\d|[.,]\d)\s*([A-Z]{3})\b/g;
    for(const m of s.matchAll(re)) {
        const currency=m[1]??m[4], value=amount(m[2]??m[3]);
        if(currencies.has(currency)&&value!==null) found.push({amount:value,currency});
    }
    return found;
}
function offerFrom(s) {
    const money=monetary(s), ambiguity=[];
    const repeated= [...new Set(money.map(v=>JSON.stringify(v)))];
    if(repeated.length>1) ambiguity.push('MULTIPLE_MONETARY_VALUES');
    const one=repeated.length===1?JSON.parse(repeated[0]):{};
    const monthly=/\b(?:per month|each month|monthly|every month)\b|\/\s*month\b/i.test(s);
    const annual=/\b(?:per year|yearly|annually|annual|billed yearly)\b|\/\s*(?:year|yr)\b/i.test(s);
    const cadence=annual?'YEARLY':monthly?'MONTHLY':null;
    if(!cadence) ambiguity.push('CADENCE_NOT_EXPLICIT');
    const relationship=/\bsubscription\b/i.test(s)?'SUBSCRIPTION':/\bmembership\b/i.test(s)?'MEMBERSHIP':null;
    const consumer=/\b(?:consumer|personal|individual)\b/i.test(s) && !/\b(?:business|enterprise|corporate)\b/i.test(s);
    const uncertain=/\b(?:not|no|example|illustrative|starting at|from)\b/i.test(s);
    const role=uncertain?null:/\b(?:trial|introductory|first month|first \d+ months|promotional)\b/i.test(s)?'TRIAL':/\b(?:benefit|credit|worth|value of)\b/i.test(s)?'BENEFIT':/\bdiscount\b/i.test(s)?'DISCOUNT':relationship?'ORDINARY':null;
    const amountDerivation=/\b(?:divided by|equivalent|installment|instalment)\b|\/\s*12\b/i.test(s)?'ARITHMETIC':'EXPLICIT';
    if(!one.currency) ambiguity.push('CURRENCY_OR_AMOUNT_NOT_EXPLICIT');
    return {...one,cadence,relationship,consumer:consumer&&!uncertain?true:null,role,amountDerivation,market:explicitMarket(s),ambiguity};
}
function relevance(s) {
    const need=new Set();
    if(/\b(?:price|pricing|plans?|subscription|membership|subscribe|join|upgrade|premium|offers?)\b/i.test(s)) pricePropositions.forEach(n=>need.add(n));
    if(/\b(?:country|region|market|locale)\b/i.test(s)) need.add('TARGET_MARKET');
    if(/\b(?:login|log in|sign in|account)\b/i.test(s)) need.add('ACCOUNT_LOGIN_EXISTS');
    if(/\b(?:manage|management|account)\b/i.test(s)) need.add('MEMBERSHIP_MANAGEMENT_EXISTS');
    if(/\b(?:about|members|customers|subscribers|users)\b/i.test(s)) need.add('SERVICE_SIZE_100K_PLUS');
    if(/\b(?:subscription|membership|subscribe|join)\b/i.test(s)) need.add('CONSUMER_MONTHLY_SUBSCRIPTION_EXISTS');
    return [...need];
}

/** Deterministic candidates derived from bounded raw material. No inferred market
 * from currency, path, language or transport; no interpreter-supplied truth flags. */
export function projectWebSource(observation, objective) {
    const source={offers:[],links:[]}, bindings={}, ambiguities=[];
    if(!['text/html','application/xhtml+xml','text/plain'].includes(observation.contentType)) return {source,bindings,ambiguities,limited:false};
    const parsed=document(observation.body,observation.contentType), nodes=parsed.nodes;
    const name=new RegExp('(?:^|[^\\p{L}\\p{N}])'+escape(objective.serviceName)+'(?=$|[^\\p{L}\\p{N}])','iu');
    const pointer=n=>({start:n.start,end:n.end,sha256:digest(observation.body.slice(n.start,n.end))});
    const identity=nodes.find(n=>['title','h1','p'].includes(n.tag)&&name.test(n.text));
    if(identity) {source.serviceId=objective.serviceId; bindings['/serviceId']=pointer(identity);}
    // Keep an offer within one presentation. Prefer small enclosing offer sections,
    // never pool an entire page's prices, currencies and headings.
    const priced=nodes.filter(n=>n.tag!=='a'&&monetary(n.text).length&&/\b(?:subscription|membership)\b/i.test(n.text));
    const selected=priced.filter(n=>!priced.some(c=>c!==n&&c.start>n.start&&c.end<n.end));
    for(const n of selected.slice(0,64)) {
        const value=offerFrom(n.text), p='/offers/'+source.offers.length;
        source.offers.push(value); bindings[p]=pointer(n);
        if(value.ambiguity.length) ambiguities.push({pointer:p,reasons:value.ambiguity,source:bindings[p]});
    }
    const prose=nodes.filter(n=>['p','li'].includes(n.tag));
    for(const n of prose) {
        const population=n.text.match(new RegExp(escape(objective.serviceName)+'\\s+(?:has|serves)\\s+(over\\s+|more than\\s+|at least\\s+)?([\\d,]+(?:\\.\\d+)?)\\s*(million|thousand)?\\s+(users|members|customers|subscribers|active users)\\b','i'));
        if(population&&!source.population) {
            const count=Number(population[2].replaceAll(',',''))*(population[3]?.toLowerCase()==='million'?1000000:population[3]?.toLowerCase()==='thousand'?1000:1);
            source.population={scope:'SERVICE_TOTAL',measure:population[4].toUpperCase().replaceAll(' ','_'),kind:population[1]?'LOWER_BOUND':'EXACT',count}; bindings['/population']=pointer(n);
        }
        const login=/\b(?:members|users|customers|subscribers) can (?:log in|sign in) to (?:their|an?) account\b/i.test(n.text);
        const management=/\b(?:members|users|customers|subscribers) can manage (?:their|the) (?:subscription|membership) (?:after (?:logging|signing) in|in their account)\b/i.test(n.text);
        if(login||management) source.account??={};
        if(login) {source.account.login=true;bindings['/account/login']=pointer(n);}
        if(management) {source.account.manageMembership=true;bindings['/account/manageMembership']=pointer(n);}
        if(!monetary(n.text).length&&/\b(?:subscription|membership)\b/i.test(n.text)&&/\bmonthly\b/i.test(n.text)) {
            const p='/offers/'+source.offers.length;source.offers.push(offerFrom(n.text));bindings[p]=pointer(n);
        }
    }
    for(const n of nodes.filter(n=>n.tag==='a'&&n.attrs.href).slice(0,512)) {
        const needs=relevance(n.text+' '+(n.attrs['aria-label']??''));
        if(n.attrs.hreflang) needs.push('TARGET_MARKET');
        source.links.push({url:n.attrs.href,needs:[...new Set(needs)],label:n.text.slice(0,160),source:pointer(n)});
    }
    source.links.sort((a,b)=>b.needs.length-a.needs.length||a.url.localeCompare(b.url));
    return {source,bindings,ambiguities,limited:parsed.limited||selected.length>64||nodes.filter(n=>n.tag==='a').length>512};
}

export function interpretWeb(observation, objective) {
    const p=projectWebSource(observation,objective);
    return [{kind:'SERVICE',pointer:''},...p.source.offers.map((_,i)=>({kind:'OFFER',pointer:'/offers/'+i}))];
}

/** Original-language material, with UTF-16 offsets into the immutable body.
 * Structural extraction only: no linguistic normalization or market inference. */
export function semanticMaterial(observation) {
    const body=observation.body, segments=[];
    if(!['text/plain','text/html','application/xhtml+xml'].includes(observation.contentType)) return {segments,presentations:[],limited:false};
    const parsed=document(body,observation.contentType);
    let limited=parsed.limited;
    const add=(start,end)=>{if(body.slice(start,end).trim()) segments.push({start,end,text:body.slice(start,end)});};
    if(observation.contentType==='text/plain') add(0,body.length);
    else {
        const re=/<!--[^]*?-->|<\/?([a-z][\w:-]*)\b[^>]*>/gi, stack=[];
        let cursor=0,tokens=0;
        for(let m;(m=re.exec(body));) {
            if(++tokens>20000||segments.length>=2048||stack.length>=128){limited=true;break;}
            if(!stack.some(n=>n.hidden))add(cursor,m.index);
            const tag=m[1]?.toLowerCase();
            if(tag&&m[0][1]==='/') {const i=stack.findLastIndex(n=>n.tag===tag);if(i>=0)stack.length=i;}
            else if(tag&&!voids.has(tag)&&!m[0].endsWith('/>')) {
                const hidden=['script','style','template'].includes(tag)||/\shidden(?:\s|=|>)/i.test(m[0])||/aria-hidden\s*=\s*["']?true/i.test(m[0])||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(attrs(m[0]).style??'');
                stack.push({tag,hidden});
                if(['script','style','template'].includes(tag)) {
                    const end=new RegExp('</'+tag+'\\s*>','gi');end.lastIndex=re.lastIndex;
                    const close=end.exec(body);re.lastIndex=close?end.lastIndex:body.length;stack.pop();
                }
            }
            cursor=re.lastIndex;
        }
        if(!limited&&!stack.some(n=>n.hidden))add(cursor,body.length);
    }
    const presentations=parsed.nodes.filter(n=>n.tag!=='a').slice(0,256).map((n,i)=>({id:'presentation-'+i,start:n.start,end:n.end}));
    return {segments:segments.slice(0,2048),presentations,limited:limited||parsed.nodes.length>256||segments.length>2048};
}
