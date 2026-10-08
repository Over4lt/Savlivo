import test from 'node:test';
import assert from 'node:assert/strict';
import pngjs from 'pngjs';
import {createKnowledge,context,digest} from './model.mjs';
import {availableActions,runResearch} from './engine.mjs';
import {evaluate} from './truth.mjs';
import {createRenderedOverview,validateRenderedOverview} from './rendered-overview.mjs';
import {readPngPixels,writePngPixels} from './png-pixels.mjs';
import {compileVisualObservation} from './live-visual.mjs';
import {safeRenderedControl} from './browser-render.mjs';
import {renderedResearchActions} from './rendered-research.mjs';
import {projectVisualEvidence} from './visual-evidence.mjs';

const {PNG}=pngjs;
const objective={kind:'PRICE',serviceId:'northstar',serviceName:'Northstar Club',providerHosts:['provider.example'],markets:['US'],seeds:['https://provider.example/pricing']};
const body='<html><title>Northstar Club</title><body><main>Membership plans render after load.</main></body></html>';
const capture={capturedAt:'2026-10-08T09:00:01.000Z',browserBuild:'offline-playwright',captureRevision:'fixture',viewportCss:{width:800,height:600},deviceScaleFactor:1,zoom:1,locale:'en-US',timezone:'UTC',fullPage:true,documentExtent:{width:800,height:600},coordinateSpace:'IMAGE_PIXELS',clippingOrStitching:'NONE',completeness:'COMPLETE',stability:'STABLE',obstructionStatus:'CLEAR'};
const png=(state=false)=>{const image=new PNG({width:800,height:600,colorType:6,inputColorType:6,inputHasAlpha:true});image.data[0]=state?1:0;return PNG.sync.write(image);};
const dom=[
    {text:'Northstar Club',role:'h1',selected:null,disabled:null,bboxPx:[20,20,220,30]},
    {text:'Core',role:'h2',selected:null,disabled:null,bboxPx:[30,110,180,24]},
    {text:'USD 12.00/month',role:'span',selected:null,disabled:null,bboxPx:[30,150,180,24]},
    {text:'Billed USD 12.00 every month',role:'span',selected:null,disabled:null,bboxPx:[30,190,300,24]},
    {text:'Annual billing',role:'tab',selected:false,disabled:false,bboxPx:[450,30,120,24]},
];
const raw={serviceNodeId:'dom-0',billingState:{selectedNodeId:null,alternativeNodeIds:['dom-4']},offerings:[{nameNodeId:'dom-1',audience:'CONSUMER',relationship:'SUBSCRIPTION',charges:[{nodeIds:['dom-2'],amountText:'12.00',currencyText:'USD',cadenceText:'/month',cadenceUnit:'MONTHLY',role:'ORDINARY',qualifierText:null,paymentNodeIds:['dom-3'],paymentText:'Billed USD 12.00 every month',paymentCadence:'MONTHLY',priceKind:'CHARGE'}],availabilityNodeIds:[]}],globalNodeIds:[],uncertainties:[]};
function prior() {
    const k=createKnowledge({objective,permissions:{RENDERED:true},bounds:{actions:1,plannerCalls:2,modelCalls:1}});
    const o={id:'parent',action:'parent',kind:'PROVIDER',url:objective.seeds[0],requestedUrl:objective.seeds[0],context:context('DIRECT'),outcome:'OK',truncated:false,body,bytes:Buffer.byteLength(body),sha256:digest(body),format:'WEB',contentType:'text/html',httpStatus:200,acquiredAt:'2026-10-08T09:00:00.000Z',transport:{kind:'DIRECT',verification:'UNBOUND'},access:[],completeness:'COMPLETE',responseMetadata:{},redirects:[],acquisitionTiming:{elapsedMs:1},candidates:[]};
    k.observations.push(o);return k;
}
function renderer() {return async(action,{parent}={})=>{
    const state=action.mode==='STATE',prior=state?parent.renderedArtifacts.at(-1):null,image=png(state);
    return {page:{url:action.url,requestedUrl:action.url,body,httpStatus:200,completeness:'COMPLETE',transport:{kind:'DIRECT',verification:'UNBOUND'},access:[],responseMetadata:{},redirects:[]},finalUrl:action.url,pngBytes:image,capture,journey:{id:state?'offline-state':'offline',parentRenderId:prior?.id??null,stateFingerprint:state?'state-2':'state',interactions:state?[{actionId:action.id,kind:'PRESENTATION_SELECT',parentRenderId:prior.id,sourceControlRef:{kind:'IMAGE_REGION',renderId:prior.id,imageSha256:prior.image.sha256,regionId:'control-dom-4'},intendedPresentationVariant:'Annual billing',policyDecisionRef:digest('safe-control'),executedAt:'2026-10-08T09:00:03.000Z',executionOutcome:'COMPLETED',resultingRenderId:'',observedStateRefs:[],navigationReceiptRef:null}]:[]},dom};
};}
function interpreter({observation,artifact,overview,dom:elements,objective:target}) {return {model:'fixture',status:'completed',latencyMs:1,usage:{input_tokens:10,output_tokens:10,total_tokens:20},envelope:compileVisualObservation(raw,{observation,artifact,overview,dom:elements,objective:target,requestHash:digest('request'),responseHash:digest('response'),responseModel:'fixture',createdAt:'2026-10-08T09:00:02.000Z'})};}
interpreter.contract={model:'fixture',promptHash:digest('prompt'),schemaRevision:'V3_VISUAL_EVIDENCE_V1'};

