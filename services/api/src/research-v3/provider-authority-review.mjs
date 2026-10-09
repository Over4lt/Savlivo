// A candidate page can grant sourcing authority only by presenting the
// requested service as the page publisher's own offering. This is not Truth.
import {digest,normalizeUrl} from './model.mjs';

const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const span=(body,match)=>({start:match.index,end:match.index+match[0].length,quote:match[0],sha256:digest(match[0])});

export function reviewCandidateAuthority(observation,objective) {
    const o=observation,body=o?.body;
    if(o?.kind!=='CANDIDATE'||o.authority!=='UNREVIEWED_CANDIDATE'||o.outcome!=='OK'||o.truncated||o.completeness!=='COMPLETE'||typeof body!=='string'||!body.trim()||o.sha256!==digest(body)||o.context?.representation!=='CANDIDATE_PAGE'||o.format!=='WEB'||!Number.isInteger(o.httpStatus)||o.httpStatus<200||o.httpStatus>=300||!Array.isArray(o.access)||!o.access.length||o.access.some(a=>a.decision!=='ALLOWED'))return null;
    const url=normalizeUrl(o.url);
    if(!url||url!==o.url||!(objective.candidateHosts??[]).includes(new URL(url).hostname))return null;
    const name=objective.serviceName?.trim();
    if(!name||name.length<4||name.length>100)return null;
    const service=new RegExp('(?<![\\p{L}\\p{N}])'+name.split(/\s+/u).map(escape).join('\\s+')+'(?![\\p{L}\\p{N}])','iu');
    const publisherName=new RegExp('^(?:©|&copy;|\\\\u00a9)\\s*'+name.split(/\s+/u).map(escape).join('\\s+')+'(?![\\p{L}\\p{N}])','iu');
    // A quoted brand, matching title, or copyright alone is insufficient.
    // The copyright must be the page's own footer (HTML or page-state field).
    const publisherSources=[...body.matchAll(/<footer\b[^>]*>[\s\S]{0,16000}?<\/footer\s*>/giu),...body.matchAll(/"(?:copyright|copyrightFooter)"\s*:\s*\{[^{}]{0,320}\}/giu)];
    const publishers=publisherSources.flatMap(section=>[...section[0].matchAll(/(?:©|&copy;|\\u00a9)\s*[^<"\\]{1,160}/giu)].map(match=>({index:section.index+match.index,0:match[0]})));
    if(!publishers.length)return null;
    // Explicitly disclaimed affiliation defeats first-party presentation.
    if(/\b(?:not affiliated with|unaffiliated with|independent of|unofficial|third.party (?:seller|reseller|review))\b/iu.test(body))return null;
    // One local first-person statement must tie the publisher to its own
    // service/product. Selling, reviewing, or listing another's item is not it.
    const presentations=[...body.matchAll(/\b(?:we\s+(?:provide|operate|develop|publish|offer|create)|our)\b[^<>"\r\n]{0,190}/giu)];
    const firstPerson=presentations.find(match=>service.test(match[0])&&/\b(?:service|membership|app|platform|product|software|library|classes|content|subscription)\b/iu.test(match[0])&&!/\b(?:review|comparison|article|news|guide|resell|reseller|stock|distribut|third.party|sell)\b/iu.test(match[0]));
    let publisher=firstPerson?publishers.find(match=>publisherName.test(match[0])):null;
    let relation=publisher?firstPerson:null;
    if(!relation)for(const candidate of publishers){
        const operator=candidate[0].match(/^(?:©|&copy;)\s*([^\d<"\\]{2,80}?)\s+\d{4}\b/iu)?.[1]?.trim();
        if(operator){
            const identity=escape(operator),product=name.split(/\s+/u).map(escape).join('\\s+');
            const statement=new RegExp('(?:'+identity+'\\s+(?:operates|provides|offers|governs|develops|publishes)\\s+'+product+'|'+product+'\\s+is\\s+(?:operated|provided|offered|governed|developed|published)\\s+by\\s+'+identity+')(?![\\p{L}\\p{N}])','iu');
            const match=statement.exec(body);
            if(match){publisher=candidate;relation=match;break;}
        }
    }
    if(!relation)return null;
    const host=new URL(url).hostname;
    return {host,kind:'AUTONOMOUS_FIRST_PARTY_PRESENTATION',reason:'FIRST_PARTY_PRESENTATION',scope:'EXACT_HOST_PROVIDER_SOURCING',sourceRole:'CANDIDATE_PAGE',serviceId:objective.serviceId,serviceName:name,url,observation:o.id,bodySha256:o.sha256,locators:{publisher:span(body,publisher),relation:span(body,relation)}};
}
