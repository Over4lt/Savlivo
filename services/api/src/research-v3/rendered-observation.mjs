import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {canonical,digest,normalizeUrl} from './model.mjs';

export const renderedArtifactSchema='V3_RENDERED_ARTIFACT_V1';
export const renderedArtifactLimits=Object.freeze({bytes:16*1024*1024,dimensionPx:32768,pixels:50_000_000,interactions:32});

const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const text=(value,max=1024)=>typeof value==='string'&&value.length>0&&value.length<=max;
const finitePositive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

const crcTable=(()=>{
    const table=new Uint32Array(256);
    for(let n=0;n<256;n++) {
        let c=n;
        for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;
        table[n]=c>>>0;
    }
    return table;
})();
function crc32(bytes) {
    let c=0xffffffff;
    for(const byte of bytes)c=crcTable[(c^byte)&0xff]^(c>>>8);
    return (c^0xffffffff)>>>0;
}

function decodePng(bytes) {
    const signature=Buffer.from([137,80,78,71,13,10,26,10]);
    if(bytes.length<33||!bytes.subarray(0,8).equals(signature))throw Error('RENDERED_IMAGE_INVALID');
    let offset=8,width=null,height=null,channels=null,idat=[],seenHeader=false,seenEnd=false;
    while(offset<bytes.length) {
        if(offset+12>bytes.length)throw Error('RENDERED_IMAGE_INVALID');
        const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),end=offset+12+length;
        if(end>bytes.length)throw Error('RENDERED_IMAGE_INVALID');
        const data=bytes.subarray(offset+8,offset+8+length),expected=bytes.readUInt32BE(offset+8+length);
        if(crc32(bytes.subarray(offset+4,offset+8+length))!==expected)throw Error('RENDERED_IMAGE_INVALID');
        if(!seenHeader) {
            if(type!=='IHDR'||length!==13)throw Error('RENDERED_IMAGE_INVALID');
            width=data.readUInt32BE(0);height=data.readUInt32BE(4);
            const bitDepth=data[8],colorType=data[9],compression=data[10],filter=data[11],interlace=data[12];
            channels={2:3,6:4}[colorType]??null;
            if(bitDepth!==8||channels===null||compression!==0||filter!==0||interlace!==0)throw Error('RENDERED_IMAGE_UNSUPPORTED');
            seenHeader=true;
        } else if(type==='IHDR')throw Error('RENDERED_IMAGE_INVALID');
        if(type==='IDAT')idat.push(data);
        if(type==='IEND') {
            if(length!==0||end!==bytes.length)throw Error('RENDERED_IMAGE_INVALID');
            seenEnd=true;break;
        }
        offset=end;
    }
    if(!seenHeader||!seenEnd||!idat.length||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1)throw Error('RENDERED_IMAGE_INVALID');
    if(width>renderedArtifactLimits.dimensionPx||height>renderedArtifactLimits.dimensionPx||width*height>renderedArtifactLimits.pixels)throw Error('RENDERED_IMAGE_BOUND');
    let pixels;
    try{pixels=inflateSync(Buffer.concat(idat),{maxOutputLength:height*(1+width*channels)});}catch{throw Error('RENDERED_IMAGE_INVALID');}
    const stride=1+width*channels;
    if(pixels.length!==height*stride)throw Error('RENDERED_IMAGE_INVALID');
    for(let row=0;row<height;row++)if(pixels[row*stride]>4)throw Error('RENDERED_IMAGE_INVALID');
    return {widthPx:width,heightPx:height};
}

