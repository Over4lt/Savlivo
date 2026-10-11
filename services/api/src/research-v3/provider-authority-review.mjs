// A candidate page can grant sourcing authority only through a source-bound
// requested identity and exact-origin provider presentation. This is not Truth.
import {digest,normalizeUrl} from './model.mjs';
import {createResearchTarget,researchTargetKinds} from './research-target.mjs';

const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const span=(body,match)=>({start:match.index,end:match.index+match[0].length,quote:match[0],sha256:digest(match[0])});
export const structuredExactOriginBounds=Object.freeze({scripts:16,scriptBytes:128*1024,totalBytes:256*1024,nodes:4096,depth:24});
const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w:-]{1,128})\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gu)].map(match=>[match[1].toLowerCase(),match[2]??match[3]??match[4]]));
const identity=value=>typeof value==='string'?value.normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase():null;
const values=value=>typeof value==='string'?[value]:Array.isArray(value)&&value.every(row=>typeof row==='string')?value:[];
const types=value=>new Set(values(value));
const organizationType=value=>value==='Organization'||value==='Corporation'||/^https?:\/\/schema\.org\/(?:Organization|Corporation)\/?$/.test(value);
const schemaType=(value,name)=>value===name||new RegExp('^https?://schema\\.org/'+name+'/?$').test(value);
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
    return {reason:'STRUCTURED_EXACT_ORIGIN_IDENTITY',providerIdentity:{presentationName:claim.nameRows[0].value,legalName:null},locators:{structuredSources:sources,representation:{id:claim.id,jsonPointers:{types:claim.typeRows.map(row=>row.path),names:claim.nameRows.map(row=>row.path),url:claim.path},normalizedUrl:claim.normalized}}};
}

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const rowsFor=(group,key)=>group.rows.flatMap(row=>values(row.value[key]).map(value=>({value,path:pointer(row.path,key),source:row.source})));
const typeRows=group=>rowsFor(group,'@type');
const sourcesFor=rows=>[...new Map(rows.map(row=>[row.source.offset,row.source])).values()].map(source=>({start:source.offset,end:source.end,sha256:source.sha256}));
const providerKey=group=>group.id?'id:'+group.id:'node:'+group.rows[0].source.offset+':'+group.rows[0].path;

function groupsFor(scripts,{crossScript=false}={}){
    const groups=[],byId=new Map();
    for(const script of scripts)for(const entity of script.entities){
        const id=typeof entity.value['@id']==='string'?entity.value['@id']:null;
        if(id&&id.length>2048)return null;
        const row={...entity,source:script};
        if(id){
            const key=crossScript?id:script.offset+'\n'+id,group=byId.get(key)??{id,rows:[]};
            group.rows.push(row);byId.set(key,group);
        }else groups.push({id:null,rows:[row]});
    }
    groups.push(...byId.values());return groups;
}

function exactTypedIdentity(group,type,target){
    const declared=typeRows(group),kinds=declared.map(row=>row.value);
    if(!kinds.length||!kinds.every(value=>schemaType(value,type)))return {status:'NOT_THIS_TYPE'};
    const names=rowsFor(group,'name'),normalized=[...new Set(names.map(row=>identity(row.value)))];
    if(!names.length||normalized.length!==1)return {status:'INVALID'};
    return normalized[0]===target?{status:'MATCH',typeRows:declared,nameRows:names}:{status:'NO_MATCH'};
}

function exactOriginOrganization(group,url){
    const declared=typeRows(group),kinds=declared.map(row=>row.value);
    if(!kinds.length||!kinds.every(organizationType))return {status:'NOT_ORGANIZATION'};
    const names=rowsFor(group,'name'),normalizedNames=[...new Set(names.map(row=>identity(row.value)))],urls=rowsFor(group,'url');
    if(!names.length||normalizedNames.length!==1||!urls.length)return {status:'INVALID'};
    const normalized=[];
    for(const row of urls){const value=normalizeUrl(row.value,url);if(!value)return {status:'INVALID'};normalized.push({...row,normalized:value});}
    const host=new URL(url).hostname;
    if(normalized.some(row=>new URL(row.normalized).hostname!==host))return {status:'INVALID'};
    return {status:'MATCH',group,key:providerKey(group),typeRows:declared,nameRows:names,urlRows:normalized};
}

function relationshipTargets(row,predicate,byId){
    if(!Object.hasOwn(row.value,predicate))return [];
    const raw=row.value[predicate],items=Array.isArray(raw)?raw.map((value,index)=>({value,path:pointer(pointer(row.path,predicate),index)})):[{value:raw,path:pointer(row.path,predicate)}],targets=[];
    if(!items.length)return null;
    for(const item of items){
        if(!object(item.value))return null;
        const keys=Object.keys(item.value);
        if(keys.length===1&&keys[0]==='@id'&&typeof item.value['@id']==='string'){
            const group=byId.get(item.value['@id']);if(!group)return null;
            targets.push({group,path:item.path,reference:pointer(item.path,'@id')});continue;
        }
        if(typeof item.value['@id']==='string'&&(item.value['@id'].length>2048||byId.has(item.value['@id'])))return null;
        targets.push({group:{id:typeof item.value['@id']==='string'?item.value['@id']:null,rows:[{value:item.value,path:item.path,source:row.source}]},path:item.path,reference:null});
    }
    return targets;
}