test('planner selects a render only for a grounded unresolved visual source',()=>{
    const k=prior(),actions=availableActions(k,{RENDERED:renderer()}).actions;
    assert.ok(actions.some(a=>a.kind==='RENDER'&&a.observation==='parent'&&a.overviewWidth===800&&a.targetIds.length));
    assert.equal(availableActions(k,{}).actions.some(a=>a.kind==='RENDER'),false);
    const sufficient=createKnowledge({objective,permissions:{RENDERED:true}});
    assert.equal(availableActions(sufficient,{RENDERED:renderer()}).actions.some(a=>a.kind==='RENDER'),false);
});

test('render and Sol failures leave existing truth unresolved, not contradicted',async()=>{
    for(const [capability,visual] of [[async()=>{throw Error('BROWSER_DOWN');},interpreter],[renderer(),async()=>{throw Error('VISUAL_MODEL_UNAVAILABLE');}]]){
        const k=await runResearch({knowledge:prior(),capabilities:{RENDERED:capability},interpretVisual:visual});
        assert.equal(evaluate(k).established,false);
        assert.ok(Object.values(evaluate(k).prices.US.propositions).every(row=>row.state!=='CONTRADICTED'));
        assert.equal(k.attempts.filter(a=>a.action.kind==='RENDER').length,1);
    }
});

test('overview is full-page, deterministic and bound to original image bytes',()=>{
    const source=png(),a=createRenderedOverview(source,{width:400}),b=createRenderedOverview(source,{width:400});
    assert.equal(a.heightPx,300);assert.equal(a.sha256,b.sha256);
    assert.deepEqual(a,b);
    assert.throws(()=>validateRenderedOverview({image:{bytesBase64:source.toString('base64'),sha256:digest('wrong')}},a),/RENDERED_OVERVIEW_BINDING_INVALID/);
});

test('pure PNG codec preserves real RGB values across filtered source and deterministic output',()=>{
    const image=new PNG({width:5,height:4,colorType:6,inputColorType:6,inputHasAlpha:true});
    for(let index=0;index<image.data.length;index++)image.data[index]=(index*37)%256;
    const decoded=readPngPixels(PNG.sync.write(image,{filterType:4}));
    assert.deepEqual([...decoded.data],[...image.data]);
    assert.deepEqual([...readPngPixels(writePngPixels(decoded)).data],[...image.data]);
});

test('successful render retains typed regions, DOM state and optional visual admission',async()=>{
    const k=await runResearch({knowledge:prior(),capabilities:{RENDERED:renderer()},interpretVisual:interpreter});
    const o=k.observations.find(row=>row.action===k.attempts.find(a=>a.action.kind==='RENDER').id);
    assert.ok(o?.renderedArtifacts?.length===1);assert.ok(o?.renderedOverviews?.length===1);
    assert.equal(o.renderedOverviews[0].sourceSha256,o.renderedArtifacts[0].image.sha256);
    assert.equal(o.domSnapshot[2].text,'USD 12.00/month');
    assert.equal(o.visualEvidence[0].regions.find(row=>row.id==='price-0-0').scope,'TEXT');
    assert.equal(projectVisualEvidence(o,objective,o.visualEvidence[0]).error,undefined);
    assert.equal(k.usage.modelCalls,1);assert.equal(k.visualUsage.length,1);
    assert.notEqual(k.catalog.state,'CATALOG_EXHAUSTED');
    assert.ok(o.visualEvidence[0].offers.length===1);
});

