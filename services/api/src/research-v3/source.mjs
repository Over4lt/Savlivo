// Bounded deterministic HTML/text interpretation. No network, model calls or V2 policy.
import {directStructuredStrings,interpretPaymentText,structuredSubscriptionContext} from './subscription-language.mjs';
import {structuredMaterial,structuredSources} from './structured-material.mjs';
import {selectedStateContext,providerStates} from './provider-states.mjs';
import {digest, pricePropositions, servicePropositions} from './model.mjs';
import {presentationCapacity as capacity} from './acquisition-contract.mjs';
import {interpretSubscriptionPage} from './subscription-page.mjs';
const documents=new WeakMap(),semanticMaterials=new WeakMap();
function observationDocument(o){const old=documents.get(o),cached=old?.parsed.deref();if(cached&&old.body===o.body&&old.contentType===o.contentType)return cached;const parsed=document(o.body,o.contentType);documents.set(o,{body:o.body,contentType:o.contentType,parsed:new WeakRef(parsed)});return parsed;}

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalized = s => s.normalize('NFKC').replace(/\s+/gu,' ').trim().toLocaleLowerCase('en');
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, key) => {
    if (key[0] !== '#') return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[key.toLowerCase()];
    const n = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2),16) : Number(key.slice(1));
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : all;
});
const text = s => decode(s.replace(/<!--[^]*?-->/g,' ').replace(/<(script|style|template)\b[^>]*>[^]*?<\/\1\s*>/gi,' ').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const attrs = s => Object.fromEntries([...s.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m => [m[1].toLowerCase(),decode(m[2]??m[3]??m[4])]));
const blocks = new Set(['p','li','article','section','div','h1','h2','h3','title','a','form']);
const voids = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);