function relatedRepresentation({requested,relationship,provider}){
    const rows=[...requested.group.rows,...provider.group.rows],sources=sourcesFor(rows);
    return {reason:'STRUCTURED_EXACT_ORIGIN_RELATED_IDENTITY',providerIdentity:{presentationName:provider.nameRows[0].value,legalName:null},providerKey:provider.key,sortKey:[relationship.predicate,relationship.path,requested.group.id??requested.group.rows[0].path].join('\n'),locators:{structuredSources:sources,representation:{requestedIdentity:{id:requested.group.id,type:requested.type,jsonPointers:{types:requested.typeRows.map(row=>row.path),names:requested.nameRows.map(row=>row.path)}},relationship:{predicate:relationship.predicate,jsonPointer:relationship.path,targetId:relationship.targetId,referencePointer:relationship.reference},providerOrganization:{id:provider.group.id,jsonPointers:{types:provider.typeRows.map(row=>row.path),names:provider.nameRows.map(row=>row.path),urls:provider.urlRows.map(row=>row.path)},normalizedUrls:provider.urlRows.map(row=>row.normalized)}}}};
}

function structuredIdentityRelationship(body,url,name){
    const parsed=structuredDocument(body);if(!parsed||!parsed.scripts.length)return null;
    const host=new URL(url).hostname;
    for(const href of parsed.canonicals){let canonical;try{canonical=new URL(href,url);}catch{continue;}if(canonical.hostname!==host)return null;}
    const target=identity(name),proofs=[];

    // New direct identities may compose exact @id fragments across scripts just
    // as the legacy exact-name proof already does. The legacy proof runs first
    // and therefore keeps its binding representation byte-stable.
    const directGroups=groupsFor(parsed.scripts,{crossScript:true});if(!directGroups)return null;
    for(const group of directGroups){
        const declared=typeRows(group),kinds=declared.map(row=>row.value);if(!kinds.some(organizationType))continue;
        const names=rowsFor(group,'name'),exactName=names.some(row=>identity(row.value)===target),alternate=rowsFor(group,'alternateName').filter(row=>identity(row.value)===target),legal=rowsFor(group,'legalName').filter(row=>identity(row.value)===target);
        if(!exactName&&!alternate.length&&!legal.length)continue;
        const provider=exactOriginOrganization(group,url);if(provider.status!=='MATCH')return null;
        if(exactName)continue;
        const requested=alternate.length?{property:'alternateName',rows:alternate,reason:'STRUCTURED_EXACT_ORIGIN_ALTERNATE_IDENTITY'}:{property:'legalName',rows:legal,reason:'STRUCTURED_EXACT_ORIGIN_LEGAL_IDENTITY'};
        proofs.push({reason:requested.reason,providerIdentity:{presentationName:provider.nameRows[0].value,legalName:requested.property==='legalName'?requested.rows[0].value:null},providerKey:provider.key,sortKey:requested.property,locators:{structuredSources:sourcesFor(group.rows),representation:{id:group.id,jsonPointers:{types:provider.typeRows.map(row=>row.path),providerNames:provider.nameRows.map(row=>row.path),requestedIdentity:requested.rows.map(row=>row.path),urls:provider.urlRows.map(row=>row.path)},requestedIdentity:{property:requested.property,values:requested.rows.map(row=>row.value)},normalizedUrls:provider.urlRows.map(row=>row.normalized)}}});
    }

    // Relationship references are intentionally same-script only. Embedded
    // objects are inspected only as the direct target of an allowlisted edge.
    for(const script of parsed.scripts){
        const groups=groupsFor([script]);if(!groups)return null;
        const byId=new Map(groups.filter(group=>group.id).map(group=>[group.id,group]));
        for(const group of groups){
            const provider=exactOriginOrganization(group,url);
            if(provider.status==='MATCH')for(const row of group.rows){
                const targets=relationshipTargets(row,'brand',byId);if(targets===null)return null;
                for(const relation of targets){
                    const brand=exactTypedIdentity(relation.group,'Brand',target);if(brand.status==='INVALID')return null;if(brand.status!=='MATCH')continue;
                    proofs.push(relatedRepresentation({requested:{group:relation.group,type:'Brand',typeRows:brand.typeRows,nameRows:brand.nameRows},relationship:{predicate:'brand',path:relation.path,targetId:relation.group.id,reference:relation.reference},provider}));
                }
            }
            const shapes=[['Service',['provider','publisher']],['SoftwareApplication',['provider','publisher']],['WebSite',['publisher']],['Product',['manufacturer']]];
            for(const [type,predicates]of shapes){
                const requested=exactTypedIdentity(group,type,target);if(requested.status==='INVALID')return null;if(requested.status!=='MATCH')continue;
                for(const row of group.rows)for(const predicate of predicates){
                    const targets=relationshipTargets(row,predicate,byId);if(targets===null)return null;
                    for(const relation of targets){
                        const provider=exactOriginOrganization(relation.group,url);if(provider.status!=='MATCH')return null;
                        proofs.push(relatedRepresentation({requested:{group,type,typeRows:requested.typeRows,nameRows:requested.nameRows},relationship:{predicate,path:relation.path,targetId:relation.group.id,reference:relation.reference},provider}));
                    }
                }
            }
        }
    }
    if(!proofs.length)return null;
    if(new Set(proofs.map(proof=>proof.providerKey)).size!==1)return null;
    proofs.sort((a,b)=>a.reason.localeCompare(b.reason)||a.sortKey.localeCompare(b.sortKey));
    const {providerKey:_providerKey,sortKey:_sortKey,...proof}=proofs[0];return proof;
}