test('source-visible safe presentation action retains parent control and resulting state lineage',async()=>{
    const k=prior();k.bounds.actions=2;k.bounds.modelCalls=2;k.bounds.renderedActions=2;k.bounds.plannerCalls=3;
    const result=await runResearch({knowledge:k,capabilities:{RENDERED:renderer()},interpretVisual:interpreter});
    const rendered=result.observations.find(row=>row.renderedArtifacts?.length);
    assert.equal(result.attempts.filter(row=>row.action.kind==='RENDER').length,2);
    assert.equal(rendered.renderedArtifacts.length,2);
    assert.equal(rendered.renderedArtifacts[1].journey.parentRenderId,rendered.renderedArtifacts[0].id);
    assert.equal(rendered.renderedArtifacts[1].journey.interactions[0].sourceControlRef.regionId,'control-dom-4');
    assert.equal(projectVisualEvidence(rendered,objective,rendered.visualEvidence[1]).error,undefined);
});

test('a retained pricing switch remains actionable when the latest gap cites another observation',async()=>{
    const k=await runResearch({knowledge:prior(),capabilities:{RENDERED:renderer()},interpretVisual:interpreter});
    const rendered=k.observations.find(row=>row.renderedArtifacts?.length);
    for(const target of k.gapState.targets)target.support=[{observation:'another-provider-observation'}];
    const actions=renderedResearchActions(k,evaluate(k));
    assert.ok(actions.some(row=>row.mode==='STATE'&&row.observation===rendered.id&&row.interaction.controlId==='dom-4'));
});

test('missing payment wording does not trigger a resolution crop retry',async()=>{
    const k=await runResearch({knowledge:prior(),capabilities:{RENDERED:renderer()},interpretVisual:interpreter});
    const rendered=k.observations.find(row=>row.renderedArtifacts?.length),evidence=rendered.visualEvidence[0];
    evidence.unresolved=[{target:'payment-wording',reason:'The page does not state the actual payment cadence',supportingRegionIds:['offer-0']}];
    assert.equal(renderedResearchActions(k,evaluate(k)).some(row=>row.mode==='CLARIFY'),false);
});

test('a specific unresolved visual region can trigger one bounded high-resolution clarification',async()=>{
    const k=prior();k.bounds.actions=2;k.bounds.modelCalls=2;k.bounds.renderedActions=2;k.bounds.plannerCalls=3;
    let renders=0,clarifications=0;
    const browser=async(...args)=>{renders++;return renderer()(...args);};
    const visual=async input=>{const result=interpreter(input);if(input.focus){clarifications++;assert.equal(input.focus.schema,'V3_TARGETED_REGION_V1');}else result.envelope.unresolved.push({target:'billing-control',reason:'Relevant state is unclear at overview size',supportingRegionIds:['offer-0']});return result;};
    visual.contract=interpreter.contract;
    const reasoner=state=>({actionId:(state.actions.find(a=>a.mode==='CLARIFY')??state.actions.find(a=>a.kind==='RENDER'))?.id});
    const result=await runResearch({knowledge:k,capabilities:{RENDERED:browser},interpretVisual:visual,reasoner});
    assert.equal(renders,1);assert.equal(clarifications,1);assert.equal(result.usage.modelCalls,2);
    assert.ok(result.trace.some(row=>row.event==='TARGETED_VISUAL_CLARIFICATION'&&row.regionId==='offer-0'));
});

test('invalid model region and UNKNOWN relationship fail closed',async()=>{
    const k=await runResearch({knowledge:prior(),capabilities:{RENDERED:renderer()},interpretVisual:interpreter});
    const o=k.observations.find(row=>row.visualEvidence?.length),envelope=structuredClone(o.visualEvidence[0]);
    envelope.regions.find(row=>row.id==='price-0-0').bboxPx=[790,590,20,20];
    assert.equal(projectVisualEvidence(o,objective,envelope).error,'VISUAL_REGION_INVALID');
    const unknown=structuredClone(o.visualEvidence[0]);unknown.relationships.find(row=>row.id==='charge-0-0').evidenceKind='UNKNOWN';
    assert.equal(projectVisualEvidence(o,objective,unknown).source.offers.length,0);
});

