import { actionIdentity, addDestination, canonical, checkpoint, context, createKnowledge, digest, markLimit, normalizeUrl, providerBound, materializeAuthority, promoteCandidateHost } from './model.mjs';
import {reviewCandidateAuthority} from './provider-authority-review.mjs';
import {targetOutcome} from './evidence-targets.mjs';
import {diagnoseGaps,gapInspectionActions,inspectGapSource,gapTermination} from './research-gaps.mjs';
import {exhaustionDiagnosis} from './research-strategist.mjs';
import {buildWorkingModel,rankResearchActions,workingDecision} from './working-model.mjs';
import { evaluate, interpretStructured, readSource } from './truth.mjs';
import {projectTranslation,translationError} from './translation.mjs';
import {projectEvidence,understandingError} from './evidence.mjs';
import {projectObservation} from './projection.mjs';
import {admittedProjectionCandidates} from './native-structured.mjs';
import {acquisitionCapacity as acquisition,failureClass} from './acquisition-contract.mjs';
import {semanticUnitLimits} from './semantic-units.mjs';
import { projectWebSource } from './source.mjs';
import {candidateRouted,researchRouted} from './discovery-authority.mjs';
import {researchTruth,refreshCatalog} from './subscription-catalog.mjs';
import {extractNavigation,extractSitemap,queryFamilies,discoveryCapacity,diverseCandidates,rankCandidate} from './discovery.mjs';
import {renderedResearchActions,browserPageObservation,retainRenderedObservation,retainControlSourceEvidence,admitRenderedInterpretation,visualFingerprint} from './rendered-research.mjs';
import {createTargetedVisualRegion} from './rendered-overview.mjs';
function admitWebProjection(o,objective){
    const projection=projectObservation(o,objective);
    o.nativeStructured=projection.nativeStructured;
    return admittedProjectionCandidates(projection);
}
const resourceCapacityFailure=f=>f?.kind==='CAPACITY'&&['BODY_CAPACITY','DECOMPRESSION_CAPACITY','DECODED_CAPACITY','OBSERVATION_CAPACITY','HEADER_CAPACITY','REDIRECT_CAPACITY'].includes(failureClass(f.code));
const route = a => a.kind === 'DISCOVER' ? 'TAVILY' : a.kind==='INSPECT'?'LOCAL':a.kind==='RENDER'?'RENDERED':a.context?.transport;
function searches(k, truth) {
    const markets = k.objective.kind === 'PRICE' ? k.objective.markets : [null];
    return markets.flatMap(m => {
        const needs=truth.needs.filter(n=>n.market===m).map(n=>n.id);
        if(!needs.length)return [];
        // A legacy free-form proposal consumes its semantic intent once, not endless paraphrases.
        if(k.attempts.some(x=>x.action.kind==='DISCOVER'&&!x.action.family&&(x.action.market??null)===m&&canonical(x.action.needs)===canonical([...needs].sort())))return [];
        return queryFamilies(k.objective,m,needs,k);
    });
}
function proposals(k, truth) {
    const actions = [];
    for (const d of k.destinations) {
        if(evaluate(k).established&&k.observations.some(o=>o.url===d.url&&o.outcome==='OK'&&!(o.semanticUnits??[]).some(u=>!o.semanticAttempts?.some(a=>a.unit===u.id))))continue;
        const needs = truth.needs.filter(n => d.needs.includes(n.proposition));
        if (!needs.length)
            continue;
        const representation=candidateRouted(k.objective,d.url)?'CANDIDATE_PAGE':'PROVIDER_PAGE';
        actions.push({ kind: 'ACQUIRE', url: d.url, context: context('DIRECT','UNBOUND',representation), needs: needs.map(n => n.id), reason: representation==='CANDIDATE_PAGE'?'Observe this grounded research candidate for unresolved facts':'Observe this grounded provider resource for unresolved facts', value: 5+(d.discovery?.score??0) });
        for (const market of [...new Set(needs.map(n => n.market).filter(Boolean))])
            actions.push({ kind: 'ACQUIRE', url: d.url, context: context('DECODO', market,representation), needs: needs.filter(n => n.market === market).map(n => n.id), reason: 'Target-country perspective may reveal the missing market-specific presentation', value: 10+(d.discovery?.score??0) });
    }
    if(k.semanticUnavailable?.status===429&&Date.now()>=k.semanticUnavailable.until)for(const o of k.observations.filter(o=>(o.semanticUnits?.length??0)>0&&/\p{Sc}\s*\p{N}|\b[A-Z]{3}\s*\p{N}/u.test(o.body)&&/UNAVAILABLE|FAILED/.test(o.interpretation?.kind??'')&&!(o.reinspectionCount>0)).slice(-8))actions.push({kind:'INSPECT',observation:o.id,url:o.url,needs:truth.needs.map(n=>n.id),reason:'Reinterpret intact retained source after understanding cooldown; no provider request',value:30});
    for(const o of k.observations) {
        const units=(o.semanticUnits??[]).filter(u=>!(o.semanticAttempts??[]).some(a=>a.unit===u.id)).slice(0,semanticUnitLimits.units).map(u=>u.id);
        if(units.length&&!k.semanticUnavailable)actions.push({kind:'INSPECT',observation:o.id,url:o.url,units,needs:truth.needs.map(n=>n.id),reason:'Process unattempted source-bound regions; catalog work remains',value:units.some(id=>o.semanticUnits.find(u=>u.id===id)?.researchValue>=6)?40:2});
    }
    return [...gapInspectionActions(k,truth.needs.map(n=>n.id)), ...actions, ...renderedResearchActions(k,truth), ...searches(k, truth)];
}
function capacity(k, a) {
    const u = k.usage, b = k.bounds, checks = [['actions', u.actions, b.actions], ['bytes', u.bytes, b.bytes], ['decodedBytes', u.decodedBytes??0, b.decodedBytes??acquisition.objectiveDecodedBytes], ['acquisitionMs', u.acquisitionMs??0, b.acquisitionMs??acquisition.objectiveAcquisitionMs], ['networkRequests', u.networkRequests ?? 0, b.networkRequests ?? 96]];
    if(a.kind==='INSPECT'){if(a.inspection!=='GAP_SOURCE')checks.push(['modelCalls',u.modelCalls,b.modelCalls]);}
    else if(a.kind==='RENDER')checks.push(['renderedActions',u.renderedActions??0,b.renderedActions??12],['modelCalls',u.modelCalls,b.modelCalls]);
    else if (a.kind === 'DISCOVER')
        checks.push(['searches', u.searches, b.searches]);
    else {
        checks.push(['acquisitions', u.acquisitions, b.acquisitions]);
        if(k.destinations.find(d=>d.url===a.url)?.discovery?.resource==='SITEMAP')checks.push(['sitemapAcquisitions',u.sitemapAcquisitions??0,b.sitemapAcquisitions??4]);
        if (a.context.transport === 'DECODO')
            checks.push(['countryAcquisitions', u.countryAcquisitions, b.countryAcquisitions]);
        checks.push(['observationsPerDestination', k.attempts.filter(x => x.action.kind === 'ACQUIRE' && x.action.url === a.url).length, b.observationsPerDestination]);
        checks.push(['observationsPerContext', k.attempts.filter(x => x.id === a.id).length, b.observationsPerContext]);
    }
    return checks.filter(([, used, limit]) => used >= limit).map(([name]) => name);
}
function validate(k, truth, input, adapters) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        return { action: {}, reason: 'INVALID_ACTION' };
    const a = structuredClone(input);
    if (!['ACQUIRE', 'DISCOVER','INSPECT','RENDER'].includes(a.kind) || !Array.isArray(a.needs) || !a.needs.length || a.needs.some(id => !truth.needs.some(n => n.id === id)))
        return { action: a, reason: 'NO_CURRENT_NEED' };
    a.needs = [...new Set(a.needs)].sort();
    a.value = Number.isFinite(a.value) && a.value > 0 ? a.value : 0;
    if (!a.value || typeof a.reason !== 'string' || !a.reason.trim() || a.reason.length > 1000)
        return { action: a, reason: 'NO_EXPLAINED_INFORMATION_VALUE' };
    if(a.kind==='RENDER'){
        const expected=renderedResearchActions(k,truth).find(row=>row.observation===a.observation&&row.overviewWidth===a.overviewWidth&&row.mode===a.mode&&row.interaction?.controlId===a.interaction?.controlId&&row.focus?.regionId===a.focus?.regionId);
        if(!expected||a.url!==expected.url||!Array.isArray(a.targetIds)||!a.targetIds.length||a.targetIds.some(id=>!expected.targetIds.includes(id)))return {action:a,reason:'UNGROUNDED_RENDER'};
        a.needs=expected.needs;a.targetIds=expected.targetIds;a.gapIds=expected.gapIds;a.reason=expected.reason;a.value=expected.value;a.mode=expected.mode;a.interaction=expected.interaction??null;a.focus=expected.focus??null;
        delete a.context;
    }
    else if(a.kind==='INSPECT'){
        const retained=k.observations.find(o=>o.id===a.observation&&o.outcome==='OK'&&!o.truncated&&o.sha256===digest(o.body));
        const gapSource=a.inspection==='GAP_SOURCE'&&retained&&a.bodySha256===retained.sha256&&gapInspectionActions(k,truth.needs.map(n=>n.id)).some(x=>x.observation===a.observation);
        const queued=retained&&Array.isArray(a.units)&&a.units.length>0&&a.units.length<=semanticUnitLimits.units&&a.units.every(id=>retained.semanticUnits?.some(u=>u.id===id)&&!retained.semanticAttempts?.some(x=>x.unit===id));
        if(!gapSource&&!queued&&(!retained||retained.reinspectionCount>0||k.semanticUnavailable?.status!==429||Date.now()<k.semanticUnavailable.until))return {action:a,reason:'UNGROUNDED_INSPECTION'};
        a.url=retained.url;delete a.context;
    }
    else if (a.kind === 'ACQUIRE') {
        a.url = normalizeUrl(a.url);
        const d = k.destinations.find(d => d.url === a.url);
        if (!d || !researchRouted(k.objective, a.url))
            return { action: a, reason: 'UNGROUNDED_DESTINATION' };
        if (a.needs.some(id => !d.needs.includes(truth.needs.find(n => n.id === id).proposition)))
            return { action: a, reason: 'DESTINATION_NOT_RELEVANT' };
        const c = a.context;
        const representation=candidateRouted(k.objective,a.url)?'CANDIDATE_PAGE':'PROVIDER_PAGE';
        if (!c || c.representation !== representation || !['DIRECT', 'DECODO'].includes(c.transport) || c.transport === 'DIRECT' && c.networkGeography !== 'UNBOUND' || c.transport === 'DECODO' && (!k.objective.markets.includes(c.networkGeography) || a.needs.some(id => truth.needs.find(n => n.id === id).market !== c.networkGeography)))
            return { action: a, reason: 'INVALID_OBSERVATION_CONTEXT' };
        // Extra planner metadata must never create a new observation identity.
        a.context = context(c.transport, c.networkGeography,representation);
        // Only a source-bound state relationship can request session continuity.
        if(d.discovery?.state?.group&&c.transport==='DECODO')a.journey=d.discovery.state.group;else delete a.journey;
        if (k.policyBlocks.some(b => b.scope === 'ORIGIN' ? new URL(a.url).origin === b.value : a.url === b.value))
            return { action: a, reason: 'PROVIDER_ACCESS_POLICY' };
    }
    else if (typeof a.query !== 'string' || !a.query.trim() || a.query.length > 1000 || a.needs.some(id => truth.needs.find(n => n.id === id).market !== (a.market ?? null)))
        return { action: a, reason: 'INVALID_DISCOVERY_INTENT' };
    if(a.kind==='DISCOVER'&&k.attempts.some(x=>x.action.kind==='DISCOVER'&&x.action.query?.trim().replace(/\s+/g,' ').toLowerCase()===a.query.trim().replace(/\s+/g,' ').toLowerCase()))return {action:a,reason:'SEMANTIC_DUPLICATE'};
    if(a.kind==='DISCOVER'&&a.family) {
        const expected=queryFamilies(k.objective,a.market??null,a.needs,k).find(x=>x.family===a.family);
        if(!expected||expected.query!==a.query)return {action:a,reason:'INVALID_DISCOVERY_FAMILY'};
    }
    a.id = actionIdentity(a);
    if ((a.kind!=='INSPECT'&&!k.permissions[route(a)]) || typeof adapters[route(a)] !== 'function')
        return { action: a, reason: 'CAPABILITY_NOT_PERMITTED_OR_AVAILABLE' };
    if (k.attempts.some(x => x.id === a.id) || a.kind === 'ACQUIRE' && [...k.observations,...(k.navigationResources??[])].some(o => o.url === a.url && canonical(o.context) === canonical(a.context)))
        return { action: a, reason: 'SEMANTIC_DUPLICATE' };
    const bounds = capacity(k, a);
    if (bounds.length)
        return { action: a, reason: 'CAPACITY_BOUND_REACHED', bounds };
    return { action: a, reason: 'ADMISSIBLE' };
}
export function availableActions(k, adapters = {}, extra = []) {
    const finalTruth=evaluate(k);k.gapState=diagnoseGaps(k,finalTruth);
    const truth = researchTruth(k,finalTruth), seen = new Set(), evaluated = [];
    for (const p of [...extra, ...proposals(k, truth)]) {
        const row = validate(k, truth, p, adapters), key = row.action.id ?? digest(row.action);
        if (seen.has(key))
            continue;
        seen.add(key);
        evaluated.push(row);
    }
    const actions=evaluated.filter(r => r.reason === 'ADMISSIBLE').map(r => r.action).sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
    // In candidate-only research, spend the first acquisition opportunity on
    // each exact discovered host before following links on an attempted host.
    // A failed attempt counts, so a blocked host cannot monopolize the budget.
    if(k.objective.providerHosts.length===0&&(k.objective.candidateHosts??[]).length>1){
        const attempted=new Set(k.attempts.filter(row=>row.action.kind==='ACQUIRE').map(row=>new URL(row.action.url).hostname));
        const unattempted=new Set(k.objective.candidateHosts.filter(host=>!attempted.has(host)));
        const breadth=actions.filter(a=>a.kind==='ACQUIRE'&&unattempted.has(new URL(a.url).hostname));
        if(breadth.length)return {truth,evaluated,actions:breadth};
    }
    return {truth,evaluated,actions};
}
function changes(before, after) {
    const flat = t => Object.fromEntries([...Object.entries(t.service), ...Object.entries(t.prices).flatMap(([m, v]) => Object.entries(v.propositions).map(([n, p]) => [m + ':' + n, p]))].map(([id, p]) => [id, { state: p.state, value: p.value }]));
    const a = flat(before), b = flat(after);
    return Object.entries(b).filter(([id, p]) => canonical(p) !== canonical(a[id])).map(([id, to]) => ({ id, from: a[id], to }));
}
async function persist(k, save) {
    if (save) await save(checkpoint(k));
}
function stop(k, reason, details = {}) {
    const researchStop=details.researchStop??(['OBJECTIVE_ESTABLISHED','MONTHLY_SUBSCRIPTION_NOT_OFFERED'].includes(reason)?{kind:'OBJECTIVE_RESOLVED'}:reason==='CAPACITY_BOUND_REACHED'?{kind:'CAPACITY_EXHAUSTED',bounds:details.bounds??[]}:['CAPABILITY_OR_INTERPRETATION_FAILED','REASONER_FAILED','RECOVERY_REQUIRED'].includes(reason)?{kind:'TOOL_UNAVAILABLE',scope:'PERMITTED_EXECUTION'}:exhaustionDiagnosis(k));
    k.stop = { reason, ...details,researchStop,...(k.gapStop?{gapTermination:k.gapStop}:{}), remainingNeeds: researchTruth(k,evaluate(k)).needs.map(n => n.id) };
    refreshCatalog(k,evaluate(k));
    if(k.catalog){
        k.stop.catalogState=k.catalog.state;
        if(reason==='OBJECTIVE_ESTABLISHED')k.stop.reason=k.catalog.state;
        k.stop.researchStop={...researchStop,kind:k.catalog.state,offeringTruthResolved:evaluate(k).established};
    }
    k.trace.push({ event: 'STOP', ...k.stop,usage:structuredClone(k.usage),bounds:k.bounds });
    return k;
}
async function accept(k, a, response, interpret, navigate, save) {
    if (!response || typeof response !== 'object')
        throw Error('CAPABILITY_RESPONSE_REQUIRED');
    if (response.accounting) {
        const {requests,bytes,decodedBytes=bytes,retainedBytes=0}=response.accounting;
        if([decodedBytes,retainedBytes].some(n=>!Number.isSafeInteger(n)||n<0))throw Error('INVALID_TRANSPORT_ACCOUNTING');
        if(!Number.isSafeInteger(requests)||requests<0||!Number.isSafeInteger(bytes)||bytes<0) throw Error('INVALID_TRANSPORT_ACCOUNTING');
        k.usage.networkRequests=(k.usage.networkRequests??0)+requests;
        // Include robots, redirects, geo probes and failed responses, not only evidence.
        k.usage.bytes+=bytes;
        k.usage.decodedBytes=(k.usage.decodedBytes??0)+decodedBytes;
        k.usage.retainedBytes=(k.usage.retainedBytes??0)+retainedBytes;
    }
    if(response.acquisitionTiming){
        const elapsed=response.acquisitionTiming.elapsedMs;
        if(!Number.isSafeInteger(elapsed)||elapsed<0)throw Error('INVALID_TRANSPORT_ACCOUNTING');
        k.usage.acquisitionMs=(k.usage.acquisitionMs??0)+elapsed;
    }
    if(response.requestLedger) {
        if(!Array.isArray(response.requestLedger)||response.requestLedger.length!==response.accounting?.requests)throw Error('INVALID_REQUEST_LEDGER');
        k.attempts.at(-1).requestLedger=structuredClone(response.requestLedger);
        k.attempts.at(-1).acquisitionTiming=structuredClone(response.acquisitionTiming);
        k.attempts.at(-1).acquisitionCapacity=structuredClone(response.acquisitionCapacity);
        k.attempts.at(-1).externalHttpRequests=response.externalHttpRequests;
        k.attempts.at(-1).acquisitionOperations=structuredClone(response.acquisitionOperations??[]);
        if(response.failure)k.attempts.at(-1).failure=structuredClone(response.failure);
        k.trace.push({event:'ACQUISITION_LEDGER',action:a.id,requests:structuredClone(response.requestLedger),timing:structuredClone(response.acquisitionTiming),operations:structuredClone(response.acquisitionOperations??[]),capacity:response.acquisitionCapacity,externalHttpRequests:response.externalHttpRequests,...(response.failure?{failure:structuredClone(response.failure)}:{})});
    }
    if(k.usage.bytes>k.bounds.bytes||(k.usage.decodedBytes??0)>(k.bounds.decodedBytes??acquisition.objectiveDecodedBytes)||(k.usage.acquisitionMs??0)>(k.bounds.acquisitionMs??acquisition.objectiveAcquisitionMs)||k.usage.networkRequests>(k.bounds.networkRequests??96)) {
        markLimit(k,'transportCapacity'); throw Error('TRANSPORT_CAPACITY_BOUND');
    }
    // Failed acquisition cannot erase an intact robots source received earlier.
    // Policy artifacts are checkpointed outside the truth observation collection.
    for(const doc of (response.navigationDocuments??[]).slice(0,9)) {
        if(doc.kind!=='ROBOTS'||doc.completeness!=='COMPLETE'||typeof doc.body!=='string'||Buffer.byteLength(doc.body)>acquisition.robotsBytes||doc.sha256!==digest(doc.body))continue;
        k.policyArtifacts??=[];
        const resource={...doc,id:'robots-'+digest([a.context,doc.url,doc.sha256]),context:structuredClone(a.context),action:a.id};
        const prior=k.policyArtifacts.find(r=>r.id===resource.id);
        if(!prior)k.policyArtifacts.push({...resource,actions:[a.id]});else if(!prior.actions?.includes(a.id))prior.actions=[...(prior.actions??[prior.action]),a.id].slice(-8);
    }
    if(response.failure) {
        k.attempts.at(-1).failure??={kind:response.failure.kind,code:response.failure.code};
        if(response.failure.kind==='CAPACITY')markLimit(k,resourceCapacityFailure(response.failure)?'acquisitionResourceCapacity':'transportCapacity');
        throw Error(response.failure.code);
    }
    if (a.kind === 'DISCOVER') {
        // Results are grounding for navigation only. Their snippets never enter truth.
        const bytes = Buffer.byteLength(JSON.stringify(response));
        if (!response.accounting && bytes > k.bounds.bytes - k.usage.bytes)
            throw Error('CAPABILITY_BYTE_CONTRACT_VIOLATION');
        if(!response.accounting) k.usage.bytes += bytes;
        const results = Array.isArray(response.results) ? response.results : [], limit = k.bounds.candidateDestinations;
        if (results.length > limit)
            markLimit(k, 'candidateDestinations');
        k.researchResults=[...(k.researchResults??[]),...results.slice(0,64).map(r=>({url:normalizeUrl(r.url),title:typeof r.title==='string'?r.title.slice(0,240):'',snippet:typeof r.content==='string'?r.content.slice(0,512):'',language:typeof r.language==='string'?r.language.slice(0,32):null,action:a.id,truthAuthority:'NONE'}))].slice(-64);
        const outcomes = results.slice(0, limit).map((r, i) => ({ url: r.url, result: addDestination(k, { url: r.url, depth: 0, needs: a.needs.map(id => id.split(':').at(-1)), grounding: { kind: 'DISCOVERY_RESULT', action: a.id, index: i },discovery:{kind:'SEARCH_RESULT',label:typeof r.title==='string'?r.title.slice(0,240):'',score:normalizeUrl(r.url)?rankCandidate({url:r.url,label:typeof r.title==='string'?r.title.slice(0,240):'',kind:'SEARCH_RESULT',context:'SEARCH'},k.objective):0,family:a.family??a.id,signals:{discoveryOnly:true,origin:'SEARCH_DESTINATION'}} }) }));
        return { kind: 'DISCOVERY', results: results.length, destinations: outcomes };
    }
    if (canonical(response.context) !== canonical(a.context))
        throw Error('OBSERVATION_CONTEXT_MISMATCH');
    const url = normalizeUrl(response.url ?? a.url);
    const candidate=candidateRouted(k.objective,a.url);
    if (!url || !researchRouted(k.objective,url) || candidate && new URL(url).hostname!==new URL(a.url).hostname || !candidate && (!materializeAuthority(k,url) || !providerBound(k.objective,url)))
        throw Error('PROVIDER_REDIRECT_NOT_AUTHORIZED');
    if (response.outcome === 'POLICY_BLOCKED') {
        const scope = response.policyScope === 'ORIGIN' ? 'ORIGIN' : 'URL';
        k.policyBlocks.push({ scope, value: scope === 'ORIGIN' ? new URL(url).origin : url, observation: a.id });
    }
    if(response.outcome==='OK'&&response.completeness!==undefined&&response.completeness!=='COMPLETE')throw Error('INCOMPLETE_RESPONSE');
    const body = typeof response.body === 'string' ? response.body : '', bytes = Buffer.byteLength(body), remaining = k.bounds.bytes - k.usage.bytes;
    if(response.accounting && bytes>(response.accounting.retainedBytes??response.accounting.decodedBytes??response.accounting.bytes)) throw Error('INVALID_TRANSPORT_ACCOUNTING');
    // The capability contract must enforce maxBytes while receiving data. Never
    // interpret or retain an over-bound response, even from a faulty offline adapter.
    if (!response.accounting && bytes > remaining)
        throw Error('CAPABILITY_BYTE_CONTRACT_VIOLATION');
    if(!response.accounting) k.usage.bytes += bytes;
    const o = { id: a.id, kind: candidate?'CANDIDATE':'PROVIDER', ...(candidate?{authority:'UNREVIEWED_CANDIDATE'}:{}), url, context: structuredClone(a.context), outcome: response.outcome ?? 'ERROR', truncated: response.truncated === true, body, bytes, sha256: digest(body), action: a.id, candidates: [],
        ...(response.format==='WEB'?{format:'WEB',contentType:response.contentType,requestedUrl:a.url,httpStatus:response.httpStatus,acquiredAt:response.acquiredAt,transport:response.transport,access:response.access,completeness:response.completeness??(response.truncated?'INCOMPLETE':'COMPLETE'),responseMetadata:response.responseMetadata,redirects:response.redirects,acquisitionTiming:response.acquisitionTiming}: {}) };
    if(k.destinations.find(d=>d.url===a.url)?.discovery?.resource==='SITEMAP') {
        k.navigationResources??=[];k.navigationResources.push(o);
        const plan=extractSitemap(o,k.objective,researchTruth(k,evaluate(k)).needs.map(n=>n.proposition));
        const navigation=admitNavigation(k,o,a,plan,'SITEMAP_ENTRY');
        return {kind:'NAVIGATION_RESOURCE',id:o.id,url,sha256:o.sha256,bytes,navigation};
    }
    k.observations.push(o);
    if (o.outcome === 'OK' && !o.truncated && (o.completeness===undefined||o.completeness==='COMPLETE')) {
        o.candidates=o.format==='WEB'?admitWebProjection(o,k.objective):interpretStructured(o,k.objective);
        if(interpret.semanticUnits) {
            await understandUnits(k,o,interpret,save);
        } else {
        const understanding=interpret.semanticAdapter?.role==='EVIDENCE_UNDERSTANDING';
        const stage=understanding?'UNDERSTANDING':'TRANSLATION';
        const modelNeeded=!!interpret.semanticAdapter&&(!interpret.requiresModel||interpret.requiresModel(o,k.objective));
        let candidates;
        if(modelNeeded&&k.usage.modelCalls>=k.bounds.modelCalls) {
            markLimit(k,'modelCalls');
            o.interpretation={kind:stage+'_UNAVAILABLE',code:stage+'_MODEL_CALL_BOUND'};
        } else {
            if(modelNeeded) {
                k.usage.modelCalls++;
                o.interpretation={kind:stage+'_PENDING',adapter:interpret.semanticAdapter};
                k.trace.push({event:stage+'_CALL_RESERVED',observation:o.id,sha256:o.sha256,adapter:interpret.semanticAdapter,modelCalls:k.usage.modelCalls,bound:k.bounds.modelCalls});
                await persist(k,save);
            }
            try {candidates=await interpret(structuredClone(o),structuredClone(k.objective));}
            catch(error) {
                if(!interpret.requiresModel)throw error;
                o.interpretation={kind:stage+'_FAILED',...(understanding?understandingError(error):translationError(error))};
            }
        }
        if(candidates?.kind==='NATIVE'&&!modelNeeded) {
            // The already revalidated original/translated projection remains usable.
        } else if(candidates?.kind==='EVIDENCE') {
            const projection=projectEvidence(o,k.objective,candidates.envelope);
            if(projection.error)o.interpretation={kind:'UNDERSTANDING_REJECTED',code:projection.error};
            else {
                o.evidence={envelope:candidates.envelope,adapter:interpret.semanticAdapter};
                o.candidates=admitWebProjection(o,k.objective);
                o.interpretation={kind:'EVIDENCE',adapter:interpret.semanticAdapter,accepted:projection.accepted,rejected:projection.rejected};
                k.trace.push({event:'EVIDENCE_UNDERSTANDING',observation:o.id,sha256:o.sha256,evidence:o.evidence,interpretation:o.interpretation,sourceSupport:projection.bindings,candidates:o.candidates});
            }
        } else if(candidates?.kind==='TRANSLATION') {
            const translation={envelope:candidates.envelope,adapter:interpret.semanticAdapter};
            const projection=projectTranslation(o,k.objective,translation.envelope);
            if(projection.error)o.interpretation={kind:'TRANSLATION_REJECTED',code:projection.error};
            else {
                o.translation=translation;o.candidates=admitWebProjection(o,k.objective);
                o.interpretation={kind:'TRANSLATION',adapter:interpret.semanticAdapter,limited:projection.limited};
                k.trace.push({event:'TRANSLATION',observation:o.id,sha256:o.sha256,translation,sourceSupport:projection.bindings,candidates:o.candidates});
            }
        } else if(candidates!==undefined) {
            if(!Array.isArray(candidates)||modelNeeded)throw Error('INVALID_INTERPRETER_RESULT');
            const source=readSource(o,k.objective),maximum=1+(source?.offers?.length??0);
            const selected=candidates.slice(0,maximum).map(c=>({kind:c.kind,pointer:c.pointer}));
            if(o.format==='WEB'){
                const projection=projectObservation(o,k.objective);
                const native=admittedProjectionCandidates(projection).filter(c=>projection.bindings[c.pointer]?.nativeStructured===true);
                o.candidates=admittedProjectionCandidates({...projection,candidates:[...selected,...native]}).filter((c,i,all)=>all.findIndex(v=>v.kind===c.kind&&v.pointer===c.pointer)===i);
            }else o.candidates=selected;
        }
        if(/(?:MATERIAL|RESPONSE)_BOUND$/.test(o.interpretation?.code??''))markLimit(k,'interpretationCapacity');
        if(o.interpretation?.kind?.startsWith(stage+'_'))k.trace.push({event:stage+'_UNAVAILABLE',observation:o.id,...o.interpretation});
        }

    }
    const web=o.format==='WEB'?projectWebSource(o,k.objective):null;
    if(web?.limited&&!o.translation) markLimit(k,'interpretationCapacity');
    if(web&&!o.interpretation) o.interpretation={ambiguities:web.ambiguities,limited:web.limited};
    const current=researchTruth(k,evaluate(k)).needs.map(n=>n.proposition);
    if(current.length&&o.outcome==='OK'&&!o.truncated)for(const doc of (response.navigationDocuments??[]).slice(0,9)) {
        if(doc.kind!=='ROBOTS'||!(doc.declarations??[]).length||doc.completeness!=='COMPLETE'||typeof doc.body!=='string'||Buffer.byteLength(doc.body)>acquisition.robotsBytes||doc.sha256!==digest(doc.body))continue;
        const resource={...doc,id:'robots-'+digest([a.context,doc.url,doc.sha256]),context:o.context};
        // Auxiliary policy/navigation source is retained separately and never evaluated as price evidence.
        if(!k.navigationResources.some(r=>r.id===resource.id))k.navigationResources.push(resource);
        for(const ref of (doc.declarations??[]).slice(0,16)) {
            if(!Number.isSafeInteger(ref.start)||!Number.isSafeInteger(ref.end)||ref.start<0||ref.end>doc.body.length||ref.start>=ref.end)continue;
            const slice=doc.body.slice(ref.start,ref.end),value=slice.match(/^\s*sitemap\s*:\s*([^#\r\n]+)/i)?.[1]?.trim();
            if(value!==ref.url)continue;
            const target=normalizeUrl(ref.url,doc.url);if(!target)continue;
            addDestination(k,{url:target,depth:(k.destinations.find(d=>d.url===a.url)?.depth??0)+1,needs:current,grounding:{kind:'ROBOTS_SITEMAP',observation:resource.id,source:{start:ref.start,end:ref.end,sha256:digest(slice),bodySha256:doc.sha256}},discovery:{resource:'SITEMAP',score:2,kind:'ROBOTS_SITEMAP'}});
        }
    }
    const navigation=[];
    if(current.length&&o.outcome==='OK'&&!o.truncated) {
        if(web) {
            const plan=extractNavigation(o,k.objective,current);
            o.navigation=plan.candidates.map((c,index)=>({...c,index}));
            const automaticAdvice=!navigate&&interpret.researchAdvisor&&(!k.researchAdviceUnavailable||!k.researchAdviceUnavailable.disabled&&k.researchAdviceUnavailable.until<=Date.now())&&(o.navigation.length>=8||o.navigation.filter(c=>c.kind==='PROVIDER_STATE').length>=2);
            const advisor=navigate??(automaticAdvice?interpret.researchAdvisor:null);
            if(advisor&&o.navigation.length&&(navigate||k.usage.modelCalls<k.bounds.modelCalls-1&&(k.researchAdvisoryCalls??0)<4)) {
                // Advisory bounded source-owned references. No new hrefs or truth fields are honored.
                try {
                    const rows=diverseCandidates(o.navigation,discoveryCapacity.advisoryCandidates);
                    if(!navigate){k.usage.modelCalls++;k.researchAdvisoryCalls=(k.researchAdvisoryCalls??0)+1;await persist(k,save);}
                    const advice=await boundedNavigationAdvice(advisor,rows,evaluate(k).needs,automaticAdvice?advisor.deadlineMs:discoveryCapacity.advisoryMs);
                    if(!Array.isArray(advice))throw Error('INVALID_NAVIGATION_RESULT');
                    const promoted=[];
                    for(const p of advice.slice(0,discoveryCapacity.advisoryCandidates)) {
                        if(!p||typeof p!=='object')continue;
                        const c=rows.find(c=>p.candidateId?c.id===p.candidateId:c.index===p.index);
                        if(!c||!Array.isArray(p.needs)||!p.needs.some(n=>current.includes(n)))continue;
                        // The index resolves into the complete candidate plan, never an invented URL.
                        const target=plan.candidates[c.index];
                        if(['PRICING','PRODUCT','SUPPORT','ACCOUNT','CONTENT','LOCALE','STATE','UNKNOWN'].includes(p.role))target.research={role:p.role,origin:'BOUNDED_SOURCE_ID_ADVICE',source:c.source,stateIntent:['MONTHLY_PAYMENT','NON_MONTHLY_PAYMENT','UNKNOWN'].includes(p.stateIntent)?p.stateIntent:'UNKNOWN',uncertain:true,truthAuthority:'NONE'};
                        target.score=Math.min(20,target.score+4);promoted.push(target.id);
                    }
                    plan.candidates.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
                    k.trace.push({event:'NAVIGATION_ADVICE',observation:o.id,exposedIds:rows.map(c=>c.id),promoted,advice:plan.candidates.filter(c=>c.research).map(c=>({id:c.id,...c.research})),modelCalls:k.usage.modelCalls,request:advice.diagnostics??null,accepted:'SOURCE_IDS_ONLY',truthAuthority:'NONE'});
                } catch(error) {const status=Number.isInteger(error?.status)?error.status:null;
                    k.trace.push({event:'NAVIGATION_ADVICE_UNAVAILABLE',observation:o.id,code:/^RESEARCH_[A-Z_]+$/.test(error?.message??'')?error.message:'ADVISORY_FAILED_NATIVE_FRONTIER_PRESERVED',status,purpose:'RESEARCH_ONLY',modelCalls:k.usage.modelCalls,requestBytes:error?.v3Diagnostics?.requestBytes??null,diagnostics:error?.v3Diagnostics??null});
                    if(!navigate){
                        k.researchAdviceUnavailable={status,disabled:status===400||/^RESEARCH_RESPONSE_/.test(error.message),until:Date.now()+30000,bodySha256:o.sha256,purpose:'RESEARCH_ADVICE'};
                    }
                }
            }
            navigation.push(...admitNavigation(k,o,a,plan,'PROVIDER_LINK'));
        } else {
            // Existing source-bound structured fixtures keep their explicit needs contract.
            const links=readSource(o)?.links??[];
            const depth=(k.destinations.find(d=>d.url===a.url)?.depth??0)+1;
            for(const [index,l]of links.slice(0,k.bounds.candidateDestinations).entries())navigation.push({url:l.url,result:addDestination(k,{url:normalizeUrl(l.url,url),depth,needs:l.needs,grounding:{kind:'PROVIDER_LINK',observation:o.id,pointer:'/links/'+index}})});
            if(links.length>k.bounds.candidateDestinations)markLimit(k,'candidateDestinations');
        }
    }
    if(candidate){
        const binding=reviewCandidateAuthority(o,k.objective);
        if(binding&&promoteCandidateHost(k,binding))k.trace.push({event:'AUTONOMOUS_PROVIDER_AUTHORITY',binding:structuredClone(binding)});
    }
    return { kind: o.kind, id: o.id, url, context: o.context, outcome: o.outcome, sha256: o.sha256, bytes, navigation };
}
export async function runResearch({ knowledge, objective, permissions, bounds, capabilities = {}, reasoner, interpret = interpretStructured, interpretVisual, navigate, save } = {}) {
    const k = knowledge ? structuredClone(knowledge) : createKnowledge({ objective, permissions, bounds });
    capabilities={...capabilities,LOCAL:async()=>({})};
    if (k.version !== 1)
        throw Error('UNSUPPORTED_KNOWLEDGE_VERSION');
    k.usage.sitemapAcquisitions??=0;
    k.navigationResources??=[];
    k.usage.modelCalls??=0;
    k.usage.renderedActions??=0;
    k.bounds.modelCalls??=12;
    if (k.stop)
        return k;
    if (!k.trace.length)
        k.trace.push({ event: 'INITIAL', objective: k.objective, truth: evaluate(k),semanticAdapter:interpret.semanticAdapter??{mode:'LEGACY_STATIC'} });
    if (k.pending) {
        stop(k, 'RECOVERY_REQUIRED', { action: k.pending.id, why: 'Dispatch outcome is unknown; automatic repetition is prohibited' });
        await persist(k, save);
        return k;
    }
    for (;;) {
        const finalTruth=evaluate(k);
        refreshCatalog(k,finalTruth);
        const initial = researchTruth(k,finalTruth);
        // Empty search conversion is not exhaustion while routed roots remain uninspected.
        if(!k.destinations.length&&k.attempts.some(a=>a.action.kind==='DISCOVER'&&a.status==='COMPLETED')&&(k.permissions.DIRECT||k.permissions.DECODO))for(const host of [...k.objective.providerHosts,...(k.objective.candidateHosts??[])]){
            const candidate=candidateRouted(k.objective,'https://'+host+'/');
            const result=addDestination(k,{url:'https://'+host+'/',depth:0,needs:initial.needs.map(n=>n.proposition),grounding:{kind:candidate?'CANDIDATE_ROOT':'PROVIDER_ROOT',host}});
            k.trace.push({event:'RESEARCH_BOOTSTRAP',host,result,reason:candidate?'SEARCH_CONVERSION_EMPTY_CANDIDATE_ROOT_UNINSPECTED':'SEARCH_CONVERSION_EMPTY_REVIEWED_ROOT_UNINSPECTED'});
        }
        k.gapState=diagnoseGaps(k,finalTruth);
        k.workingModel=buildWorkingModel(k,initial);
        if(k.objective.kind!=='PRICE'&&initial.ineligibleMarkets.length>0&&initial.ineligibleMarkets.length===k.objective.markets.length){stop(k,'MONTHLY_SUBSCRIPTION_NOT_OFFERED',{markets:initial.ineligibleMarkets});await persist(k,save);return k;}
        if (initial.established||k.catalog?.state==='CATALOG_EXHAUSTED'&&!k.catalog.pending) {
            stop(k, 'OBJECTIVE_ESTABLISHED');
            await persist(k, save);
            return k;
        }
        if (k.usage.plannerCalls >= k.bounds.plannerCalls) {
            stop(k, 'CAPACITY_BOUND_REACHED', { bounds: ['plannerCalls'] });
            await persist(k, save);
            return k;
        }
        k.usage.plannerCalls++;
        let offered = availableActions(k, capabilities), decision = {};
        const selectorSnapshot={cooldownEligible:k.semanticUnavailable?.status===429?Date.now()>=k.semanticUnavailable.until:null,attempts:k.attempts.map(a=>({id:a.id,status:a.status})),usage:structuredClone(k.usage),semanticUnavailable:structuredClone(k.semanticUnavailable??null),actions:structuredClone(offered.actions)};
        selectorSnapshot.sha256=digest(selectorSnapshot);
        if (reasoner) {
            // A reasoning component receives a copy, and can propose/rank only. It cannot
            // mutate evidence, counters, permissions, or established propositions.
            try {
                decision = await reasoner(structuredClone({ workingModel:k.workingModel,objective: k.objective, truth: initial, destinations: k.destinations, observations: k.observations.map(({ body, candidates, renderedArtifacts, renderedOverviews, visualEvidence, domSnapshot, ...o }) => o), actions: offered.actions, attempts: k.attempts, permissions:k.permissions, bounds:k.bounds, usage:k.usage }));
            }
            catch {
                stop(k, 'REASONER_FAILED');
                await persist(k, save);
                return k;
            }
            if (!decision || typeof decision !== 'object')
                decision = {};
            if ((decision.proposals?.length ?? 0) > k.bounds.candidateDestinations)
                markLimit(k, 'candidateDestinations');
            if(decision.proposals?.length)offered = availableActions(k, capabilities, decision.proposals.slice(0, k.bounds.candidateDestinations));
        }
        const returnedRanking=Array.isArray(decision.researchRanking)&&decision.researchRanking.length===offered.actions.length&&decision.researchRanking.every(r=>offered.actions.some(a=>a.id===r.actionId))?decision.researchRanking:null;
        const ranked=returnedRanking??rankResearchActions({objective:k.objective,truth:initial,workingModel:k.workingModel,destinations:k.destinations,observations:k.observations,attempts:k.attempts,actions:offered.actions});
        selectorSnapshot.executedActions=structuredClone(offered.actions);selectorSnapshot.rankingOrigin=returnedRanking?'REASONER_RETURNED':'ENGINE_FALLBACK';
        const selected = offered.actions.find(a => a.id === decision.actionId) ?? offered.actions.find(a=>a.id===ranked[0]?.actionId);
        const audit = { needs: initial.needs.map(n => n.id), evaluated: offered.evaluated.map(r => ({ id: r.action.id ?? null, kind: r.action.kind, url: r.action.url ?? null, context: r.action.context ?? null, value:r.action.value, query:r.action.query??null,targetIds:r.action.targetIds??[],gapIds:r.action.gapIds??[],units:r.action.units??null, family:r.action.family??null, needs: r.action.needs, reason: r.reason, bounds: r.bounds ?? [] })), selected: selected?.id ?? null, reason: selected ? (decision.actionId === selected.id && typeof decision.reason === 'string' ? decision.reason : selected.reason) : 'No admissible useful action in the current grounded knowledge' };
        k.decisions.push(audit);
        k.trace.push({event:'GAP_DIAGNOSIS',...structuredClone(k.gapState)});
        k.trace.push({event:'RESEARCH_DECISION',...workingDecision(k.workingModel,ranked,selected?.id??null,{usage:k.usage,bounds:k.bounds},selectorSnapshot)});
        if (!selected) {
            k.gapStop=gapTermination(k,offered.evaluated);
            const hit = [...new Set([...k.limitsHit, ...offered.evaluated.flatMap(r => r.bounds ?? [])])];
            stop(k, hit.length ? 'CAPACITY_BOUND_REACHED' : finalTruth.established?'OBJECTIVE_ESTABLISHED':finalTruth.ineligibleMarkets.length===k.objective.markets.length&&k.objective.kind==='PRICE'?'MONTHLY_SUBSCRIPTION_NOT_OFFERED':'SEMANTIC_EXHAUSTION', { bounds: hit, decision: k.decisions.length - 1, scope: 'CURRENT_GROUNDED_KNOWLEDGE_AND_PERMISSIONS', researchStop:hit.length?{kind:'CAPACITY_EXHAUSTED',bounds:hit}:exhaustionDiagnosis(k) });
            await persist(k, save);
            return k;
        }
        const a = selected;
        const targetBefore=structuredClone(k.gapState),priorObservations=new Set(k.observations.map(o=>o.id)),priorTruth=finalTruth;
        k.usage.actions++;
        if (a.kind === 'DISCOVER')
            k.usage.searches++;
        else if(a.kind==='INSPECT'){k.usage.inspections=(k.usage.inspections??0)+1;}
        else if(a.kind==='RENDER'){k.usage.renderedActions++;}
        else {
            k.usage.acquisitions++;
            if(k.destinations.find(d=>d.url===a.url)?.discovery?.resource==='SITEMAP')k.usage.sitemapAcquisitions++;
            if (a.context.transport === 'DECODO')
                k.usage.countryAcquisitions++;
        }
        k.pending = a;
        k.attempts.push({ id: a.id, action: a, status: 'RESERVED' });
        k.trace.push({ event: 'ACTION_SELECTED', action: a, reason: audit.reason });
        await persist(k, save);
        try {
            let observation;
            if(a.kind==='INSPECT'&&a.inspection==='GAP_SOURCE'){const retained=k.observations.find(o=>o.id===a.observation);const review=inspectGapSource(retained);k.gapReviews??=[];k.gapReviews.push({action:a.id,...review});k.trace.push({event:'GAP_SOURCE_INSPECTION',action:a.id,gapIds:a.gapIds,...review});observation={kind:'GAP_SOURCE_INSPECTION',id:retained.id,url:retained.url,sha256:retained.sha256};}
            else if(a.kind==='INSPECT'){const retained=k.observations.find(o=>o.id===a.observation);if(!a.units){retained.reinspectionCount=(retained.reinspectionCount??0)+1;k.semanticUnavailable=null;}await understandUnits(k,retained,interpret,save,!a.units,a.units??null);observation={kind:'RETAINED_INSPECTION',id:retained.id,url:retained.url,sha256:retained.sha256};}
            else if(a.kind==='RENDER'){
                const parent=k.observations.find(o=>o.id===a.observation);
                observation={kind:'RENDERED_INSPECTION',parentObservation:parent.id,url:parent.url,status:'UNAVAILABLE'};
                try {
                    let retained,produced,focus=null;
                    if(a.mode==='CLARIFY'){
                        retained=parent;
                        const artifact=retained.renderedArtifacts?.find(row=>row.id===a.focus.sourceRenderId),evidence=retained.visualEvidence?.findLast(row=>row.renderId===artifact?.id),region=evidence?.regions?.find(row=>row.id===a.focus.regionId),overview=retained.renderedOverviews?.find(row=>row.renderId===artifact?.id);
                        if(!artifact||!region||!overview)throw Error('RENDERED_TARGET_REGION_INVALID');
                        focus=createTargetedVisualRegion(artifact,region.bboxPx);
                        produced={artifact,overview,dom:retained.domSnapshot??[]};
                        observation={...observation,id:retained.id,sha256:retained.sha256,status:'CLARIFICATION',renderId:artifact.id,focusSha256:focus.sha256,focusRegionId:region.id};
                        k.trace.push({event:'TARGETED_VISUAL_CLARIFICATION',action:a.id,observation:retained.id,renderId:artifact.id,regionId:region.id,reason:a.focus.reason,focusSha256:focus.sha256,bboxPx:focus.bboxPx,truthAuthority:'NONE'});
                    } else {
                        const response=await capabilities.RENDERED(structuredClone(a),{parent:structuredClone(parent),objective:structuredClone(k.objective),maxRenderMs:60000});
                        if(response?.failure)throw Error('RENDERED_ACQUISITION_UNAVAILABLE');
                        retained=a.mode==='STATE'?parent:browserPageObservation(a,parent,k.objective,response.page);
                        if(a.mode==='STATE'&&(response.page?.body!==parent.body||response.page?.url!==parent.url||response.page?.transport?.verification!==parent.transport?.verification))throw Error('RENDERED_STATE_PARENT_MISMATCH');
                        produced=retainRenderedObservation(retained,response,{overviewWidth:a.overviewWidth});
                        retained.renderedArtifacts??=[];retained.renderedArtifacts.push(produced.artifact);
                        retained.renderedOverviews??=[];retained.renderedOverviews.push({renderId:produced.artifact.id,...produced.overview});
                        retained.renderedControlRegions??=[];retained.renderedControlRegions.push(produced.controlRegions);
                        retained.domSnapshot=produced.dom;
                        retained.candidates=admitWebProjection(retained,k.objective);
                        if(a.mode!=='STATE')k.observations.push(retained);
                        observation={...observation,id:retained.id,url:retained.url,sha256:retained.sha256,status:'RENDERED',renderId:produced.artifact.id,overviewSha256:produced.overview.sha256,domElements:produced.dom.length};
                        k.trace.push({event:'RENDERED_ARTIFACT_RETAINED',action:a.id,observation:retained.id,renderId:produced.artifact.id,imageSha256:produced.artifact.image.sha256,widthPx:produced.artifact.image.widthPx,heightPx:produced.artifact.image.heightPx,overviewSha256:produced.overview.sha256,overviewWidth:produced.overview.widthPx,overviewHeight:produced.overview.heightPx,domElements:produced.dom.length,truthAuthority:'NONE'});
                    }
                    await persist(k,save);
                    if(typeof interpretVisual==='function'){
                        const contract=interpretVisual.contract??{model:'UNKNOWN',promptHash:'UNKNOWN',schemaRevision:'UNKNOWN'},fingerprint=digest([visualFingerprint(produced.artifact,produced.overview,contract,produced.dom),focus?.sha256??null]);
                        k.visualFingerprints??=[];
                        if(k.visualFingerprints.includes(fingerprint))k.trace.push({event:'VISUAL_REUSE',action:a.id,fingerprint,reason:'IDENTICAL_RENDERED_ARTIFACT_ALREADY_ANALYZED',truthAuthority:'NONE'});
                        else if(k.visualAttemptFingerprints?.includes(fingerprint))k.trace.push({event:'VISUAL_DUPLICATE_ATTEMPT_SKIPPED',action:a.id,fingerprint,reason:'IDENTICAL_RENDERED_ARTIFACT_ALREADY_ATTEMPTED',truthAuthority:'NONE'});
                        else {
                            k.visualAttemptFingerprints??=[];k.visualAttemptFingerprints.push(fingerprint);k.usage.modelCalls++;
                            k.trace.push({event:'VISUAL_MODEL_CALL_RESERVED',action:a.id,modelCalls:k.usage.modelCalls,fingerprint,truthAuthority:'NONE'});
                            await persist(k,save);
                            try {
                                const visual=await interpretVisual({observation:structuredClone(retained),artifact:structuredClone(produced.artifact),overview:structuredClone(produced.overview),dom:structuredClone(produced.dom),objective:structuredClone(k.objective),targets:structuredClone(a.targetIds),focus:focus?structuredClone(focus):null});
                                k.visualUsage??=[];k.visualUsage.push({action:a.id,renderId:produced.artifact.id,model:visual?.model??contract.model,latencyMs:visual?.latencyMs??null,usage:visual?.usage??null,status:visual?.status??'UNKNOWN',modelOfferingCount:Array.isArray(visual?.observations?.offerings)?visual.observations.offerings.length:null,compiledOfferingCount:Array.isArray(visual?.envelope?.offers)?visual.envelope.offers.length:null,unresolvedCount:Array.isArray(visual?.envelope?.unresolved)?visual.envelope.unresolved.length:null});
                                if(visual?.envelope){const admission=admitRenderedInterpretation(retained,k.objective,visual.envelope);k.visualFingerprints.push(fingerprint);observation={...observation,visualStatus:admission.reason,accepted:admission.accepted.length,rejected:admission.rejected.length,errors:admission.errors};}
                                else observation={...observation,visualStatus:'UNAVAILABLE'};
                                k.trace.push({event:'VISUAL_INTERPRETATION',action:a.id,status:observation.visualStatus,usage:k.visualUsage.at(-1),accepted:observation.accepted??0,rejected:observation.rejected??0,truthAuthority:'NONE'});
                            } catch(error) {observation={...observation,visualStatus:'UNAVAILABLE'};if(error?.visualUsage){k.visualUsage??=[];k.visualUsage.push({action:a.id,renderId:produced.artifact.id,...error.visualUsage});}k.trace.push({event:'VISUAL_INTERPRETATION_UNAVAILABLE',action:a.id,code:/^[A-Z][A-Z0-9_]{0,80}$/.test(error?.message??'')?error.message:'VISUAL_MODEL_UNAVAILABLE',usage:k.visualUsage?.at(-1)??null,truthAuthority:'NONE'});}
                        }
                    }
                    if(a.mode!=='CLARIFY'&&retainControlSourceEvidence(retained,k.objective,produced.artifact))k.trace.push({event:'RENDERED_CONTROL_SOURCE_RETAINED',action:a.id,observation:retained.id,renderId:produced.artifact.id,controlCount:produced.controlRegions.regions.length,truthAuthority:'NONE'});
                } catch(error) {observation={...observation,status:'UNAVAILABLE'};k.trace.push({event:'RENDERED_ACQUISITION_UNAVAILABLE',action:a.id,code:/^[A-Z][A-Z0-9_]{0,80}$/.test(error?.message??'')?error.message:'RENDERED_CAPABILITY_UNAVAILABLE',truthAuthority:'NONE'});}
            }
            else {const response = await capabilities[route(a)](structuredClone(a), { maxBytes: k.bounds.bytes - k.usage.bytes, maxDecodedBytes:(k.bounds.decodedBytes??acquisition.objectiveDecodedBytes)-(k.usage.decodedBytes??0), maxAcquisitionMs:(k.bounds.acquisitionMs??acquisition.objectiveAcquisitionMs)-(k.usage.acquisitionMs??0), maxResults: k.bounds.candidateDestinations, maxRequests:(k.bounds.networkRequests??96)-(k.usage.networkRequests??0) });
            observation = await accept(k, a, response, interpret, navigate, save);}
            const after = evaluate(k);
            refreshCatalog(k,after);
            const nextGaps=diagnoseGaps(k,after),priorIds=new Set(k.gapState.gaps.map(g=>g.id)),nextIds=new Set(nextGaps.gaps.map(g=>g.id));
            k.trace.push({event:'GAP_PROGRESS',action:a.id,noLongerDiagnosed:[...priorIds].filter(id=>!nextIds.has(id)),newlyDiagnosed:[...nextIds].filter(id=>!priorIds.has(id)),remaining:nextGaps.gaps.map(g=>g.id),meaning:'DIAGNOSIS_CHANGE_NOT_TRUTH',truthAuthority:'NONE'});k.gapState=nextGaps;
            k.trace.push({event:'EVIDENCE_TARGET_OUTCOME',...targetOutcome(targetBefore,nextGaps,k.observations,priorObservations,priorTruth,after,a,ranked.find(r=>r.actionId===a.id))});
            k.attempts.at(-1).status = 'COMPLETED';
            k.pending = null;
            k.trace.push({ event: 'OBSERVATION', observation, changes: changes(initial, after),evaluations:after,usage:structuredClone(k.usage),bounds:k.bounds,remainingNeeds: after.needs.map(n => n.id) });
        }
        catch (error) {
            const code=/^[A-Z][A-Z0-9_]{0,80}$/.test(error?.message??'')?error.message:'CAPABILITY_INTERNAL_ERROR';
            k.attempts.at(-1).status = 'FAILED';
            k.pending = null;
            if(interpret.semanticAdapter)k.trace.push({event:'SEMANTIC_OR_ACQUISITION_FAILED',adapter:interpret.semanticAdapter,modelCalls:k.usage.modelCalls});
            k.trace.push({event:'ACTION_FAILED',action:a.id,code});
            k.trace.push({event:'EVIDENCE_TARGET_OUTCOME',action:a.id,targetIds:ranked.find(r=>r.actionId===a.id)?.targetCoverage??[],informationGain:'FAILED_ACTION',failure:code,propositionChanges:[],truthAuthority:'NONE'});
            if(/^SITEMAP_(?:UNSUPPORTED|INCOMPLETE)$/.test(code))k.attempts.at(-1).failure={kind:'NAVIGATION',code};
            const failure=k.attempts.at(-1).failure;
            const recoverable=(['ACQUISITION','DISCOVERY','NAVIGATION'].includes(failure?.kind)||resourceCapacityFailure(failure));
            const alternates=availableActions(k,capabilities).actions.filter(x=>x.kind==='DISCOVER'?a.kind!=='DISCOVER':x.id!==a.id);
            // No redispatch of the consumed observation identity. Another context is a distinct observation.
            if(recoverable&&!k.limitsHit.includes('transportCapacity')&&alternates.length) {
                k.trace.push({event:'GROUNDED_FAILURE_RECOVERY',failedAction:a.id,alternatives:alternates.map(x=>x.id)});
                await persist(k,save);continue;
            }
            stop(k, (k.limitsHit.includes('transportCapacity')||k.limitsHit.includes('modelCalls')||resourceCapacityFailure(failure))?'CAPACITY_BOUND_REACHED':'CAPABILITY_OR_INTERPRETATION_FAILED', { action: a.id, code });
            await persist(k, save);
            return k;
        }
        k.gapState=diagnoseGaps(k,evaluate(k));
        k.workingModel=buildWorkingModel(k,evaluate(k));
        await persist(k, save);
    }
}

async function understandUnits(k,o,interpret,save,reinspection=false,selectedUnitIds=null) {
    const needs=researchTruth(k,evaluate(k)).needs.map(n=>n.proposition),plan=o.semanticUnits?{candidates:o.semanticUnits,capacityHit:o.semanticPlanCapacity??false,reason:'RETAINED_UNATTEMPTED_UNITS'}:interpret.semanticPlan(o,k.objective,needs),units=plan.candidates??plan.units;
    o.semanticPlanCapacity=plan.capacityHit;
    if(plan.capacityHit)markLimit(k,'semanticUnits');
    o.semanticUnits=units;o.evidenceFragments??=[];o.semanticAttempts??=[];
    k.trace.push({event:'SEMANTIC_UNITS_SELECTED',observation:o.id,units,capacityHit:plan.capacityHit,reason:plan.reason,requestCapacitySkipped:plan.requestCapacitySkipped??[],preparedRequests:plan.preparedRequests??[]});
    // Native bounded source interpretation is independent of model budget and
    // availability. It still enters the same source-bound payment admission.
    for(const unit of units.filter(u=>(!selectedUnitIds||selectedUnitIds.includes(u.id))&&!o.semanticAttempts.some(a=>a.unit===u.id)&&!(o.nativeProcessedUnits??[]).includes(u.id))) {
        const value=interpret.nativeEvidence?.(o,k.objective,unit);
        if(!value)continue;
        const projection=projectEvidence(o,k.objective,value.envelope,unit);
        if(projection.error)continue;
        const fragment={envelope:value.envelope,unit,adapter:value.adapter};
        if(o.evidence)o.evidenceFragments.push(fragment);else o.evidence=fragment;
        o.nativeProcessedUnits??=[];o.nativeProcessedUnits.push(unit.id);
        if(value.complete)o.semanticAttempts.push({unit:unit.id,status:'COMPLETED',mode:'NATIVE',modelCalls:0});
        o.candidates=admitWebProjection(o,k.objective);
        o.interpretation={kind:'EVIDENCE',unit:unit.id,mode:'NATIVE',accepted:projection.accepted,rejected:projection.rejected};
        k.trace.push({event:'NATIVE_PAYMENT_INTERPRETATION',observation:o.id,sha256:o.sha256,unit:unit.id,evidence:fragment,interpretation:o.interpretation,sourceSupport:projection.bindings});
        await persist(k,save);
    }
    for(const unit of units.filter(u=>(!selectedUnitIds||selectedUnitIds.includes(u.id))&&(!o.semanticAttempts.some(a=>a.unit===u.id)||(reinspection&&o.semanticAttempts.findLast(a=>a.unit===u.id)?.status==='FAILED'))).slice(0,semanticUnitLimits.modelCallsPerAction)) {
        if(unit.modelRequestBlocked){
            markLimit(k,'interpretationCapacity');
            o.semanticAttempts.push({unit:unit.id,status:'FAILED',mode:'MODEL_REQUEST_BLOCKED',modelCalls:0});
            k.trace.push({event:'UNDERSTANDING_REQUEST_BLOCKED',observation:o.id,unit:unit.id,reason:unit.modelRequestBlocked,nativePreserved:(o.nativeProcessedUnits??[]).includes(unit.id)});
            await persist(k,save);continue;
        }
        if(k.semanticUnavailable){
            const unavailable=k.semanticUnavailable;
            // No retry of the failed unit. A temporary rate limit can permit one
            // later attempt on genuinely new acquired material after its bounded
            // cooldown, using the original action/model budgets. No timer/wait loop.
            const recover=unavailable.status===429&&Date.now()>=unavailable.until&&unavailable.bodySha256!==o.sha256&&(k.semanticRecoveries??0)<1;
            if(recover){k.semanticRecoveries=(k.semanticRecoveries??0)+1;k.semanticUnavailable=null;k.trace.push({event:'SEMANTIC_DEPENDENCY_RECOVERY',observation:o.id,reason:'COOLDOWN_EXPIRED_NEW_SOURCE',previous:unavailable});}
            else{o.interpretation={kind:'UNDERSTANDING_UNAVAILABLE',code:'UNDERSTANDING_PROVIDER_UNAVAILABLE',cause:unavailable};break;}
        }
        const truth=evaluate(k);
        if(!reinspection&&(o.semanticAttempts??[]).some(a=>a.unit===unit.id))continue;
        if(k.objective.kind!=='PRICE'&&(truth.established||!truth.needs.some(n=>unit.needs.includes(n.proposition))))break;
        if(k.usage.modelCalls>=k.bounds.modelCalls) {markLimit(k,'modelCalls');o.interpretation={kind:'UNDERSTANDING_UNAVAILABLE',code:'UNDERSTANDING_MODEL_CALL_BOUND'};break;}
        k.usage.modelCalls++;
        const attempt={unit:unit.id,status:'RESERVED',modelCalls:k.usage.modelCalls};o.semanticAttempts.push(attempt);
        o.interpretation={kind:'UNDERSTANDING_PENDING',unit:unit.id,adapter:interpret.semanticAdapter};
        k.trace.push({event:'UNDERSTANDING_CALL_RESERVED',observation:o.id,sha256:o.sha256,unit:unit.id,adapter:interpret.semanticAdapter,modelCalls:k.usage.modelCalls,bound:k.bounds.modelCalls});
        await persist(k,save);
        try {
            const value=await interpret(structuredClone(o),structuredClone(k.objective),structuredClone(unit));
            if(value?.kind!=='EVIDENCE'||value.unit?.id!==unit.id)throw Error('EVIDENCE_UNIT_INVALID');
            const projection=projectEvidence(o,k.objective,value.envelope,unit);
            if(projection.error)throw Error(projection.error);
            const fragment={envelope:value.envelope,unit,adapter:interpret.semanticAdapter,...(value.wire?{wire:value.wire}:{})};
            if(o.evidence)o.evidenceFragments.push(fragment);else o.evidence=fragment;
            o.candidates=admitWebProjection(o,k.objective);
            attempt.status='COMPLETED';o.interpretation={kind:'EVIDENCE',unit:unit.id,accepted:projection.accepted,rejected:projection.rejected};
            k.trace.push({event:'EVIDENCE_UNDERSTANDING',observation:o.id,sha256:o.sha256,unit:unit.id,evidence:fragment,interpretation:o.interpretation,sourceSupport:projection.bindings,candidates:o.candidates});
        } catch(error) {
            attempt.status='FAILED';if(/_BOUND$/.test(error.message))markLimit(k,'interpretationCapacity');o.interpretation={kind:'UNDERSTANDING_FAILED',unit:unit.id,...understandingError(error)};
            k.trace.push({event:'UNDERSTANDING_UNAVAILABLE',observation:o.id,...o.interpretation});
            if(o.interpretation.status===429||o.interpretation.apiCode==='model_not_found'||o.interpretation.apiCode==='invalid_api_key'){k.semanticUnavailable={code:o.interpretation.code,status:o.interpretation.status??null,apiCode:o.interpretation.apiCode??null,...(o.interpretation.status===429?{until:Date.now()+(o.interpretation.diagnostics?.retryAfterMs??30000),bodySha256:o.sha256}: {})};}
        }
        await persist(k,save);
    }
}

function admitNavigation(k,o,a,plan,kind) {
    if(plan.limited)markLimit(k,'discoveryExtraction');
    const depth=(k.destinations.find(d=>d.url===a.url)?.depth??0)+1;
    const rows=[];
    for(const c of diverseCandidates(plan.candidates,k.bounds.candidateDestinations)) {
        rows.push({candidate:c.id,url:c.url,result:addDestination(k,{url:c.url,depth,needs:c.needs,grounding:{kind,observation:o.id,source:c.source,candidate:c.id},discovery:c})});
    }
    if(plan.candidates.length>k.bounds.candidateDestinations)markLimit(k,'candidateDestinations');
    k.trace.push({event:'PROVIDER_FRONTIER',observation:o.id,limited:plan.limited,inspected:plan.inspected??null,candidates:rows});
    return rows;
}

async function boundedNavigationAdvice(navigate,rows,needs,deadlineMs=discoveryCapacity.advisoryMs) {
    let timer;
    try {
        return await Promise.race([
            Promise.resolve().then(()=>navigate(structuredClone(rows),structuredClone(needs))),
            new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('NAVIGATION_ADVICE_DEADLINE')),deadlineMs);})
        ]);
    } finally {clearTimeout(timer);}
}