function reviewAuthoritySubject(observation,{name,candidateHosts}) {
    const o=observation,body=o?.body;
    if(o?.kind!=='CANDIDATE'||o.authority!=='UNREVIEWED_CANDIDATE'||o.outcome!=='OK'||o.truncated||o.completeness!=='COMPLETE'||typeof body!=='string'||!body.trim()||o.sha256!==digest(body)||o.context?.representation!=='CANDIDATE_PAGE'||o.format!=='WEB'||!Number.isInteger(o.httpStatus)||o.httpStatus<200||o.httpStatus>=300||!Array.isArray(o.access)||!o.access.length||o.access.some(a=>a.decision!=='ALLOWED'))return null;
    const url=normalizeUrl(o.url);
    if(!url||url!==o.url||!candidateHosts.includes(new URL(url).hostname))return null;
    name=name?.trim();
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
    const publisherIdentity=match=>match?.[0]?.match(/^(?:©|&copy;|\\u00a9)\s*([^\d<"\\]{2,80}?)\s+\d{4}\b/iu)?.[1]?.trim()??null;
    let publisher=firstPerson?publishers.find(match=>publisherName.test(match[0])):null;
    let relation=publisher?firstPerson:null,providerName=publisherIdentity(publisher);
    if(!relation)for(const candidate of publishers){
        const operator=publisherIdentity(candidate);
        if(operator){
            const identity=escape(operator),product=name.split(/\s+/u).map(escape).join('\\s+');
            const statement=new RegExp('(?:'+identity+'\\s+(?:operates|provides|offers|governs|develops|publishes)\\s+'+product+'|'+product+'\\s+is\\s+(?:operated|provided|offered|governed|developed|published)\\s+by\\s+'+identity+')(?![\\p{L}\\p{N}])','iu');
            const match=statement.exec(body);
            if(match){publisher=candidate;relation=match;providerName=operator;break;}
        }
    }
    const host=new URL(url).hostname;
    if(relation)return {host,url,observation:o.id,bodySha256:o.sha256,reason:'FIRST_PARTY_PRESENTATION',providerIdentity:providerName?{presentationName:providerName,legalName:null}:null,locators:{publisher:span(body,publisher),relation:span(body,relation)}};
    const structured=structuredExactOrigin(body,url,name)??structuredIdentityRelationship(body,url,name);if(!structured)return null;
    return {host,url,observation:o.id,bodySha256:o.sha256,reason:structured.reason,providerIdentity:structured.providerIdentity,locators:structured.locators};
}

const bindingBase=review=>({host:review.host,kind:'AUTONOMOUS_FIRST_PARTY_PRESENTATION',reason:review.reason,scope:'EXACT_HOST_PROVIDER_SOURCING',sourceRole:'CANDIDATE_PAGE',url:review.url,observation:review.observation,bodySha256:review.bodySha256,locators:review.locators});

export function reviewCandidateAuthority(observation,objective) {
    const name=objective?.serviceName?.trim(),review=reviewAuthoritySubject(observation,{name,candidateHosts:objective?.candidateHosts??[]});
    if(!review)return null;
    return {...bindingBase(review),serviceId:objective.serviceId,serviceName:name};
}

export function reviewProviderSeedAuthority(observation,researchTarget,{candidateHosts=[]}={}) {
    const target=createResearchTarget(researchTarget);
    if(target.targetKind!==researchTargetKinds.PROVIDER_OR_BRAND_SEED)throw Error('PROVIDER_SEED_TARGET_REQUIRED');
    if(!Array.isArray(candidateHosts)||!candidateHosts.length||candidateHosts.some(host=>typeof host!=='string'||!host))throw Error('CANDIDATE_HOSTS_REQUIRED');
    const review=reviewAuthoritySubject(observation,{name:target.seedName,candidateHosts});
    if(!review?.providerIdentity)return null;
    const proof=bindingBase(review);
    return {contractVersion:1,researchTarget:structuredClone(target),providerIdentity:{...review.providerIdentity,source:{observation:review.observation,bodySha256:review.bodySha256,url:review.url,locators:structuredClone(review.locators)}},host:review.host,proof};
}
