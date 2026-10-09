// A candidate page can grant sourcing authority only by presenting the
// requested service as the page publisher's own offering. This is not Truth.
import {digest,normalizeUrl} from './model.mjs';

const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const span=(body,match)=>({start:match.index,end:match.index+match[0].length,quote:match[0],sha256:digest(match[0])});
export const structuredExactOriginBounds=Object.freeze({scripts:16,scriptBytes:128*1024,totalBytes:256*1024,nodes:4096,depth:24});
const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]{1,128})\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gu)].map(match=>[match[1].toLowerCase(),match[2]??match[3]??match[4]]));
const identity=value=>typeof value==='string'?value.normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase():null;
const values=value=>typeof value==='string'?[value]:Array.isArray(value)&&value.every(row=>typeof row==='string')?value:[];
const types=value=>new Set(values(value));
const organizationType=value=>value==='Organization'||value==='Corporation'||/^https?:\/\/schema\.org\/(?:Organization|Corporation)\/?$/.test(value);
const pointer=(base,key)=>base+'/'+String(key).replaceAll('~','~0').replaceAll('/','~1');

function structuredDocument(body){
    const scripts=[],canonicals=[];let totalNodes=0;
    const tokens=/<!--[\s\S]*?-->|<(?:style|template|noscript)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/(?:style|template|noscript)\s*>|<script\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/script\s*>|<link\b(?:[^>"']|"[^"]*"|'[^']*')*>/giu;
    for(const match of body.matchAll(tokens)){
        if(match[0].startsWith('<!--'))continue;
        if(/^<link\b/iu.test(match[0])){
            const a=attrs(match[0]);if((a.rel??'').split(/\s+/u).some(row=>row.toLowerCase()==='canonical')&&a.href)canonicals.push(a.href);continue;
        }
        const open=match[0].slice(0,match[0].indexOf('>')+1),a=attrs(open);
        if((a.type??'').trim().toLowerCase()!=='application/ld+json')continue;
        if(scripts.length>=structuredExactOriginBounds.scripts)return null;
        const offset=match.index+open.length,end=match.index+match[0].lastIndexOf('</'),raw=body.slice(offset,end),bytes=Buffer.byteLength(raw);
        if(bytes>structuredExactOriginBounds.scriptBytes||scripts.reduce((sum,row)=>sum+row.bytes,0)+bytes>structuredExactOriginBounds.totalBytes)return null;
        let data;try{data=JSON.parse(raw);}catch{return null;}
        const stack=[{value:data,depth:0,path:'',root:true}],entities=[];
        while(stack.length){
            const current=stack.pop();if(++totalNodes>structuredExactOriginBounds.nodes||current.depth>structuredExactOriginBounds.depth)return null;
            const value=current.value;if(!value||typeof value!=='object')continue;
            if(!Array.isArray(value)&&(current.root===true||current.graph===true))entities.push({value,path:current.path||'',script:scripts.length});
            for(const [key,child]of Object.entries(value)){
                if(!child||typeof child!=='object')continue;
                if(Array.isArray(child))for(let index=child.length-1;index>=0;index--)stack.push({value:child[index],depth:current.depth+1,path:pointer(pointer(current.path,key),index),graph:key==='@graph',root:current.root===true&&Array.isArray(value)});
                else stack.push({value:child,depth:current.depth+1,path:pointer(current.path,key),graph:key==='@graph',root:current.root===true&&Array.isArray(value)});
            }
        }
        scripts.push({offset,end,bytes,raw,data,entities,sha256:digest(raw)});
    }
    return {scripts,canonicals};
}

function structuredExactOrigin(body,url,name){
    const parsed=structuredDocument(body);if(!parsed||!parsed.scripts.length)return null;
    const host=new URL(url).hostname;
    for(const href of parsed.canonicals){let canonical;try{canonical=new URL(href,url);}catch{continue;}if(canonical.hostname!==host)return null;}
    const groups=[],byId=new Map();
    for(const script of parsed.scripts)for(const entity of script.entities){
        if(typeof entity.value['@id']==='string'&&entity.value['@id'].length>2048)return null;
        const id=typeof entity.value['@id']==='string'?entity.value['@id']:null,row={...entity,source:script};
        if(id){const group=byId.get(id)??{id,rows:[]};group.rows.push(row);byId.set(id,group);}else groups.push({id:null,rows:[row]});
    }
    groups.push(...byId.values());
    const target=identity(name),claims=[];let invalid=false;
    for(const group of groups){
        const typeRows=group.rows.flatMap(row=>values(row.value['@type']).map(value=>({value,path:pointer(row.path,'@type'),source:row.source}))),kind=new Set(typeRows.map(row=>row.value));
        if(![...kind].some(organizationType))continue;
        const names=group.rows.flatMap(row=>values(row.value.name).map(value=>({value,path:pointer(row.path,'name'),source:row.source})));
        const exactNames=names.filter(row=>identity(row.value)===target);if(!exactNames.length)continue;
        for(const row of group.rows)for(const value of values(row.value.url)){
            const normalized=normalizeUrl(value,url);if(!normalized){invalid=true;continue;}
            claims.push({normalized,path:pointer(row.path,'url'),source:row.source,id:group.id,typeRows:typeRows.filter(row=>organizationType(row.value)),nameRows:exactNames,groupRows:group.rows});
        }
    }
    if(invalid||!claims.length||new Set(claims.map(row=>new URL(row.normalized).hostname)).size!==1||new URL(claims[0].normalized).hostname!==host)return null;
    const claim=claims[0],sources=[...new Map(claim.groupRows.map(row=>[row.source.offset,row.source])).values()].map(source=>({start:source.offset,end:source.end,sha256:source.sha256}));
    return {reason:'STRUCTURED_EXACT_ORIGIN_IDENTITY',locators:{structuredSources:sources,representation:{id:claim.id,jsonPointers:{types:claim.typeRows.map(row=>row.path),names:claim.nameRows.map(row=>row.path),url:claim.path},normalizedUrl:claim.normalized}}};
}

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
    const host=new URL(url).hostname;
    if(relation)return {host,kind:'AUTONOMOUS_FIRST_PARTY_PRESENTATION',reason:'FIRST_PARTY_PRESENTATION',scope:'EXACT_HOST_PROVIDER_SOURCING',sourceRole:'CANDIDATE_PAGE',serviceId:objective.serviceId,serviceName:name,url,observation:o.id,bodySha256:o.sha256,locators:{publisher:span(body,publisher),relation:span(body,relation)}};
    const structured=structuredExactOrigin(body,url,name);if(!structured)return null;
    return {host,kind:'AUTONOMOUS_FIRST_PARTY_PRESENTATION',reason:structured.reason,scope:'EXACT_HOST_PROVIDER_SOURCING',sourceRole:'CANDIDATE_PAGE',serviceId:objective.serviceId,serviceName:name,url,observation:o.id,bodySha256:o.sha256,locators:structured.locators};
}