function document(body, contentType) {
    if(contentType==='text/plain'){
        const nodes=[];let start=0,limited=false;
        const add=end=>{const part=body.slice(start,end);if(part.trim()){if(nodes.length>=capacity.presentations){limited=true;return;}nodes.push({tag:'p',start,end,text:part.trim(),attrs:{}});}};
        for(const separator of body.matchAll(/\n\s*\n/g)){add(separator.index);if(limited)break;start=separator.index+separator[0].length;}
        if(!limited)add(body.length);return {nodes,limited};
    }
    const nodes=[], stack=[],hidden=[]; let limited=false, tokens=0,textBytes=0;
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
        if (++tokens > capacity.tokens) {limited=true; break;}
        if (!m[1]) continue;
        const tag=m[1].toLowerCase(), closing=m[0][1]==='/';
        if (!closing && ['script','style','template'].includes(tag)) {
            const end=new RegExp('</'+tag+'\\s*>','gi'); end.lastIndex=token.lastIndex;
            const close=end.exec(body); token.lastIndex=close?end.lastIndex:body.length; continue;
        }
        if (!closing && !voids.has(tag) && !m[0].endsWith('/>')) {
            if (stack.length >= capacity.depth) {limited=true; break;}
            const attributes=attrs(m[0]);
            stack.push({ancestry:stack.map(a=>a.identity),identity:{tag,start:m.index,role:attributes.role??null,itemType:attributes.itemtype??null,itemProp:attributes.itemprop??null},tag,start:m.index,openEnd:token.lastIndex,attrs:attributes,hidden:stack.some(n=>n.hidden)||/\shidden(?:\s|=|>)/i.test(m[0])||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(attributes.style??'')});
        } else if (closing) {
            const index=stack.findLastIndex(n=>n.tag===tag); if(index<0) continue;
            const n=stack[index]; stack.length=index;
            if(n.hidden)hidden.push({start:n.start,end:token.lastIndex});
            if (blocks.has(tag)) {
                if(n.hidden)continue;
                const visible=visibleText(n.openEnd,m.index);textBytes+=Buffer.byteLength(visible);
                if(textBytes>capacity.textBytes||nodes.length>=capacity.presentations){limited=true;break;}
                if (visible) nodes.push({...n,end:token.lastIndex,text:visible});
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
        if(/\s/.test(raw)) {
            if(!/^\d{1,3}(?: \d{3})+(?:[.,]\d{1,2})?$/.test(raw))return null;
            raw=raw.replaceAll(' ','');
        }
        if(/^\d+$/.test(raw)||/^\d+\.\d{1,2}$/.test(raw))return Number(raw);
        if(/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(raw))return Number(raw.replaceAll(',',''));
        if(/^\d+,\d{1,2}$/.test(raw))return Number(raw.replace(',','.'));
        if(/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(raw))return Number(raw.replaceAll('.','').replace(',','.'));
        return null;
    };
    const re=/\b([A-Z]{3})\s*(\d+(?:[.,]\d+| \d{3})*)(?!\d|[.,]\d)\b|\b(\d+(?:[.,]\d+| \d{3})*)(?!\d|[.,]\d)\s*([A-Z]{3})\b/g;
    for(const m of s.matchAll(re)) {
        const notation=m[2]??m[3],start=m.index+m[0].indexOf(notation),end=start+notation.length;
        // Never read a suffix/prefix of an unresolved numeric group as a price.
        if(/\p{N}[.,\s]+$/u.test(s.slice(0,start))||/^[.,\s]+\p{N}/u.test(s.slice(end)))continue;
        const currency=m[1]??m[4], value=amount(notation);
        if(currencies.has(currency)&&value!==null) found.push({amount:value,currency});
    }
    return found;
}
export function nativePresentationFacts(s) {
    const money=monetary(s), ambiguity=[];
    const repeated= [...new Set(money.map(v=>JSON.stringify(v)))];
    if(repeated.length>1) ambiguity.push('MULTIPLE_MONETARY_VALUES');
    const one=repeated.length===1?JSON.parse(repeated[0]):{};
    const monthly=/\b(?:per month|each month|monthly|every month)\b|\/\s*month\b/i.test(s);
    const annual=/\b(?:per year|yearly|annually|annual|billed yearly)\b|\/\s*(?:year|yr)\b/i.test(s);
    // Flat native extraction cannot associate competing cadence expressions.
    // Leave that relationship to the source-bound presentation understanding path.
    const cadence=annual&&monthly?null:annual?'YEARLY':monthly?'MONTHLY':null;
    if(annual&&monthly)ambiguity.push('CADENCE_RELATIONSHIP_UNRESOLVED');
    if(!cadence) ambiguity.push('CADENCE_NOT_EXPLICIT');
    const relationship=/\bsubscription\b/i.test(s)?'SUBSCRIPTION':/\bmembership\b/i.test(s)?'MEMBERSHIP':null;
    const consumer=/\b(?:consumer|personal|individual)\b/i.test(s) && !/\b(?:business|enterprise|corporate)\b/i.test(s);
    const uncertain=/\b(?:not|no|example|illustrative|starting at|from)\b/i.test(s);
    const role=/\b(?:benefits?|credits?|worth|value of)\b/i.test(s)?'BENEFIT':uncertain?null:/\b(?:trial|introductory|first month|first \d+ months|promotional)\b/i.test(s)?'TRIAL':/\b(?:benefits?|credits?|worth|value of)\b/i.test(s)?'BENEFIT':/\bdiscount\b/i.test(s)?'DISCOUNT':relationship?'ORDINARY':null;
    const amountDerivation=/\b(?:divided by|equivalent|installment|instalment)\b|\/\s*12\b/i.test(s)?'ARITHMETIC':'EXPLICIT';
    if(!one.currency) ambiguity.push('CURRENCY_OR_AMOUNT_NOT_EXPLICIT');
    return {...one,cadence,relationship,consumer:consumer&&!uncertain?true:null,role,amountDerivation,market:explicitMarket(s),ambiguity};
}
// Optional native understanding of actual selected source labels. Annual
// benefits are not billing intervals. Uninterpreted associated conditions are
// preserved for semantic understanding rather than silently treated as absent.
export function nativeStateContext(s) {
    const facts=nativePresentationFacts(s);
    if(/\b(?:no|not|without)\b/i.test(s))return {purpose:'UNKNOWN',cadence:null};
    if(['BENEFIT','CREDIT'].includes(facts.role))return {purpose:'FEATURE',cadence:null};
    // Native fallback understands a payment predicate, not co-occurrence of
    // a cost display somewhere and an unrelated billed amount elsewhere.
    // This small optional grammar is not the multilingual semantic interpreter.
    const linked=s.match(/\b(?:billed|billing|charged|paid|pay|payments?)\s+(?:[^.;!?\n]{0,48}?)(monthly|yearly|annually|every month|each month|per month|once per year|every year|per year)\b|\b(monthly|yearly|annual)\s+(?:billing|payments?)\b/gi)??[];
    const cadences=[...new Set(linked.map(t=>/\b(?:monthly|every month|each month|per month)\b/i.test(t)?'MONTHLY':'YEARLY'))];
    if(cadences.length===1)return {purpose:'BILLING',cadence:cadences[0]};
    return {purpose:'UNKNOWN',cadence:null};
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
    const parsed=observationDocument(observation), nodes=parsed.nodes,state=providerStates(observation);
    const name=new RegExp('(?:^|[^\\p{L}\\p{N}])'+escape(objective.serviceName)+'(?=$|[^\\p{L}\\p{N}])','iu');
    const pointer=n=>({start:n.start,end:n.end,sha256:digest(observation.body.slice(n.start,n.end))});
    const identity=nodes.find(n=>['title','h1','p'].includes(n.tag)&&name.test(n.text));
    if(identity) {source.serviceId=objective.serviceId; bindings['/serviceId']=pointer(identity);}
    const subscriptionPage=interpretSubscriptionPage({body:observation.body,url:observation.url}),pageService=subscriptionPage.services.find(row=>normalized(row.name)===normalized(objective.serviceName));
    if(pageService&&source.serviceId===objective.serviceId)for(const offering of subscriptionPage.offerings)for(const [chargeIndex,charge]of offering.charges.entries()){
        const p='/offers/'+source.offers.length,id=digest([new URL(observation.url).hostname,normalized(objective.serviceName),normalized(offering.name),charge.cadence,charge.amount,charge.currency,chargeIndex]);
        source.offers.push({id,amount:charge.amount,currency:charge.currency,cadence:charge.cadence,billingCadence:charge.billingCadence,consumer:charge.consumer,relationship:charge.relationship,role:charge.role,monetaryKind:charge.monetaryKind,amountDerivation:charge.amountDerivation,market:null});
        bindings[p]={start:offering.presentation.start,end:offering.presentation.end,sha256:offering.presentation.sha256,offer:offering.name,offerIdentity:offering.nameLocator,nativePageStructure:true,charge:{text:charge.text,cadence:charge.cadence,billingCadence:charge.billingCadence,...(charge.composition?{composition:charge.composition}:{})}};
        if(charge.billingCadence==='UNKNOWN')ambiguities.push({pointer:p,reasons:['PAYMENT_CADENCE_UNRESOLVED'],source:bindings[p]});
    }
    // Keep an offer within one presentation. Prefer small enclosing offer sections,
    // never pool an entire page's prices, currencies and headings.
    if(state.limited)ambiguities.push({reason:'SOURCE_STATE_CONTEXT_BOUND'});
    const priced=state.limited||subscriptionPage.offerings.length?[]:nodes.filter(n=>n.tag!=='a'&&monetary(n.text).length&&/\b(?:subscription|membership)\b/i.test(n.text));
    const selected=priced.filter((n,i)=>!(priced[i+1]?.start>n.start&&priced[i+1].end<n.end));
    for(const n of selected.slice(0,64)) {
        const context=selectedStateContext(observation,n);
        const labels=context.map(c=>c.spans.map(s=>observation.body.slice(s.start,s.end)).join(' ')),understood=labels.map(nativeStateContext);
        const stateContext=labels.filter((_,i)=>understood[i].purpose==='BILLING').join(' ');
        const value=nativePresentationFacts([n.text,stateContext].filter(Boolean).join(' ')), p='/offers/'+source.offers.length;
        if(understood.some(c=>c.purpose==='BILLING'&&c.cadence==='YEARLY')&&nativePresentationFacts(n.text).cadence==='MONTHLY')value.amountDerivation='ARITHMETIC';
        if(understood.some(c=>c.purpose==='UNKNOWN')){value.amountDerivation='UNKNOWN';value.ambiguity.push('SELECTED_SOURCE_CONTEXT_UNINTERPRETED');}

        source.offers.push(value); bindings[p]={...pointer(n),...(context.length?{context:context.map(c=>({...c,spans:c.spans.map(s=>({...s,sha256:digest(observation.body.slice(s.start,s.end))}))}))}: {})};
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
            const p='/offers/'+source.offers.length;source.offers.push(nativePresentationFacts(n.text));bindings[p]=pointer(n);
        }
    }
    for(const n of nodes.filter(n=>n.tag==='a'&&n.attrs.href).slice(0,512)) {
        const needs=relevance(n.text+' '+(n.attrs['aria-label']??''));
        if(n.attrs.hreflang) needs.push('TARGET_MARKET');
        source.links.push({url:n.attrs.href,needs:[...new Set(needs)],label:n.text.slice(0,160),source:pointer(n)});
    }
    source.links.sort((a,b)=>b.needs.length-a.needs.length||a.url.localeCompare(b.url));
    return {source,bindings,ambiguities,limited:parsed.limited||state.limited||selected.length>64||nodes.filter(n=>n.tag==='a').length>512};
}