function imageBytes(image) {
    if(!exact(image,['bytesBase64','sha256','mimeType','widthPx','heightPx'])||image.mimeType!=='image/png'||typeof image.bytesBase64!=='string'||image.bytesBase64.length>Math.ceil(renderedArtifactLimits.bytes*4/3)+4)throw Error('RENDERED_IMAGE_INVALID');
    const bytes=Buffer.from(image.bytesBase64,'base64');
    if(!bytes.length||bytes.length>renderedArtifactLimits.bytes||bytes.toString('base64')!==image.bytesBase64)throw Error('RENDERED_IMAGE_INVALID');
    const dimensions=decodePng(bytes);
    if(image.sha256!==sha256(bytes))throw Error('RENDERED_IMAGE_HASH_MISMATCH');
    if(image.widthPx!==dimensions.widthPx||image.heightPx!==dimensions.heightPx)throw Error('RENDERED_IMAGE_DIMENSION_MISMATCH');
    return {bytes,dimensions};
}

function captureValid(capture) {
    if(!exact(capture,['capturedAt','browserBuild','captureRevision','viewportCss','deviceScaleFactor','zoom','locale','timezone','fullPage','documentExtent','coordinateSpace','clippingOrStitching','completeness','stability','obstructionStatus']))return false;
    if(!text(capture.capturedAt)||!Number.isFinite(Date.parse(capture.capturedAt))||!text(capture.browserBuild,256)||!text(capture.captureRevision,128))return false;
    if(!exact(capture.viewportCss,['width','height'])||!finitePositive(capture.viewportCss.width)||!finitePositive(capture.viewportCss.height)||!finitePositive(capture.deviceScaleFactor)||!finitePositive(capture.zoom))return false;
    if(!(capture.locale===null||text(capture.locale,128))||!(capture.timezone===null||text(capture.timezone,128))||typeof capture.fullPage!=='boolean')return false;
    if(!exact(capture.documentExtent,['width','height'])||!finitePositive(capture.documentExtent.width)||!finitePositive(capture.documentExtent.height)||capture.coordinateSpace!=='IMAGE_PIXELS')return false;
    return ['NONE','CLIPPED','STITCHED'].includes(capture.clippingOrStitching)&&['COMPLETE','PARTIAL','UNKNOWN'].includes(capture.completeness)&&['STABLE','UNSTABLE','UNKNOWN'].includes(capture.stability)&&['CLEAR','OBSCURED','UNKNOWN'].includes(capture.obstructionStatus);
}

function interactionValid(row,artifact) {
    if(!exact(row,['actionId','kind','parentRenderId','sourceControlRef','intendedPresentationVariant','policyDecisionRef','executedAt','executionOutcome','resultingRenderId','observedStateRefs','navigationReceiptRef']))return false;
    if(!text(row.actionId,256)||!['COOKIE_REJECT','PRESENTATION_SELECT'].includes(row.kind)||!text(row.parentRenderId,256)||!text(row.intendedPresentationVariant,256)||!text(row.policyDecisionRef,256)||!text(row.executedAt)||!Number.isFinite(Date.parse(row.executedAt)))return false;
    if(!['COMPLETED','FAILED','UNKNOWN'].includes(row.executionOutcome)||row.resultingRenderId!==artifact.id||!Array.isArray(row.observedStateRefs)||row.observedStateRefs.length>32||!row.observedStateRefs.every(v=>text(v,256))||!(row.navigationReceiptRef===null||text(row.navigationReceiptRef,256)))return false;
    return exact(row.sourceControlRef,['kind','renderId','imageSha256','regionId'])&&row.sourceControlRef.kind==='IMAGE_REGION'&&row.sourceControlRef.renderId===row.parentRenderId&&text(row.sourceControlRef.imageSha256,64)&&text(row.sourceControlRef.regionId,256);
}

export function renderedArtifactId({parent,resource,receipts,image,capture,journey}) {
    const imageIdentity={sha256:image.sha256,mimeType:image.mimeType,widthPx:image.widthPx,heightPx:image.heightPx};
    const journeyIdentity={...journey,interactions:journey.interactions.map(({resultingRenderId,...row})=>row)};
    return digest([renderedArtifactSchema,parent,resource,receipts,imageIdentity,capture,journeyIdentity]);
}

