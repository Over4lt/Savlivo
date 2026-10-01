// Derived artifacts supplement, never erase, usable original evidence.
import {projectWebSource} from './source.mjs';
import {projectTranslation} from './translation.mjs';
import {projectEvidence} from './evidence.mjs';
export function projectObservation(o,objective) {
    const parts=[projectWebSource(o,objective)],errors=[];
    for(const [key,project] of [['translation',projectTranslation],['evidence',projectEvidence]]) {
        if(!o[key])continue;
        const p=project(o,objective);
        if(p.error)errors.push({kind:key,code:p.error});else parts.push(p);
    }
    // A validated explicit graph resolves the semantics of an overlapping native
    // partial presentation. Do not retain an anonymous duplicate offer that can
    // hide a real contradiction for the identified offer. Unrelated native offers
    // and all native evidence on failed/ambiguous understanding remain available.
    const graph=parts.find(p=>p.accepted);
    if(graph) {
        const covered=Object.values(graph.bindings).filter(b=>b.presentation&&graph.accepted.some(a=>a.offer===b.offerIndex&&a.charge===b.charge)).map(b=>b.presentation);
        const native=parts[0];
        for(const [i,offer] of graph.source.offers.entries()) {
            const p=graph.bindings['/offers/'+i].presentation;
            const contexts=native.source.offers.filter((_,j)=>{const b=native.bindings['/offers/'+j];return b&&b.start>=p.start&&b.end<=p.end;}).filter(o=>o.market);
            const markets=[...new Set(contexts.map(o=>o.market))];
            if(markets.length>1||markets.length===1&&offer.market&&offer.market!==markets[0]){offer.market=null;offer.marketAmbiguous=true;}
            else if(markets.length===1&&!offer.market&&!offer.marketAmbiguous) {
                offer.market=markets[0];graph.bindings['/offers/'+i].nativeMarketContext=contexts;
            }
        }
        const original=parts[0],offers=[],bindings={...original.bindings};
        for(const [i,offer] of original.source.offers.entries()) {
            const b=original.bindings['/offers/'+i];
            if(b&&covered.some(p=>b.start>=p.start&&b.end<=p.end))continue;
            bindings['/offers/'+offers.length]=b;offers.push(offer);
        }
        parts[0]={...original,source:{...original.source,offers},bindings};
    }
    const source={offers:[],populations:[],accountStatements:[],links:parts[0].source.links??[]},bindings={};
    for(const p of parts) {
        for(const field of ['serviceId','population','account'])if(source[field]===undefined&&p.source[field]!==undefined)source[field]=p.source[field];
        for(const [pointer,b] of Object.entries(p.bindings))if(!['offers','populations','accountStatements'].some(k=>pointer.startsWith('/'+k+'/'))&&bindings[pointer]===undefined)bindings[pointer]=b;
        for(const key of ['offers','populations','accountStatements'])for(const [i,value] of (p.source[key]??[]).entries()) {
            const pointer='/'+key+'/'+source[key].length;source[key].push(value);bindings[pointer]=p.bindings['/'+key+'/'+i];
        }
    }
    return {source,bindings,errors,limited:parts.some(p=>p.limited),candidates:[{kind:'SERVICE',pointer:''},...source.offers.map((_,i)=>({kind:'OFFER',pointer:'/offers/'+i}))]};
}
