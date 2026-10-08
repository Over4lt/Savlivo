import {digest} from './model.mjs';
import {validateRenderedArtifact} from './rendered-observation.mjs';

export const sourceReferenceKinds=Object.freeze(['ORIGINAL_TEXT','IMAGE_REGION']);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const boundedText=(value,max=4096)=>typeof value==='string'&&value.length>0&&value.length<=max;

function validBox(box,width,height) {
    return Array.isArray(box)&&box.length===4&&box.every(Number.isSafeInteger)&&box[0]>=0&&box[1]>=0&&box[2]>0&&box[3]>0&&box[0]+box[2]<=width&&box[1]+box[3]<=height;
}
const boxContains=(outer,inner)=>outer[0]<=inner[0]&&outer[1]<=inner[1]&&outer[0]+outer[2]>=inner[0]+inner[2]&&outer[1]+outer[3]>=inner[1]+inner[3];

export function validateRegionRegistry(artifact,regions) {
    if(!Array.isArray(regions)||regions.length<1||regions.length>512)throw Error('VISUAL_REGION_REGISTRY_INVALID');
    const map=new Map();
    for(const region of regions) {
        if(!exact(region,['id','bboxPx','parentId','scope'])||!boundedText(region.id,256)||map.has(region.id)||!validBox(region.bboxPx,artifact.image.widthPx,artifact.image.heightPx)||!(region.parentId===null||boundedText(region.parentId,256))||!['TEXT','OFFERING','CONTROL','GROUP','RELATIONSHIP','GLOBAL'].includes(region.scope))throw Error('VISUAL_REGION_INVALID');
        map.set(region.id,region);
    }
    for(const region of map.values()) {
        if(region.parentId!==null) {
            const parent=map.get(region.parentId);
            if(!parent||!boxContains(parent.bboxPx,region.bboxPx))throw Error('VISUAL_REGION_PARENT_INVALID');
        }
        const seen=new Set([region.id]);let parent=region.parentId;
        while(parent!==null) {
            if(seen.has(parent))throw Error('VISUAL_REGION_CYCLE');
            seen.add(parent);parent=map.get(parent)?.parentId??null;
        }
    }
    return map;
}

export function originalTextReference(observation,{startUtf16,endUtf16,quote}) {
    const reference={kind:'ORIGINAL_TEXT',observationId:observation.id,bodySha256:observation.sha256,startUtf16,endUtf16,quote};
    validateOriginalTextReference(observation,reference);
    return reference;
}

export function validateOriginalTextReference(observation,reference) {
    if(!exact(reference,['kind','observationId','bodySha256','startUtf16','endUtf16','quote'])||reference.kind!=='ORIGINAL_TEXT'||reference.observationId!==observation.id||reference.bodySha256!==observation.sha256||digest(observation.body)!==observation.sha256||!Number.isSafeInteger(reference.startUtf16)||!Number.isSafeInteger(reference.endUtf16)||reference.startUtf16<0||reference.endUtf16<=reference.startUtf16||reference.endUtf16>observation.body.length||!boundedText(reference.quote)||observation.body.slice(reference.startUtf16,reference.endUtf16)!==reference.quote)throw Error('ORIGINAL_TEXT_REFERENCE_INVALID');
    return reference;
}

export function imageRegionReference(observation,artifact,regionId) {
    return {kind:'IMAGE_REGION',observationId:observation.id,observationSha256:observation.sha256,renderId:artifact.id,imageSha256:artifact.image.sha256,regionId};
}

export function validateImageRegionReference(observation,artifact,regions,reference) {
    validateRenderedArtifact(observation,artifact);
    const registry=regions instanceof Map?regions:validateRegionRegistry(artifact,regions);
    if(!exact(reference,['kind','observationId','observationSha256','renderId','imageSha256','regionId'])||reference.kind!=='IMAGE_REGION'||reference.observationId!==observation.id||reference.observationSha256!==observation.sha256||reference.renderId!==artifact.id||reference.imageSha256!==artifact.image.sha256||!registry.has(reference.regionId))throw Error('IMAGE_REGION_REFERENCE_INVALID');
    return {reference,artifact,region:registry.get(reference.regionId)};
}

export function createSourceReferenceResolver({observation,artifact=null,regions=[]}={}) {
    const registry=artifact?validateRegionRegistry(artifact,regions):new Map();
    if(artifact)validateRenderedArtifact(observation,artifact);
    const resolve=reference=>reference?.kind==='ORIGINAL_TEXT'?{reference,quote:validateOriginalTextReference(observation,reference).quote}:reference?.kind==='IMAGE_REGION'?validateImageRegionReference(observation,artifact,registry,reference):(()=>{throw Error('SOURCE_REFERENCE_KIND_UNSUPPORTED');})();
    const sameArtifact=(a,b)=>a?.kind===b?.kind&&(a?.kind==='ORIGINAL_TEXT'?a.observationId===b.observationId&&a.bodySha256===b.bodySha256:a?.kind==='IMAGE_REGION'&&a.renderId===b.renderId&&a.imageSha256===b.imageSha256);
    const contains=(outer,inner)=>{
        resolve(outer);resolve(inner);
        if(!sameArtifact(outer,inner))return false;
        if(outer.kind==='ORIGINAL_TEXT')return outer.startUtf16<=inner.startUtf16&&outer.endUtf16>=inner.endUtf16;
        return boxContains(registry.get(outer.regionId).bboxPx,registry.get(inner.regionId).bboxPx);
    };
    const sameOccurrence=(a,b)=>{
        resolve(a);resolve(b);
        return a.kind===b.kind&&(a.kind==='ORIGINAL_TEXT'?a.observationId===b.observationId&&a.bodySha256===b.bodySha256&&a.startUtf16===b.startUtf16&&a.endUtf16===b.endUtf16&&a.quote===b.quote:a.renderId===b.renderId&&a.imageSha256===b.imageSha256&&a.regionId===b.regionId);
    };
    const applicableContext=(context,target)=>contains(context,target);
    const overlapsOccurrence=(a,b)=>{
        resolve(a);resolve(b);
        if(!sameArtifact(a,b))return false;
        if(a.kind==='ORIGINAL_TEXT')return a.startUtf16<b.endUtf16&&a.endUtf16>b.startUtf16;
        const x=registry.get(a.regionId).bboxPx,y=registry.get(b.regionId).bboxPx;
        return x[0]<y[0]+y[2]&&x[0]+x[2]>y[0]&&x[1]<y[1]+y[3]&&x[1]+x[3]>y[1];
    };
    const textWitness=(reference,transcriptions=[])=>{
        const resolved=resolve(reference);
        if(reference.kind==='ORIGINAL_TEXT')return {text:resolved.quote,readability:'READABLE'};
        const rows=transcriptions.filter(row=>row.regionId===reference.regionId&&row.evidenceKind==='DIRECT_TEXT');
        return rows.length===1&&rows[0].readability==='READABLE'?{text:rows[0].verbatimText,readability:rows[0].readability,transcriptionId:rows[0].id}:null;
    };
    return Object.freeze({resolve,sameArtifact,contains,sameOccurrence,applicableContext,textWitness,overlapsOccurrence});
}