export function interpretWeb(observation, objective) {
    const p=projectWebSource(observation,objective);
    return [{kind:'SERVICE',pointer:''},...p.source.offers.map((_,i)=>({kind:'OFFER',pointer:'/offers/'+i}))];
}

/** Original-language material, with UTF-16 offsets into the immutable body.
 * Structural extraction only: no linguistic normalization or market inference. */
export function semanticMaterial(observation) {
    const previous=semanticMaterials.get(observation),cached=previous?.material.deref();
    if(cached&&previous.body===observation.body&&previous.contentType===observation.contentType&&previous.sha256===observation.sha256&&previous.id===observation.id&&previous.truncated===observation.truncated&&previous.completeness===observation.completeness)return structuredClone(cached);
    const body=observation.body, segments=[];
    if(!['text/plain','text/html','application/xhtml+xml','application/json','application/ld+json'].includes(observation.contentType)) return {segments,presentations:[],limited:false};
    const isJson=['application/json','application/ld+json'].includes(observation.contentType);
    const parsed=isJson?{nodes:[],limited:false}:observationDocument(observation);
    let limited=parsed.limited;
    const stateLimited=providerStates(observation).limited;
    const add=(start,end)=>{if(body.slice(start,end).trim()) segments.push({start,end,text:body.slice(start,end)});};
    if(observation.contentType==='text/plain') parsed.nodes.forEach(n=>add(n.start,n.end));
    else if(!isJson) {
        const re=/<!--[^]*?-->|<\/?([a-z][\w:-]*)\b[^>]*>/gi, stack=[];
        let cursor=0,tokens=0;
        for(let m;(m=re.exec(body));) {
            if(++tokens>capacity.tokens||segments.length>=capacity.segments||stack.length>=capacity.depth){limited=true;break;}
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
    // Accessibility labels are exact source attributes, not invented visible
    // quotations. Selected control relationships retain their source tag/hash.
    for(const g of providerStates(observation).groups)for(const v of g.variants.filter(v=>v.selected&&v.submission!=='OMIT'))for(const b of v.labelSpans)
        if(b.start>=v.source.start&&b.end<=v.source.end&&!segments.some(s=>s.start<=b.start&&s.end>=b.end))add(b.start,b.end);
    segments.sort((a,b)=>a.start-b.start||a.end-b.end);
    const schema=observation.contentType==='text/plain'?{regions:[],limited:false}:structuredMaterial(body),structured=structuredSources(body,observation.contentType);
    const inert={regions:[...schema.regions,...structured.regions.filter(r=>!schema.regions.some(p=>r.start>=p.start&&r.end<=p.end))],limited:schema.limited||structured.limited};
    for(const r of inert.regions){
        add(r.start,r.end);
        const record=directStructuredStrings(body.slice(r.start,r.end),r.start);
        if(!record||record.limited)continue;
        const context=structuredSubscriptionContext(record.value);
        for(const row of record.rows){
            add(row.start,row.end);
            for(const c of interpretPaymentText(row.raw,context)){
                const phrase=c.paymentText??(row.raw.slice(c.left,c.right)+(c.duration?row.raw.slice(c.right,c.right+row.raw.slice(c.right).indexOf(c.duration)+c.duration.length):''));
                const at=row.raw.indexOf(phrase,c.left);
                if(at>=0&&phrase.length)add(row.start+at,row.start+at+phrase.length);
            }
        }
    }
    // Identical nested lexical witnesses occur only once.
    const unique=new Map(segments.map(s=>[s.start+':'+s.end,s]));segments.splice(0,segments.length,...unique.values());
    // Optional metadata scan exhaustion does not invalidate complete visible text.

    segments.sort((a,b)=>a.start-b.start||a.end-b.end);
    const presentations=parsed.nodes.filter(n=>n.tag!=='a').slice(0,capacity.presentations).map((n,i)=>({id:'presentation-'+i,start:n.start,end:n.end,tag:n.tag,role:n.attrs.role??null,itemType:n.attrs.itemtype??null,itemProp:n.attrs.itemprop??null,ancestry:n.ancestry??[]}));
    for(const [i,r]of inert.regions.entries())presentations.push({id:'structured-'+i,start:r.start,end:r.end,tag:'script-data',role:null,itemType:r.type,itemProp:null,ancestry:[],...(r.pointer!==undefined?{structuredPath:r.pointer,parentPath:r.parent}: {}),...(r.embedded?{embedded:structuredClone(r.embedded)}:{})});
    const material={segments:segments.slice(0,capacity.segments),presentations,structuredLimited:inert.limited,stateLimited,limited:limited||parsed.nodes.length>capacity.presentations||segments.length>capacity.segments};
    semanticMaterials.set(observation,{body,contentType:observation.contentType,sha256:observation.sha256,id:observation.id,truncated:observation.truncated,completeness:observation.completeness,material:new WeakRef(material)});return structuredClone(material);
}

// Structural destination provenance. Labels are routing hints, never truth.
export function semanticDestinations(o) {
    if(['application/json','application/ld+json'].includes(o.contentType))return [];
    return observationDocument(o).nodes.filter(n=>(n.tag==='a'&&n.attrs.href)||(n.tag==='form'&&n.attrs.action)).slice(0,512).map((n,i)=>({id:'destination-'+i,kind:n.tag==='form'?'FORM':'LINK',url:n.attrs.href??n.attrs.action,start:n.start,end:n.end,label:n.text.slice(0,256)}));
}