test('readable disabled CTA is not treated as an enabled introductory offer',()=>{
    assert.equal(safeRenderedControl({text:'Start trial',role:'button',disabled:false,bboxPx:[1,1,20,20]},'PRESENTATION_SELECT'),false);
    assert.equal(safeRenderedControl({text:'Reject cookies',role:'button',disabled:false,bboxPx:[1,1,20,20]},'COOKIE_REJECT'),true);
    assert.equal(safeRenderedControl({text:'Yearly billing',role:'tab',disabled:false,selected:false,bboxPx:[1,1,20,20]},'PRESENTATION_SELECT'),true);
    const disabled=structuredClone(raw);disabled.offerings[0].charges[0].role='INTRODUCTORY';disabled.offerings[0].charges[0].nodeIds=['dom-2'];
    const nodes=dom.map((row,index)=>({id:'dom-'+index,...row}));nodes[2]={...nodes[2],text:'Try for USD 0.00',role:'button',disabled:true};disabled.offerings[0].charges[0].amountText='0.00';disabled.offerings[0].charges[0].cadenceText=null;
    const fake={id:'render',image:{widthPx:800,heightPx:600,sha256:digest('image')}};
    const output=compileVisualObservation(disabled,{observation:{id:'browser',sha256:digest('body')},artifact:fake,overview:{sha256:digest('overview'),widthPx:800},dom:nodes,objective,requestHash:digest('request'),responseHash:digest('response'),responseModel:'fixture',createdAt:'2026-10-08T09:00:02.000Z'});
    assert.equal(output.offers[0].charges.length,0);assert.ok(output.unresolved.length);
});

test('identical rendered pixels and visual contract do not trigger a second Sol analysis',async()=>{
    const k=prior();k.bounds.actions=2;k.bounds.renderedActions=2;k.bounds.modelCalls=2;k.bounds.plannerCalls=3;
    k.observations.push({...structuredClone(k.observations[0]),id:'second-parent',action:'second-parent'});
    let calls=0;
    const visual=async input=>{calls++;return interpreter(input);};visual.contract=interpreter.contract;
    const reasoner=state=>({actionId:state.actions.find(row=>row.kind==='RENDER'&&row.mode==='OVERVIEW')?.id});
    const result=await runResearch({knowledge:k,capabilities:{RENDERED:renderer()},interpretVisual:visual,reasoner});
    assert.equal(result.attempts.filter(row=>row.action.kind==='RENDER').length,2);
    assert.equal(calls,1);
    assert.ok(result.trace.some(row=>row.event==='VISUAL_REUSE'));
});

test('a failed visual attempt is skipped as duplicate rather than reported as reusable evidence',async()=>{
    const k=prior();k.bounds.actions=2;k.bounds.renderedActions=2;k.bounds.modelCalls=2;k.bounds.plannerCalls=3;
    k.observations.push({...structuredClone(k.observations[0]),id:'second-parent',action:'second-parent'});
    let calls=0;
    const visual=async()=>{calls++;throw Error('VISUAL_MODEL_UNAVAILABLE');};visual.contract=interpreter.contract;
    const reasoner=state=>({actionId:state.actions.find(row=>row.kind==='RENDER'&&row.mode==='OVERVIEW')?.id});
    const result=await runResearch({knowledge:k,capabilities:{RENDERED:renderer()},interpretVisual:visual,reasoner});
    assert.equal(calls,1);
    assert.ok(result.trace.some(row=>row.event==='VISUAL_DUPLICATE_ATTEMPT_SKIPPED'));
    assert.equal(result.trace.some(row=>row.event==='VISUAL_REUSE'),false);
});

test('visual USD amount, page language and provider URL do not establish market',async()=>{
    const k=await runResearch({knowledge:prior(),capabilities:{RENDERED:renderer()},interpretVisual:interpreter});
    const offer=k.observations.find(row=>row.visualEvidence?.length).visualEvidence[0].offers[0];
    assert.equal(offer.market.country,null);
    assert.equal(offer.market.basis,'UNKNOWN');
    assert.equal(evaluate(k).prices.US.propositions.TARGET_MARKET.state,'UNRESOLVED');
    assert.notEqual(k.catalog.state,'CATALOG_EXHAUSTED');
});

