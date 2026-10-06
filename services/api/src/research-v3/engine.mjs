import { actionIdentity, addDestination, canonical, checkpoint, context, createKnowledge, digest, markLimit, normalizeUrl, providerBound, materializeAuthority } from './model.mjs';
import {buildWorkingModel,rankResearchActions,workingDecision} from './working-model.mjs';
import { evaluate, interpretStructured, readSource } from './truth.mjs';
import {projectTranslation,translationError} from './translation.mjs';
import {projectEvidence,understandingError} from './evidence.mjs';
import {projectObservation} from './projection.mjs';
import {acquisitionCapacity as acquisition,failureClass} from './acquisition-contract.mjs';
import {semanticUnitLimits} from './semantic-units.mjs';
import { projectWebSource } from './source.mjs';
import {extractNavigation,extractSitemap,queryFamilies,discoveryCapacity,diverseCandidates,rankCandidate} from './discovery.mjs';
const resourceCapacityFailure=f=>f?.kind==='CAPACITY'&&['BODY_CAPACITY','DECOMPRESSION_CAPACITY','DECODED_CAPACITY','OBSERVATION_CAPACITY','HEADER_CAPACITY','REDIRECT_CAPACITY'].includes(failureClass(f.code));
const route = a => a.kind === 'DISCOVER' ? 'TAVILY' : a.context?.transport;
function searches(k, truth) {
    const markets = k.objective.kind === 'PRICE' ? k.objective.markets : [null];
    return markets.flatMap(m => {
        const needs=truth.needs.filter(n=>n.market===m).map(n=>n.id);
        if(!needs.length)return [];
        // A legacy free-form proposal consumes its semantic intent once, not endless paraphrases.
        if(k.attempts.some(x=>x.action.kind==='DISCOVER'&&!x.action.family&&(x.action.market??null)===m&&canonical(x.action.needs)===canonical([...needs].sort())))return [];
        return queryFamilies(k.objective,m,needs);
    });
}
function proposals(k, truth) {
    const actions = [];
    for (const d of k.destinations) {
        const needs = truth.needs.filter(n => d.needs.includes(n.proposition));
        if (!needs.length)
            continue;
        actions.push({ kind: 'ACQUIRE', url: d.url, context: context('DIRECT'), needs: needs.map(n => n.id), reason: 'Observe this grounded provider resource for unresolved facts', value: 5+(d.discovery?.score??0) });
        for (const market of [...new Set(needs.map(n => n.market).filter(Boolean))])
            actions.push({ kind: 'ACQUIRE', url: d.url, context: context('DECODO', market), needs: needs.filter(n => n.market === market).map(n => n.id), reason: 'Target-country perspective may reveal the missing market-specific presentation', value: 10+(d.discovery?.score??0) });
    }
    return [...actions, ...searches(k, truth)];
}
function capacity(k, a) {
    const u = k.usage, b = k.bounds, checks = [['actions', u.actions, b.actions], ['bytes', u.bytes, b.bytes], ['decodedBytes', u.decodedBytes??0, b.decodedBytes??acquisition.objectiveDecodedBytes], ['acquisitionMs', u.acquisitionMs??0, b.acquisitionMs??acquisition.objectiveAcquisitionMs], ['networkRequests', u.networkRequests ?? 0, b.networkRequests ?? 96]];
    if (a.kind === 'DISCOVER')
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
    if (!['ACQUIRE', 'DISCOVER'].includes(a.kind) || !Array.isArray(a.needs) || !a.needs.length || a.needs.some(id => !truth.needs.some(n => n.id === id)))
        return { action: a, reason: 'NO_CURRENT_NEED' };
    a.needs = [...new Set(a.needs)].sort();
    a.value = Number.isFinite(a.value) && a.value > 0 ? a.value : 0;
    if (!a.value || typeof a.reason !== 'string' || !a.reason.trim() || a.reason.length > 1000)
        return { action: a, reason: 'NO_EXPLAINED_INFORMATION_VALUE' };
    if (a.kind === 'ACQUIRE') {
        a.url = normalizeUrl(a.url);
        const d = k.destinations.find(d => d.url === a.url);
        if (!d || !providerBound(k.objective, a.url))
            return { action: a, reason: 'UNGROUNDED_DESTINATION' };
        if (a.needs.some(id => !d.needs.includes(truth.needs.find(n => n.id === id).proposition)))
            return { action: a, reason: 'DESTINATION_NOT_RELEVANT' };
        const c = a.context;
        if (!c || c.representation !== 'PROVIDER_PAGE' || !['DIRECT', 'DECODO'].includes(c.transport) || c.transport === 'DIRECT' && c.networkGeography !== 'UNBOUND' || c.transport === 'DECODO' && (!k.objective.markets.includes(c.networkGeography) || a.needs.some(id => truth.needs.find(n => n.id === id).market !== c.networkGeography)))
            return { action: a, reason: 'INVALID_OBSERVATION_CONTEXT' };
        // Extra planner metadata must never create a new observation identity.
        a.context = context(c.transport, c.networkGeography);
        if (k.policyBlocks.some(b => b.scope === 'ORIGIN' ? new URL(a.url).origin === b.value : a.url === b.value))
            return { action: a, reason: 'PROVIDER_ACCESS_POLICY' };
    }
    else if (typeof a.query !== 'string' || !a.query.trim() || a.query.length > 1000 || a.needs.some(id => truth.needs.find(n => n.id === id).market !== (a.market ?? null)))
        return { action: a, reason: 'INVALID_DISCOVERY_INTENT' };
    if(a.kind==='DISCOVER'&&a.family) {
        const expected=queryFamilies(k.objective,a.market??null,a.needs).find(x=>x.family===a.family);
        if(!expected||expected.query!==a.query)return {action:a,reason:'INVALID_DISCOVERY_FAMILY'};
    }
    a.id = actionIdentity(a);
    if (!k.permissions[route(a)] || typeof adapters[route(a)] !== 'function')
        return { action: a, reason: 'CAPABILITY_NOT_PERMITTED_OR_AVAILABLE' };
    if (k.attempts.some(x => x.id === a.id) || a.kind === 'ACQUIRE' && [...k.observations,...(k.navigationResources??[])].some(o => o.url === a.url && canonical(o.context) === canonical(a.context)))
        return { action: a, reason: 'SEMANTIC_DUPLICATE' };
    const bounds = capacity(k, a);
    if (bounds.length)
        return { action: a, reason: 'CAPACITY_BOUND_REACHED', bounds };
    return { action: a, reason: 'ADMISSIBLE' };
}
export function availableActions(k, adapters = {}, extra = []) {
    const truth = evaluate(k), seen = new Set(), evaluated = [];
    for (const p of [...extra, ...proposals(k, truth)]) {
        const row = validate(k, truth, p, adapters), key = row.action.id ?? digest(row.action);
        if (seen.has(key))
            continue;
        seen.add(key);
        evaluated.push(row);
    }
    return { truth, evaluated, actions: evaluated.filter(r => r.reason === 'ADMISSIBLE').map(r => r.action).sort((a, b) => b.value - a.value || a.id.localeCompare(b.id)) };
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
    k.stop = { reason, ...details, remainingNeeds: evaluate(k).needs.map(n => n.id) };
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
        const outcomes = results.slice(0, limit).map((r, i) => ({ url: r.url, result: addDestination(k, { url: r.url, depth: 0, needs: a.needs.map(id => id.split(':').at(-1)), grounding: { kind: 'DISCOVERY_RESULT', action: a.id, index: i },discovery:{kind:'SEARCH_RESULT',label:typeof r.title==='string'?r.title.slice(0,240):'',score:normalizeUrl(r.url)?rankCandidate({url:r.url,label:typeof r.title==='string'?r.title.slice(0,240):'',kind:'SEARCH_RESULT',context:'SEARCH'},k.objective):0,family:a.family??a.id,signals:{discoveryOnly:true,origin:'SEARCH_DESTINATION'}} }) }));
        return { kind: 'DISCOVERY', results: results.length, destinations: outcomes };
    }
    if (canonical(response.context) !== canonical(a.context))
        throw Error('OBSERVATION_CONTEXT_MISMATCH');
    const url = normalizeUrl(response.url ?? a.url);
    if (!url || !materializeAuthority(k,url) || !providerBound(k.objective, url))
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
    const o = { id: a.id, kind: 'PROVIDER', url, context: structuredClone(a.context), outcome: response.outcome ?? 'ERROR', truncated: response.truncated === true, body, bytes, sha256: digest(body), action: a.id, candidates: [],
        ...(response.format==='WEB'?{format:'WEB',contentType:response.contentType,requestedUrl:a.url,httpStatus:response.httpStatus,acquiredAt:response.acquiredAt,transport:response.transport,access:response.access,completeness:response.completeness??(response.truncated?'INCOMPLETE':'COMPLETE'),responseMetadata:response.responseMetadata,redirects:response.redirects,acquisitionTiming:response.acquisitionTiming}: {}) };
    if(k.destinations.find(d=>d.url===a.url)?.discovery?.resource==='SITEMAP') {
        k.navigationResources??=[];k.navigationResources.push(o);
        const plan=extractSitemap(o,k.objective,evaluate(k).needs.map(n=>n.proposition));
        const navigation=admitNavigation(k,o,a,plan,'SITEMAP_ENTRY');
        return {kind:'NAVIGATION_RESOURCE',id:o.id,url,sha256:o.sha256,bytes,navigation};
    }
    k.observations.push(o);
    if (o.outcome === 'OK' && !o.truncated && (o.completeness===undefined||o.completeness==='COMPLETE')) {
        o.candidates=o.format==='WEB'?projectObservation(o,k.objective).candidates:interpretStructured(o,k.objective);
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
                o.candidates=projectObservation(o,k.objective).candidates;
                o.interpretation={kind:'EVIDENCE',adapter:interpret.semanticAdapter,accepted:projection.accepted,rejected:projection.rejected};
                k.trace.push({event:'EVIDENCE_UNDERSTANDING',observation:o.id,sha256:o.sha256,evidence:o.evidence,interpretation:o.interpretation,sourceSupport:projection.bindings,candidates:o.candidates});
            }
        } else if(candidates?.kind==='TRANSLATION') {
            const translation={envelope:candidates.envelope,adapter:interpret.semanticAdapter};
            const projection=projectTranslation(o,k.objective,translation.envelope);
            if(projection.error)o.interpretation={kind:'TRANSLATION_REJECTED',code:projection.error};
            else {
                o.translation=translation;o.candidates=projectObservation(o,k.objective).candidates;
                o.interpretation={kind:'TRANSLATION',adapter:interpret.semanticAdapter,limited:projection.limited};
                k.trace.push({event:'TRANSLATION',observation:o.id,sha256:o.sha256,translation,sourceSupport:projection.bindings,candidates:o.candidates});
            }
        } else if(candidates!==undefined) {
            if(!Array.isArray(candidates)||modelNeeded)throw Error('INVALID_INTERPRETER_RESULT');
            const source=readSource(o,k.objective),maximum=1+(source?.offers?.length??0);
            o.candidates=candidates.slice(0,maximum).map(c=>({kind:c.kind,pointer:c.pointer}));
        }
        if(/(?:MATERIAL|RESPONSE)_BOUND$/.test(o.interpretation?.code??''))markLimit(k,'interpretationCapacity');
        if(o.interpretation?.kind?.startsWith(stage+'_'))k.trace.push({event:stage+'_UNAVAILABLE',observation:o.id,...o.interpretation});
        }

    }
    const web=o.format==='WEB'?projectWebSource(o,k.objective):null;
    if(web?.limited&&!o.translation) markLimit(k,'interpretationCapacity');
    if(web&&!o.interpretation) o.interpretation={ambiguities:web.ambiguities,limited:web.limited};
    const current=evaluate(k).needs.map(n=>n.proposition);
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
            const automaticAdvice=!navigate&&interpret.researchAdvisor&&!k.semanticUnavailable&&(o.navigation.length>=8||o.navigation.filter(c=>c.kind==='PROVIDER_STATE').length>=2);
            const advisor=navigate??(automaticAdvice?interpret.researchAdvisor:null);
            if(advisor&&o.navigation.length&&(navigate||k.usage.modelCalls<k.bounds.modelCalls&&(k.researchAdvisoryCalls??0)<4)) {
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
                    k.trace.push({event:'NAVIGATION_ADVICE_UNAVAILABLE',observation:o.id,code:/^RESEARCH_[A-Z_]+$/.test(error?.message??'')?error.message:'ADVISORY_FAILED_NATIVE_FRONTIER_PRESERVED',status,purpose:'RESEARCH_ONLY',modelCalls:k.usage.modelCalls,requestBytes:error?.v3Diagnostics?.requestBytes??null});
                    if(!navigate&&status===429)k.semanticUnavailable={status:429,until:Date.now()+30000,bodySha256:o.sha256,purpose:'RESEARCH_ADVICE'};
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
    return { kind: 'PROVIDER', id: o.id, url, context: o.context, outcome: o.outcome, sha256: o.sha256, bytes, navigation };
}
export async function runResearch({ knowledge, objective, permissions, bounds, capabilities = {}, reasoner, interpret = interpretStructured, navigate, save } = {}) {
    const k = knowledge ? structuredClone(knowledge) : createKnowledge({ objective, permissions, bounds });
    if (k.version !== 1)
        throw Error('UNSUPPORTED_KNOWLEDGE_VERSION');
    k.usage.sitemapAcquisitions??=0;
    k.navigationResources??=[];
    k.usage.modelCalls??=0;
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
        const initial = evaluate(k);
        k.workingModel=buildWorkingModel(k,initial);
        if(initial.ineligibleMarkets.length>0&&initial.ineligibleMarkets.length===k.objective.markets.length){stop(k,'MONTHLY_SUBSCRIPTION_NOT_OFFERED',{markets:initial.ineligibleMarkets});await persist(k,save);return k;}
        if (initial.established) {
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
        if (reasoner) {
            // A reasoning component receives a copy, and can propose/rank only. It cannot
            // mutate evidence, counters, permissions, or established propositions.
            try {
                decision = await reasoner(structuredClone({ workingModel:k.workingModel,objective: k.objective, truth: initial, destinations: k.destinations, observations: k.observations.map(({ body, candidates, ...o }) => o), actions: offered.actions, attempts: k.attempts, permissions:k.permissions, bounds:k.bounds, usage:k.usage }));
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
            offered = availableActions(k, capabilities, Array.isArray(decision.proposals) ? decision.proposals.slice(0, k.bounds.candidateDestinations) : []);
        }
        const ranked=rankResearchActions({objective:k.objective,truth:initial,workingModel:k.workingModel,destinations:k.destinations,observations:k.observations,actions:offered.actions});
        const selected = offered.actions.find(a => a.id === decision.actionId) ?? offered.actions.find(a=>a.id===ranked[0]?.actionId);
        const audit = { needs: initial.needs.map(n => n.id), evaluated: offered.evaluated.map(r => ({ id: r.action.id ?? null, kind: r.action.kind, url: r.action.url ?? null, context: r.action.context ?? null, value:r.action.value, family:r.action.family??null, needs: r.action.needs, reason: r.reason, bounds: r.bounds ?? [] })), selected: selected?.id ?? null, reason: selected ? (decision.actionId === selected.id && typeof decision.reason === 'string' ? decision.reason : selected.reason) : 'No admissible useful action in the current grounded knowledge' };
        k.decisions.push(audit);
        k.trace.push({event:'RESEARCH_DECISION',...workingDecision(k.workingModel,ranked,selected?.id??null,{usage:k.usage,bounds:k.bounds})});
        if (!selected) {
            const hit = [...new Set([...k.limitsHit, ...offered.evaluated.flatMap(r => r.bounds ?? [])])];
            stop(k, hit.length ? 'CAPACITY_BOUND_REACHED' : 'SEMANTIC_EXHAUSTION', { bounds: hit, decision: k.decisions.length - 1, scope: 'CURRENT_GROUNDED_KNOWLEDGE_AND_PERMISSIONS' });
            await persist(k, save);
            return k;
        }
        const a = selected;
        k.usage.actions++;
        if (a.kind === 'DISCOVER')
            k.usage.searches++;
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
            const response = await capabilities[route(a)](structuredClone(a), { maxBytes: k.bounds.bytes - k.usage.bytes, maxDecodedBytes:(k.bounds.decodedBytes??acquisition.objectiveDecodedBytes)-(k.usage.decodedBytes??0), maxAcquisitionMs:(k.bounds.acquisitionMs??acquisition.objectiveAcquisitionMs)-(k.usage.acquisitionMs??0), maxResults: k.bounds.candidateDestinations, maxRequests:(k.bounds.networkRequests??96)-(k.usage.networkRequests??0) });
            const observation = await accept(k, a, response, interpret, navigate, save), after = evaluate(k);
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
        k.workingModel=buildWorkingModel(k,evaluate(k));
        await persist(k, save);
    }
}

async function understandUnits(k,o,interpret,save) {
    const needs=evaluate(k).needs.map(n=>n.proposition),plan=interpret.semanticPlan(o,k.objective,needs),units=plan.units;
    if(plan.capacityHit)markLimit(k,'semanticUnits');
    o.semanticUnits=units;o.evidenceFragments??=[];o.semanticAttempts??=[];
    k.trace.push({event:'SEMANTIC_UNITS_SELECTED',observation:o.id,units,capacityHit:plan.capacityHit,reason:plan.reason});
    for(const unit of units.slice(0,semanticUnitLimits.modelCallsPerAction)) {
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
        if(truth.established||!truth.needs.some(n=>unit.needs.includes(n.proposition)))break;
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
            o.candidates=projectObservation(o,k.objective).candidates;
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
