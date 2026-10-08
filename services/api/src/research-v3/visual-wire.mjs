export const visualEvidenceSchema='V3_VISUAL_EVIDENCE_V1';
export const visualEvidenceKinds=Object.freeze(['DIRECT_TEXT','VISUAL_RELATION','UNKNOWN']);
export const visualRelationshipKinds=Object.freeze(['WITHIN_PRESENTATION','LABELS','APPLIES_TO','SELECTED_IN','ROW_COLUMN_ASSOCIATION','FOLLOWED_BY','STRUCK_THROUGH','DISABLED_APPEARANCE','UNKNOWN']);
export const visualEvidenceLimits=Object.freeze({bytes:131072,regions:512,transcriptions:512,relationships:512,offers:64,charges:128,supports:64});

export const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
export const label=(value,max=1024)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
export const labels=(values,maxItems=visualEvidenceLimits.supports,maxLength=1024)=>Array.isArray(values)&&values.length<=maxItems&&values.every(value=>label(value,maxLength));
export const known=(value,values)=>values.includes(value);

function transformationValid(value) {
    if(!exact(value,['provider','modelOrTool','modelRevision','adapterRevision','schemaRevision','promptHash','requestHash','responseHash','createdAt','diagnostics']))return false;
    if(!label(value.provider,256)||!label(value.modelOrTool,256)||!(value.modelRevision===null||label(value.modelRevision,256))||!label(value.adapterRevision,256)||!label(value.schemaRevision,256))return false;
    if(![value.promptHash,value.requestHash,value.responseHash].every(hash=>typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash))||!label(value.createdAt)||!Number.isFinite(Date.parse(value.createdAt)))return false;
    return value.diagnostics&&typeof value.diagnostics==='object'&&!Array.isArray(value.diagnostics)&&Buffer.byteLength(JSON.stringify(value.diagnostics))<=4096;
}

export function validateVisualWireShape(envelope) {
    if(!exact(envelope,['schema','observationId','observationSha256','renderId','imageSha256','transformation','regions','transcriptions','relationships','service','offers','unresolved'])||envelope.schema!==visualEvidenceSchema||!label(envelope.observationId,256)||!/^[a-f0-9]{64}$/.test(envelope.observationSha256??'')||!label(envelope.renderId,256)||!/^[a-f0-9]{64}$/.test(envelope.imageSha256??'')||!transformationValid(envelope.transformation))throw Error('VISUAL_WIRE_INVALID');
    if(Buffer.byteLength(JSON.stringify(envelope))>visualEvidenceLimits.bytes||!Array.isArray(envelope.regions)||envelope.regions.length<1||envelope.regions.length>visualEvidenceLimits.regions||!Array.isArray(envelope.transcriptions)||envelope.transcriptions.length>visualEvidenceLimits.transcriptions||!Array.isArray(envelope.relationships)||envelope.relationships.length>visualEvidenceLimits.relationships||!Array.isArray(envelope.offers)||envelope.offers.length>visualEvidenceLimits.offers||!Array.isArray(envelope.unresolved)||envelope.unresolved.length>visualEvidenceLimits.supports)throw Error('VISUAL_WIRE_BOUND');
    const transcriptions=new Map();
    for(const row of envelope.transcriptions) {
        if(!exact(row,['id','regionId','verbatimText','readability','evidenceKind','uncertaintyReasons'])||!label(row.id,256)||transcriptions.has(row.id)||!label(row.regionId,256)||!label(row.verbatimText,4096)||!known(row.readability,['READABLE','PARTIAL','UNREADABLE'])||row.evidenceKind!=='DIRECT_TEXT'||!labels(row.uncertaintyReasons,16,1024))throw Error('VISUAL_TRANSCRIPTION_INVALID');
        transcriptions.set(row.id,row);
    }
    const relationships=new Map();
    for(const row of envelope.relationships) {
        if(!exact(row,['id','kind','fromRegionIds','toRegionIds','witnessRegionIds','scopeRegionIds','evidenceKind','uncertaintyReasons'])||!label(row.id,256)||relationships.has(row.id)||!known(row.kind,visualRelationshipKinds)||!labels(row.fromRegionIds)||!row.fromRegionIds.length||!labels(row.toRegionIds)||!row.toRegionIds.length||!labels(row.witnessRegionIds)||!row.witnessRegionIds.length||!labels(row.scopeRegionIds)||!row.scopeRegionIds.length||!known(row.evidenceKind,visualEvidenceKinds)||!labels(row.uncertaintyReasons,16,1024))throw Error('VISUAL_RELATIONSHIP_INVALID');
        relationships.set(row.id,row);
    }
    if(!exact(envelope.service,['name','ambiguity','support'])||!label(envelope.service.name,256)||typeof envelope.service.ambiguity!=='boolean'||!labels(envelope.service.support))throw Error('VISUAL_SERVICE_INVALID');
    for(const row of envelope.unresolved)if(!exact(row,['target','reason','supportingRegionIds'])||!label(row.target,256)||!label(row.reason,1024)||!labels(row.supportingRegionIds))throw Error('VISUAL_UNRESOLVED_INVALID');
    return {transcriptions,relationships};
}