test('visible service name inside a bounded source element grounds model output without exact label equality',()=>{
    const nodes=dom.map((row,index)=>({id:'dom-'+index,...row}));
    nodes[0]={...nodes[0],text:'Northstar Club © 2026'};
    const output=compileVisualObservation({...structuredClone(raw),serviceNodeId:null},{observation:{id:'browser',sha256:digest('body')},artifact:{id:'render',image:{widthPx:800,heightPx:600,sha256:digest('image')}},overview:{sha256:digest('overview'),widthPx:800},dom:nodes,objective,requestHash:digest('request'),responseHash:digest('response'),responseModel:'fixture',createdAt:'2026-10-08T09:00:02.000Z'});
    assert.equal(output.service.name,'Northstar Club');
    assert.equal(output.transcriptions.find(row=>row.id==='t-service').verbatimText,'Northstar Club © 2026');
});

test('split visible offering names remain one bounded visual proposition',()=>{
    const nodes=dom.map((row,index)=>({id:'dom-'+index,...row}));
    nodes[1]={...nodes[1],text:'Core',bboxPx:[30,110,70,24]};
    nodes.push({id:'dom-5',text:'Plus',role:'span',selected:null,disabled:null,bboxPx:[100,110,60,24]});
    const input=structuredClone(raw);input.offerings[0].nameNodeIds=['dom-1','dom-5'];delete input.offerings[0].nameNodeId;
    const output=compileVisualObservation(input,{observation:{id:'browser',sha256:digest('body')},artifact:{id:'render',image:{widthPx:800,heightPx:600,sha256:digest('image')}},overview:{sha256:digest('overview'),widthPx:800},dom:nodes,objective,requestHash:digest('request'),responseHash:digest('response'),responseModel:'fixture',createdAt:'2026-10-08T09:00:02.000Z'});
    assert.equal(output.offers[0].name,'Core Plus');
});

test('distant FAQ text cannot erase a nearby annual charge or turn a trial link into an enabled action',()=>{
    const nodes=[
        {id:'dom-0',text:'Northstar Club ©',role:'p',disabled:null,selected:null,bboxPx:[20,2800,150,20]},
        {id:'dom-1',text:'Family',role:'h1',disabled:null,selected:null,bboxPx:[240,70,100,35]},
        {id:'dom-2',text:'Plan',role:'h1',disabled:null,selected:null,bboxPx:[340,70,80,35]},
        {id:'dom-3',text:'USD 120.00',role:'span',disabled:null,selected:null,bboxPx:[260,150,100,25]},
        {id:'dom-4',text:'/year',role:'span',disabled:null,selected:null,bboxPx:[360,150,55,25]},
        {id:'dom-5',text:'Try for USD 0.00',role:'a',disabled:null,selected:null,bboxPx:[270,220,130,25]},
        {id:'dom-6',text:'Family membership details in the FAQ',role:'p',disabled:null,selected:null,bboxPx:[100,2500,500,30]}
    ];
    const input={serviceNodeId:'dom-0',billingState:{selectedNodeId:null,alternativeNodeIds:[]},offerings:[{nameNodeIds:['dom-1','dom-2'],audience:'CONSUMER',relationship:'MEMBERSHIP',charges:[{nodeIds:['dom-5'],amountText:'0.00',currencyText:'USD',cadenceText:null,cadenceUnit:'UNKNOWN',role:'INTRODUCTORY',qualifierText:'Try for',paymentNodeIds:[],paymentText:null,paymentCadence:'UNKNOWN',priceKind:'CHARGE'},{nodeIds:['dom-3'],amountText:'120.00',currencyText:'USD',cadenceText:'/year',cadenceUnit:'YEARLY',role:'ORDINARY',qualifierText:null,paymentNodeIds:[],paymentText:null,paymentCadence:'UNKNOWN',priceKind:'CHARGE'}],availabilityNodeIds:['dom-6']}],uncertainties:[]};
    const output=compileVisualObservation(input,{observation:{id:'browser',sha256:digest('body')},artifact:{id:'render',image:{widthPx:800,heightPx:3000,sha256:digest('image')}},overview:{sha256:digest('overview'),widthPx:800},dom:nodes,objective,requestHash:digest('request'),responseHash:digest('response'),responseModel:'fixture',createdAt:'2026-10-08T09:00:02.000Z'});
    assert.equal(output.offers.length,1);assert.equal(output.offers[0].name,'Family Plan');
    assert.equal(output.offers[0].charges.length,1);assert.equal(output.offers[0].charges[0].cadence.unit,'YEARLY');
    assert.equal(output.offers[0].charges[0].role,'ORDINARY');assert.ok(output.unresolved.some(row=>row.target==='introductory-control-0'));
});