export function observationReceiptHashes(observation) {
    return {
        transportSha256:digest(observation.transport??null),
        accessSha256:digest(observation.access??null),
        redirectsSha256:digest(observation.redirects??null),
        responseMetadataSha256:digest(observation.responseMetadata??null)
    };
}

export function validateRenderedArtifact(observation,artifact) {
    if(!observation||observation.kind!=='PROVIDER'||observation.format!=='WEB'||observation.outcome!=='OK'||observation.truncated||!['COMPLETE',undefined].includes(observation.completeness)||digest(observation.body)!==observation.sha256)throw Error('RENDERED_PARENT_OBSERVATION_INVALID');
    if(!exact(artifact,['schema','id','parent','resource','receipts','image','capture','journey'])||artifact.schema!==renderedArtifactSchema)throw Error('RENDERED_ARTIFACT_INVALID');
    if(!exact(artifact.parent,['observationId','observationSha256','acquisitionActionId'])||artifact.parent.observationId!==observation.id||artifact.parent.observationSha256!==observation.sha256||artifact.parent.acquisitionActionId!==observation.action)throw Error('RENDERED_PARENT_BINDING_INVALID');
    if(!exact(artifact.resource,['requestedUrl','finalUrl'])||normalizeUrl(artifact.resource.finalUrl)!==observation.url||normalizeUrl(artifact.resource.requestedUrl)!==(observation.requestedUrl??observation.url))throw Error('RENDERED_RESOURCE_BINDING_INVALID');
    if(!exact(artifact.receipts,['transportSha256','accessSha256','redirectsSha256','responseMetadataSha256'])||canonical(artifact.receipts)!==canonical(observationReceiptHashes(observation)))throw Error('RENDERED_RECEIPT_BINDING_INVALID');
    imageBytes(artifact.image);
    if(!captureValid(artifact.capture))throw Error('RENDERED_CAPTURE_INVALID');
    if(!exact(artifact.journey,['id','parentRenderId','stateFingerprint','interactions'])||!text(artifact.journey.id,256)||!(artifact.journey.parentRenderId===null||text(artifact.journey.parentRenderId,256))||!text(artifact.journey.stateFingerprint,256)||!Array.isArray(artifact.journey.interactions)||artifact.journey.interactions.length>renderedArtifactLimits.interactions)throw Error('RENDERED_JOURNEY_INVALID');
    if(artifact.id!==renderedArtifactId(artifact))throw Error('RENDERED_ARTIFACT_ID_INVALID');
    if(!artifact.journey.interactions.every(row=>interactionValid(row,artifact)))throw Error('RENDERED_INTERACTION_INVALID');
    if(artifact.journey.interactions.length&&(artifact.journey.parentRenderId===null||artifact.journey.interactions.some(row=>row.parentRenderId!==artifact.journey.parentRenderId)))throw Error('RENDERED_INTERACTION_PARENT_INVALID');
    return artifact;
}

export function createRenderedArtifact(observation,{imageBytes:inputBytes,capture,journey={id:'default',parentRenderId:null,stateFingerprint:'default',interactions:[]}}) {
    const bytes=Buffer.from(inputBytes),dimensions=decodePng(bytes),image={bytesBase64:bytes.toString('base64'),sha256:sha256(bytes),mimeType:'image/png',...dimensions};
    const artifact={schema:renderedArtifactSchema,id:'',parent:{observationId:observation.id,observationSha256:observation.sha256,acquisitionActionId:observation.action},resource:{requestedUrl:observation.requestedUrl??observation.url,finalUrl:observation.url},receipts:observationReceiptHashes(observation),image,capture:structuredClone(capture),journey:structuredClone(journey)};
    artifact.id=renderedArtifactId(artifact);
    artifact.journey.interactions=artifact.journey.interactions.map(row=>({...row,resultingRenderId:artifact.id}));
    return validateRenderedArtifact(observation,artifact);
}
