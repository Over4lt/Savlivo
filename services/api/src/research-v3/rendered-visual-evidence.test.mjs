import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {digest,createKnowledge,context,checkpoint,restore} from './model.mjs';
import {createRenderedArtifact,validateRenderedArtifact} from './rendered-observation.mjs';
import {createSourceReferenceResolver,imageRegionReference,originalTextReference} from './source-references.mjs';
import {projectVisualEvidence} from './visual-evidence.mjs';
import {projectObservation} from './projection.mjs';
import {evaluate,truthContract} from './truth.mjs';
import {refreshCatalog} from './subscription-catalog.mjs';

const objective={kind:'PRICE',serviceId:'northstar',serviceName:'Northstar Club',providerHosts:['provider.example'],markets:['US'],seeds:['https://provider.example/pricing']};

const crcTable=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}return table;})();
const crc32=bytes=>{let c=0xffffffff;for(const byte of bytes)c=crcTable[(c^byte)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;};
function chunk(type,data) {const name=Buffer.from(type),out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length,0);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([name,data])),8+data.length);return out;}
function png(width=800,height=600) {
    const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
    const pixels=Buffer.alloc(height*(1+width*4));
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
function observation({direct=false,body='<html><title>Northstar Club</title><body><main>Rendered pricing surface.</main></body></html>',url='https://provider.example/pricing'}={}) {
    return {id:'observation-1',action:'observation-1',kind:'PROVIDER',url,requestedUrl:url,context:context(direct?'DIRECT':'DECODO',direct?'UNBOUND':'US'),outcome:'OK',truncated:false,body,bytes:Buffer.byteLength(body),sha256:digest(body),format:'WEB',contentType:'text/html',httpStatus:200,acquiredAt:'2026-10-08T09:00:00.000Z',transport:direct?{kind:'DIRECT',verification:'UNBOUND'}:{kind:'DECODO',requestedCountry:'US',verifiedCountry:'US',verification:'BRACKET_VERIFIED'},access:[],completeness:'COMPLETE',responseMetadata:{wireSha256:digest(body)},redirects:[],acquisitionTiming:{elapsedMs:1},candidates:[]};
}
const capture={capturedAt:'2026-10-08T09:00:01.000Z',browserBuild:'offline-fixture',captureRevision:'fixture-v1',viewportCss:{width:800,height:600},deviceScaleFactor:1,zoom:1,locale:'en-US',timezone:'UTC',fullPage:true,documentExtent:{width:800,height:600},coordinateSpace:'IMAGE_PIXELS',clippingOrStitching:'NONE',completeness:'COMPLETE',stability:'STABLE',obstructionStatus:'CLEAR'};
function rendered(o) {return createRenderedArtifact(o,{imageBytes:png(),capture,journey:{id:'journey-1',parentRenderId:null,stateFingerprint:'state-1',interactions:[]}});}
const hash=value=>digest(value);
function visualEnvelope(o,artifact) {
    return {
        schema:'V3_VISUAL_EVIDENCE_V1',observationId:o.id,observationSha256:o.sha256,renderId:artifact.id,imageSha256:artifact.image.sha256,
        transformation:{provider:'OFFLINE_FIXTURE',modelOrTool:'fixture-visual-interpreter',modelRevision:'1',adapterRevision:'1',schemaRevision:'1',promptHash:hash('prompt'),requestHash:hash('request'),responseHash:hash('response'),createdAt:'2026-10-08T09:00:02.000Z',diagnostics:{confidence:0.01}},
        regions:[
            {id:'global',bboxPx:[0,0,800,600],parentId:null,scope:'GLOBAL'},
            {id:'service',bboxPx:[20,20,220,30],parentId:'global',scope:'TEXT'},
            {id:'offer',bboxPx:[20,100,360,240],parentId:'global',scope:'OFFERING'},
            {id:'name',bboxPx:[30,110,180,24],parentId:'offer',scope:'TEXT'},
            {id:'price',bboxPx:[30,150,180,24],parentId:'offer',scope:'TEXT'},
            {id:'billing',bboxPx:[30,190,300,24],parentId:'offer',scope:'TEXT'}
        ],
        transcriptions:[
            {id:'t-service',regionId:'service',verbatimText:'Northstar Club',readability:'READABLE',evidenceKind:'DIRECT_TEXT',uncertaintyReasons:[]},
            {id:'t-name',regionId:'name',verbatimText:'Core',readability:'READABLE',evidenceKind:'DIRECT_TEXT',uncertaintyReasons:[]},
            {id:'t-price',regionId:'price',verbatimText:'USD 12.00/month',readability:'READABLE',evidenceKind:'DIRECT_TEXT',uncertaintyReasons:[]},
            {id:'t-billing',regionId:'billing',verbatimText:'Billed USD 12.00 every month',readability:'READABLE',evidenceKind:'DIRECT_TEXT',uncertaintyReasons:[]}
        ],
        relationships:[
            {id:'service-association',kind:'APPLIES_TO',fromRegionIds:['offer'],toRegionIds:['service'],witnessRegionIds:['global'],scopeRegionIds:['global'],evidenceKind:'VISUAL_RELATION',uncertaintyReasons:[]},
            {id:'charge-association',kind:'WITHIN_PRESENTATION',fromRegionIds:['price','billing'],toRegionIds:['offer'],witnessRegionIds:['offer'],scopeRegionIds:['offer'],evidenceKind:'VISUAL_RELATION',uncertaintyReasons:[]}
        ],
        service:{name:'Northstar Club',ambiguity:false,support:['t-service']},
        offers:[{
            id:'offer-core',name:'Core',service:'Northstar Club',audience:'CONSUMER',relationship:'SUBSCRIPTION',ambiguity:false,presentationRegionId:'offer',nameSupport:['t-name'],serviceAssociationRef:'service-association',qualifiers:[],
            market:{country:null,basis:'UNKNOWN',ambiguity:false,support:[],exclusions:[]},availability:null,
            charges:[{id:'ordinary',money:{amount:12,amountText:'12.00',amountOccurrence:{transcriptionId:'t-price',startUtf16:4,endUtf16:9,quote:'12.00'},currency:'USD',currencyText:'USD',currencyOccurrence:{transcriptionId:'t-price',startUtf16:0,endUtf16:3,quote:'USD'}},cadence:{unit:'MONTHLY',expression:'/month'},role:'ORDINARY',derivation:'EXPLICIT',duration:null,qualifiers:[],ambiguity:false,support:['t-price','t-billing'],associationRef:'charge-association',payment:{kind:'ACTUAL_PAYMENT',text:'Billed USD 12.00 every month',support:['t-billing']},temporal:{billingCadence:'MONTHLY',billingSupport:['t-billing'],commitmentText:null,commitmentSupport:[],priceKind:'CHARGE'},monetary:{kind:'SUBSCRIPTION_CHARGE',relatedCharge:null,relation:'CHARGE_FOR',support:['t-price']}}],transitions:[]
        }],
        unresolved:[]
    };
}
function fixture(options={}) {const o=observation(options),artifact=rendered(o),envelope=visualEnvelope(o,artifact);o.renderedArtifacts=[artifact];o.visualEvidence=[envelope];o.candidates=projectObservation(o,objective).candidates;return {o,artifact,envelope};}
function knowledge(o) {const k=createKnowledge({objective});k.observations=[o];return k;}

test('legacy source projection is byte-for-byte equivalent when visual collections are absent',()=>{
    const o=observation(),before=projectObservation(o,objective),after=projectObservation({...o,renderedArtifacts:[],visualEvidence:[]},objective);
    assert.deepEqual(after,before);
    const ref=originalTextReference(o,{startUtf16:o.body.indexOf('Northstar'),endUtf16:o.body.indexOf('Northstar')+'Northstar Club'.length,quote:'Northstar Club'});
    assert.equal(createSourceReferenceResolver({observation:o}).textWitness(ref).text,'Northstar Club');
});

test('valid retained render and bounded image regions project admissible source-bound evidence',()=>{
    const {o,artifact,envelope}=fixture(),p=projectVisualEvidence(o,objective,envelope),truth=evaluate(knowledge(o));
    assert.equal(p.error,undefined);assert.equal(p.accepted.length,1);assert.equal(p.source.offers[0].amount,12);assert.equal(p.source.offers[0].billingCadence,'MONTHLY');
    assert.equal(p.bindings['/offers/0'].support[0].reference.kind,'IMAGE_REGION');assert.equal(p.bindings['/offers/0'].renderedArtifact.imageSha256,artifact.image.sha256);
    assert.equal(truth.established,true);assert.equal(truth.prices.US.propositions.PRICE_AMOUNT.value,12);
    assert.deepEqual(evaluate(restore(checkpoint(knowledge(o)))),truth);
});

test('artifact hash mismatch fails closed',()=>{
    const {o,artifact,envelope}=fixture();artifact.image.sha256='0'.repeat(64);
    assert.equal(projectVisualEvidence(o,objective,envelope).error,'RENDERED_IMAGE_HASH_MISMATCH');
});

for(const [name,box] of [['out-of-bounds',[790,590,20,20]],['empty',[10,10,0,20]],['nonfinite',[10,10,Number.NaN,20]]])test(name+' image region fails closed',()=>{
    const {o,envelope}=fixture();envelope.regions.find(row=>row.id==='price').bboxPx=box;
    assert.equal(projectVisualEvidence(o,objective,envelope).error,'VISUAL_REGION_INVALID');
});

test('wrong parent observation binding and missing artifact fail closed without contradiction',()=>{
    const a=fixture();a.artifact.parent.observationId='forged';assert.equal(projectVisualEvidence(a.o,objective,a.envelope).error,'RENDERED_PARENT_BINDING_INVALID');
    const b=fixture();b.o.renderedArtifacts=[];b.o.candidates=projectObservation(b.o,objective).candidates;const projection=projectObservation(b.o,objective),truth=evaluate(knowledge(b.o));
    assert.equal(projection.errors[0].code,'VISUAL_RENDERED_ARTIFACT_MISSING');assert.equal(truth.established,false);assert.ok(Object.values(truth.prices.US.propositions).every(row=>row.state!=='CONTRADICTED'));
});

test('source reference kinds remain typed and unsupported kinds fail closed',()=>{
    const {o,artifact,envelope}=fixture(),resolver=createSourceReferenceResolver({observation:o,artifact,regions:envelope.regions}),ref=imageRegionReference(o,artifact,'price');
    assert.equal(resolver.resolve(ref).region.id,'price');assert.throws(()=>resolver.resolve({kind:'HTML_OFFSET'}),/SOURCE_REFERENCE_KIND_UNSUPPORTED/);
    assert.equal(envelope.transcriptions[0].evidenceKind,'DIRECT_TEXT');assert.equal(envelope.relationships[0].evidenceKind,'VISUAL_RELATION');
});

test('UNKNOWN relationship cannot establish a relationship-dependent charge',()=>{
    const {o,envelope}=fixture();envelope.relationships.find(row=>row.id==='charge-association').evidenceKind='UNKNOWN';
    const p=projectVisualEvidence(o,objective,envelope);assert.equal(p.error,undefined);assert.equal(p.source.offers.length,0);assert.ok(p.rejected.some(row=>row.reason==='VISUAL_CHARGE_ASSOCIATION_UNSUPPORTED'));
});

test('model confidence is diagnostic and has no effect on deterministic admission',()=>{
    const low=fixture(),high=fixture();high.envelope.transformation.diagnostics.confidence=0.999999;
    const a=projectVisualEvidence(low.o,objective,low.envelope),b=projectVisualEvidence(high.o,objective,high.envelope);
    assert.deepEqual(b.source,a.source);assert.deepEqual(b.accepted,a.accepted);assert.deepEqual(b.rejected,a.rejected);
});

test('malformed visual interpretation is unavailable and does not erase native source evidence',()=>{
    const body='<html><title>Northstar Club</title><body><main><section><h2>Core</h2><p>Personal consumer subscription price USD 12 billed monthly. Available in US.</p></section></main></body></html>',base=observation({body}),before={...base,candidates:projectObservation(base,objective).candidates},expected=evaluate(knowledge(before));
    const artifact=rendered(base),malformed=visualEnvelope(base,artifact);delete malformed.regions;const withFailure={...base,renderedArtifacts:[artifact],visualEvidence:[malformed]};withFailure.candidates=projectObservation(withFailure,objective).candidates;
    assert.equal(projectObservation(withFailure,objective).errors[0].code,'VISUAL_WIRE_INVALID');assert.deepEqual(evaluate(knowledge(withFailure)),expected);
});

test('existing sufficient structured evidence remains sufficient without visual evidence',()=>{
    const body=JSON.stringify({serviceId:'northstar',offers:[{id:'structured',amount:12,currency:'USD',cadence:'MONTHLY',billingCadence:'MONTHLY',consumer:true,relationship:'SUBSCRIPTION',role:'ORDINARY',monetaryKind:'SUBSCRIPTION_CHARGE',amountDerivation:'EXPLICIT',market:'US'}]}),o={id:'structured',kind:'PROVIDER',url:objective.seeds[0],context:context('DIRECT'),outcome:'OK',truncated:false,body,sha256:digest(body),format:'JSON',candidates:[{kind:'SERVICE',pointer:''},{kind:'OFFER',pointer:'/offers/0'}]};
    assert.equal(evaluate(knowledge(o)).established,true);
});

test('visual URL, language, currency and branding do not establish market',()=>{
    const {o}=fixture({direct:true,url:'https://provider.example/us/pricing'}),truth=evaluate(knowledge(o));
    assert.equal(truth.prices.US.propositions.CURRENCY.value,'USD');assert.equal(truth.prices.US.propositions.TARGET_MARKET.state,'UNRESOLVED');assert.equal(truth.established,false);
});

test('bare monthly display text cannot establish monthly billing',()=>{
    const {o,envelope}=fixture(),billing=envelope.transcriptions.find(row=>row.id==='t-billing');billing.verbatimText='/month';
    const charge=envelope.offers[0].charges[0];charge.payment={kind:'ACTUAL_PAYMENT',text:'/month',support:['t-billing']};
    const p=projectVisualEvidence(o,objective,envelope);assert.equal(p.source.offers[0].cadence,'MONTHLY');assert.equal(p.source.offers[0].billingCadence,'UNKNOWN');
    o.candidates=projectObservation(o,objective).candidates;assert.equal(evaluate(knowledge(o)).eligibility.US.result,'UNRESOLVED');
});

test('annual billing with a monthly-equivalent display remains annual',()=>{
    const {o,envelope}=fixture(),price=envelope.transcriptions.find(row=>row.id==='t-price'),billing=envelope.transcriptions.find(row=>row.id==='t-billing'),charge=envelope.offers[0].charges[0];
    price.verbatimText='CHF 9.99/month';billing.verbatimText='Billed CHF 119.88 every 12 months';
    charge.money={amount:9.99,amountText:'9.99',amountOccurrence:{transcriptionId:'t-price',startUtf16:4,endUtf16:8,quote:'9.99'},currency:'CHF',currencyText:'CHF',currencyOccurrence:{transcriptionId:'t-price',startUtf16:0,endUtf16:3,quote:'CHF'}};
    charge.payment={kind:'ACTUAL_PAYMENT',text:'Billed CHF 119.88 every 12 months',support:['t-billing']};charge.temporal={...charge.temporal,billingCadence:'YEARLY',priceKind:'EQUIVALENT'};charge.derivation='ARITHMETIC';
    const p=projectVisualEvidence(o,objective,envelope);assert.equal(p.source.offers[0].cadence,'MONTHLY');assert.equal(p.source.offers[0].billingCadence,'YEARLY');assert.equal(p.source.offers[0].amountDerivation,'ARITHMETIC');
    o.candidates=projectObservation(o,objective).candidates;assert.equal(evaluate(knowledge(o)).eligibility.US.result,'UNRESOLVED');
});

test('trial amount remains distinct from subsequent ordinary recurring amount',()=>{
    const {o,envelope}=fixture(),offer=envelope.offers[0];
    envelope.regions.push({id:'trial',bboxPx:[30,230,200,24],parentId:'offer',scope:'TEXT'});
    envelope.transcriptions.push({id:'t-trial',regionId:'trial',verbatimText:'Try for USD 0.00, then USD 12.00',readability:'READABLE',evidenceKind:'DIRECT_TEXT',uncertaintyReasons:[]});
    envelope.relationships.push({id:'trial-association',kind:'WITHIN_PRESENTATION',fromRegionIds:['trial'],toRegionIds:['offer'],witnessRegionIds:['offer'],scopeRegionIds:['offer'],evidenceKind:'VISUAL_RELATION',uncertaintyReasons:[]},{id:'trial-followed-by',kind:'FOLLOWED_BY',fromRegionIds:['trial'],toRegionIds:['price','billing'],witnessRegionIds:['offer'],scopeRegionIds:['offer'],evidenceKind:'VISUAL_RELATION',uncertaintyReasons:[]});
    const ordinary=offer.charges[0];ordinary.role='SUBSEQUENT';
    offer.charges.unshift({id:'intro',money:{amount:0,amountText:'0.00',amountOccurrence:{transcriptionId:'t-trial',startUtf16:12,endUtf16:16,quote:'0.00'},currency:'USD',currencyText:'USD',currencyOccurrence:{transcriptionId:'t-trial',startUtf16:8,endUtf16:11,quote:'USD'}},cadence:{unit:'UNKNOWN',expression:null},role:'INTRODUCTORY',derivation:'EXPLICIT',duration:null,qualifiers:[],ambiguity:false,support:['t-trial'],associationRef:'trial-association',payment:{kind:'UNKNOWN',text:null,support:[]},temporal:{billingCadence:'UNKNOWN',billingSupport:[],commitmentText:null,commitmentSupport:[],priceKind:'CHARGE'},monetary:{kind:'TRIAL_CHARGE',relatedCharge:'ordinary',relation:'CHARGE_FOR',support:['t-trial']}});
    offer.transitions=[{from:'intro',to:'ordinary',kind:'RECURS_AFTER_INTRO',ambiguity:false,support:['t-trial','t-price'],relationshipRef:'trial-followed-by'}];
    const p=projectVisualEvidence(o,objective,envelope);assert.deepEqual(p.source.offers.map(row=>[row.role,row.amount]),[['TRIAL',0],['ORDINARY',12]]);
    o.candidates=projectObservation(o,objective).candidates;assert.equal(evaluate(knowledge(o)).prices.US.propositions.PRICE_AMOUNT.value,12);
});

test('prices cannot cross-bind to another offering without an admitted relationship',()=>{
    const {o,envelope}=fixture();envelope.regions.push({id:'other-offer',bboxPx:[420,100,360,240],parentId:'global',scope:'OFFERING'});envelope.relationships.find(row=>row.id==='charge-association').toRegionIds=['other-offer'];
    const p=projectVisualEvidence(o,objective,envelope);assert.equal(p.source.offers.length,0);assert.ok(p.rejected.some(row=>row.reason==='VISUAL_CHARGE_ASSOCIATION_UNSUPPORTED'));
});

test('visible offerings never establish catalog completeness and truth contract remains frozen',()=>{
    const {o}=fixture(),k=knowledge(o),truth=evaluate(k);refreshCatalog(k,truth);
    assert.equal(k.catalog.offeringState,'OFFERING_FOUND');assert.equal(k.catalog.state,'CATALOG_UNRESOLVED');assert.equal(k.catalog.scope,'UNRESOLVED');
    assert.equal(truthContract.version,2);assert.equal(truthContract.absenceRetracts,false);assert.equal(truthContract.modelAgreementRequired,false);
});

test('safe interaction provenance binds prior control, resulting render and observed state without truth authority',()=>{
    const o=observation(),parent=rendered(o),parentEvidence=visualEnvelope(o,parent);parentEvidence.regions.push({id:'monthly-control',bboxPx:[500,40,120,32],parentId:'global',scope:'CONTROL'});
    const child=createRenderedArtifact(o,{imageBytes:png(),capture:{...capture,capturedAt:'2026-10-08T09:00:03.000Z'},journey:{id:'journey-1',parentRenderId:parent.id,stateFingerprint:'monthly-selected',interactions:[{actionId:'select-monthly',kind:'PRESENTATION_SELECT',parentRenderId:parent.id,sourceControlRef:{kind:'IMAGE_REGION',renderId:parent.id,imageSha256:parent.image.sha256,regionId:'monthly-control'},intendedPresentationVariant:'Monthly',policyDecisionRef:'safe-presentation-policy',executedAt:'2026-10-08T09:00:02.500Z',executionOutcome:'COMPLETED',resultingRenderId:'host-filled',observedStateRefs:['charge-association'],navigationReceiptRef:null}]}}),childEvidence=visualEnvelope(o,child);
    o.renderedArtifacts=[parent,child];o.visualEvidence=[parentEvidence,childEvidence];
    const p=projectVisualEvidence(o,objective,childEvidence);assert.equal(p.error,undefined);assert.equal(p.bindings['/offers/0'].renderedArtifact.journey.interactions[0].resultingRenderId,child.id);
    const truth=evaluate({...knowledge(o),observations:[{...o,candidates:projectObservation(o,objective).candidates}]});assert.equal(truth.prices.US.propositions.TARGET_MARKET.value,'US');
    parentEvidence.regions=parentEvidence.regions.filter(row=>row.id!=='monthly-control');assert.equal(projectVisualEvidence(o,objective,childEvidence).error,'VISUAL_INTERACTION_SOURCE_INVALID');
});