test('model uncertainty with a visible element ID becomes a bounded clarification target',()=>{
    const input=structuredClone(raw);input.uncertainties=[{reason:'The billed cadence remains hard to read',nodeIds:['dom-3']}];
    const output=compileVisualObservation(input,{observation:{id:'browser',sha256:digest('body')},artifact:{id:'render',image:{widthPx:800,heightPx:600,sha256:digest('image')}},overview:{sha256:digest('overview'),widthPx:800},dom:dom.map((row,index)=>({id:'dom-'+index,...row})),objective,requestHash:digest('request'),responseHash:digest('response'),responseModel:'fixture',createdAt:'2026-10-08T09:00:02.000Z'});
    const id=output.unresolved[0].supportingRegionIds[0];
    assert.equal(output.regions.find(row=>row.id===id).scope,'GROUP');
    assert.ok(output.regions.find(row=>row.id===id).bboxPx[2]<800);
});

test('paired visible pricing buttons permit a model-identified alternate state without English labels',()=>{
    const alternate={id:'dom-5',text:'Mensuel',role:'button',groupId:'pricing-controls',selected:false,disabled:false,bboxPx:[450,30,90,30]};
    const selected={id:'dom-6',text:'Annuel',role:'button',groupId:'pricing-controls',selected:true,disabled:false,bboxPx:[550,30,90,30]};
    assert.equal(safeRenderedControl(alternate,'PRESENTATION_SELECT'),false);
    assert.equal(safeRenderedControl(alternate,'PRESENTATION_SELECT',selected),true);
    assert.equal(safeRenderedControl({...alternate,groupId:'other-controls'},'PRESENTATION_SELECT',selected),false);
    assert.equal(safeRenderedControl({...alternate,text:'Start trial'},'PRESENTATION_SELECT',selected),false);
    const input=structuredClone(raw);input.billingState={selectedNodeId:'dom-6',alternativeNodeIds:['dom-5']};
    const output=compileVisualObservation(input,{observation:{id:'browser',sha256:digest('body')},artifact:{id:'render',image:{widthPx:800,heightPx:600,sha256:digest('image')}},overview:{sha256:digest('overview'),widthPx:800},dom:[...dom.map((row,index)=>({id:'dom-'+index,...row})),alternate,selected],objective,requestHash:digest('request'),responseHash:digest('response'),responseModel:'fixture',createdAt:'2026-10-08T09:00:02.000Z'});
    assert.deepEqual(output.transformation.diagnostics.presentationControlIds,['dom-5']);
    assert.equal(output.transformation.diagnostics.selectedControlId,'dom-6');
});

test('source-observed enabled trial anchor keeps introduction separate from subsequent recurring charge',()=>{
    const nodes=[...dom.map((row,index)=>({id:'dom-'+index,...row})),{id:'dom-5',text:'Try for USD 0.00',role:'a',selected:null,disabled:false,bboxPx:[30,210,180,25]}];
    const input=structuredClone(raw);input.offerings[0].charges[0].role='SUBSEQUENT';
    input.offerings[0].charges.unshift({nodeIds:['dom-5'],amountText:'0.00',currencyText:'USD',cadenceText:null,cadenceUnit:'UNKNOWN',role:'INTRODUCTORY',qualifierText:'Try for',paymentNodeIds:[],paymentText:null,paymentCadence:'UNKNOWN',priceKind:'CHARGE'});
    const output=compileVisualObservation(input,{observation:{id:'browser',sha256:digest('body')},artifact:{id:'render',image:{widthPx:800,heightPx:600,sha256:digest('image')}},overview:{sha256:digest('overview'),widthPx:800},dom:nodes,objective,requestHash:digest('request'),responseHash:digest('response'),responseModel:'fixture',createdAt:'2026-10-08T09:00:02.000Z'});
    assert.deepEqual(output.offers[0].charges.map(row=>row.role),['INTRODUCTORY','SUBSEQUENT']);
    assert.equal(output.offers[0].transitions.length,1);
    assert.equal(output.offers[0].transitions[0].kind,'RECURS_AFTER_INTRO');
});

