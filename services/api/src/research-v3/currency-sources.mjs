import {digest} from './model.mjs';
import {compatibleCurrencies,marketCurrencyMetadata} from './market-currencies.mjs';
// Generic ICU currency metadata; no observation country/language decoder.
const currencyTokens=new Map();
for(const code of Intl.supportedValuesOf('currency')) {
    const add=token=>{if(!token||token.length>8)return;const key=token.normalize('NFKC');if(!currencyTokens.has(key))currencyTokens.set(key,new Set());currencyTokens.get(key).add(code);};
    add(code);
    for(const currencyDisplay of ['symbol','narrowSymbol'])for(const part of new Intl.NumberFormat('en',{style:'currency',currency:code,currencyDisplay}).formatToParts(1))if(part.type==='currency')add(part.value);
}
const tokens=[...currencyTokens.keys()].sort((a,b)=>b.length-a.length);
export function currencyOccurrences(request) {
    const prefix=digest([request.observation.id,request.observation.sha256,request.unit?.id??request.material.segments]).slice(0,12),rows=[];
    for(const [i,s] of request.material.segments.entries()) {
        // NFKC can expand characters; keep an explicit normalized-to-original map.
        let normalized='',map=[];
        for(let j=0;j<s.text.length;) {const char=String.fromCodePoint(s.text.codePointAt(j)),n=char.normalize('NFKC');for(let k=0;k<n.length;k++)map.push({start:j,end:j+char.length});normalized+=n;j+=char.length;}
        for(let at=0;at<normalized.length;) {
            const token=tokens.find(t=>normalized.startsWith(t,at)&&(!/[A-Za-z]/.test(t)||!/[A-Za-z]/.test(normalized[at-1]??'')&&!/[A-Za-z]/.test(normalized[at+t.length]??'')));
            if(!token){at++;continue;}
            const start=s.start+map[at].start,end=s.start+map[at+token.length-1].end,raw=s.text.slice(start-s.start,end-s.start);
            rows.push({id:'u-'+prefix+'-'+rows.length,segment:'s'+i,raw,candidates:[...currencyTokens.get(token)].sort(),explicit:currencyTokens.get(token).size===1&&/^[A-Z]{3}$/.test(token),start,end});
            if(rows.length>64)throw Error('WIRE_CURRENCY_BOUND');at+=token.length;
        }
    }
    return rows;
}

export function resolveSourceCurrency({occurrence,selected,explicit=[],market=null,verification=null}) {
 const initial=occurrence.candidates,source=explicit.length===1?initial.filter(c=>explicit.includes(c)):initial;
 const compatible=market?compatibleCurrencies(market):[],intersection=source.filter(c=>compatible.includes(c));
 const considered=selected===null&&source.length>1&&market!==null&&verification==='BRACKET_VERIFIED'&&explicit.length<=1;
 const code=selected!==null&&!source.includes(selected)?null:selected??(source.length===1?source[0]:considered&&intersection.length===1?intersection[0]:null);
 return {code,diagnostics:{occurrence:occurrence.id,raw:occurrence.raw,start:occurrence.start,end:occurrence.end,initialCandidates:initial,semanticCurrency:selected,explicitCandidates:explicit,verifiedMarket:market,verification,marketNarrowingConsidered:considered,compatibleIntersection:intersection,result:code,reason:selected!==null?(source.includes(selected)?'SEMANTIC_SOURCE_SELECTION':'SOURCE_SELECTION_CONFLICT'):source.length===1?'UNAMBIGUOUS_SOURCE':considered&&intersection.length===1?'VERIFIED_MARKET_NARROWING':considered?'NON_UNIQUE_MARKET_INTERSECTION':'NO_VERIFIED_MARKET',metadataVersion:marketCurrencyMetadata.version}};
}