test('enabled trial and subsequent charge pass the existing transition admission rule',async()=>{
    const nodes=[...dom,{text:'Try for USD 0.00',role:'a',selected:null,disabled:false,bboxPx:[30,210,180,25]}];
    const input=structuredClone(raw);input.offerings[0].charges[0].role='SUBSEQUENT';
    input.offerings[0].charges.unshift({nodeIds:['dom-5'],amountText:'0.00',currencyText:'USD',cadenceText:null,cadenceUnit:'UNKNOWN',role:'INTRODUCTORY',qualifierText:'Try for',paymentNodeIds:[],paymentText:null,paymentCadence:'UNKNOWN',priceKind:'CHARGE'});
    const base=renderer(),browser=async(...args)=>({...await base(...args),dom:nodes});
    const visual=async({observation,artifact,overview,dom:elements,objective:target})=>({model:'fixture',status:'completed',latencyMs:1,usage:{input_tokens:1,output_tokens:1,total_tokens:2},envelope:compileVisualObservation(input,{observation,artifact,overview,dom:elements,objective:target,requestHash:digest('request'),responseHash:digest('response'),responseModel:'fixture',createdAt:'2026-10-08T09:00:02.000Z'})});
    visual.contract=interpreter.contract;
    const result=await runResearch({knowledge:prior(),capabilities:{RENDERED:browser},interpretVisual:visual});
    const observation=result.observations.find(row=>row.renderedArtifacts?.length),admission=projectVisualEvidence(observation,objective,observation.visualEvidence[0]);
    assert.equal(admission.error,undefined);
    assert.equal(admission.accepted.length,2);
    assert.equal(admission.rejected.some(row=>row.reason==='VISUAL_TRANSITION_REQUIRED'),false);
});

test('source-visible consent context permits bounded reject action after visual understanding fails',async()=>{
    const k=prior();k.bounds.actions=2;k.bounds.renderedActions=2;k.bounds.modelCalls=2;k.bounds.plannerCalls=3;
    const consent={text:'Reject All',role:'button',contextText:'About Your Privacy. We and our partners store information on a device.',selected:null,disabled:false,bboxPx:[500,300,100,30]};
    assert.equal(safeRenderedControl(consent,'COOKIE_REJECT'),true);
    assert.equal(safeRenderedControl({...consent,contextText:null},'COOKIE_REJECT'),false);
    const base=renderer();
    const browser=async(action,options)=>{
        const receipt=await base(action,options);
        if(action.mode==='STATE'){
            receipt.journey.interactions[0].kind='COOKIE_REJECT';
            receipt.journey.interactions[0].sourceControlRef.regionId='control-dom-5';
            receipt.journey.interactions[0].intendedPresentationVariant='Reject All';
        }
        receipt.dom=action.mode==='STATE'?dom:[...dom,consent];
        return receipt;
    };
    const reasoner=state=>({actionId:state.actions.find(row=>row.kind==='RENDER'&&row.mode==='STATE')?.id??state.actions.find(row=>row.kind==='RENDER')?.id});
    const result=await runResearch({knowledge:k,capabilities:{RENDERED:browser},interpretVisual:async()=>{throw Error('VISUAL_MODEL_UNAVAILABLE');},reasoner});
    const actions=result.attempts.filter(row=>row.action.kind==='RENDER').map(row=>row.action.mode);
    assert.deepEqual(actions,['OVERVIEW','STATE']);
    const observed=result.observations.find(row=>row.renderedArtifacts?.length);
    assert.equal(observed.renderedArtifacts[1].journey.interactions[0].kind,'COOKIE_REJECT');
    assert.ok(observed.renderedControlRegions[0].regions.some(row=>row.id==='control-dom-5'));
    assert.equal(projectVisualEvidence(observed,objective,observed.visualEvidence.find(row=>row.renderId===observed.renderedArtifacts[1].id)).error,undefined);
    assert.equal(evaluate(result).established,false);
});
