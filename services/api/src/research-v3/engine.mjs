import { actionIdentity, addDestination, canonical, checkpoint, context, createKnowledge, digest, markLimit, normalizeUrl, providerBound } from './model.mjs';
import { evaluate, interpretStructured, readSource } from './truth.mjs';
import {projectSemantic} from './semantic.mjs';
import { projectWebSource } from './source.mjs';
const route = a => a.kind === 'DISCOVER' ? 'TAVILY' : a.context?.transport;
function searches(k, truth) {
    const markets = k.objective.kind === 'PRICE' ? k.objective.markets : [null];
    return markets.map(m => {
        const needs = truth.needs.filter(n => n.market === m);
        return {
            kind: 'DISCOVER', market: m, needs: needs.map(n => n.id),
            query: [k.objective.serviceName, m, needs.map(n => n.proposition.toLowerCase().replaceAll('_', ' ')).join(' '), 'site:' + k.objective.providerHosts[0]].filter(Boolean).join(' '),
            reason: 'Locate a provider source addressing the current unknowns', value: 2
        };
    }).filter(a => a.needs.length);
}
function proposals(k, truth) {
    const actions = [];
    for (const d of k.destinations) {
        const needs = truth.needs.filter(n => d.needs.includes(n.proposition));
        if (!needs.length)
            continue;
        actions.push({ kind: 'ACQUIRE', url: d.url, context: context('DIRECT'), needs: needs.map(n => n.id), reason: 'Observe this grounded provider resource for unresolved facts', value: 5 });
        for (const market of [...new Set(needs.map(n => n.market).filter(Boolean))])
            actions.push({ kind: 'ACQUIRE', url: d.url, context: context('DECODO', market), needs: needs.filter(n => n.market === market).map(n => n.id), reason: 'Target-country perspective may reveal the missing market-specific presentation', value: 10 });
    }
    return [...actions, ...searches(k, truth)];
}
function capacity(k, a) {
    const u = k.usage, b = k.bounds, checks = [['actions', u.actions, b.actions], ['bytes', u.bytes, b.bytes], ['networkRequests', u.networkRequests ?? 0, b.networkRequests ?? 96]];
    if (a.kind === 'DISCOVER')
        checks.push(['searches', u.searches, b.searches]);
    else {
        checks.push(['acquisitions', u.acquisitions, b.acquisitions]);
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
    a.id = actionIdentity(a);
    if (!k.permissions[route(a)] || typeof adapters[route(a)] !== 'function')
        return { action: a, reason: 'CAPABILITY_NOT_PERMITTED_OR_AVAILABLE' };
    if (k.attempts.some(x => x.id === a.id) || a.kind === 'ACQUIRE' && k.observations.some(o => o.url === a.url && canonical(o.context) === canonical(a.context)))
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
    k.trace.push({ event: 'STOP', ...k.stop });
    return k;
}
async function accept(k, a, response, interpret, navigate) {
    if (!response || typeof response !== 'object')
        throw Error('CAPABILITY_RESPONSE_REQUIRED');
    if (response.accounting) {
        const {requests,bytes}=response.accounting;
        if(!Number.isSafeInteger(requests)||requests<0||!Number.isSafeInteger(bytes)||bytes<0) throw Error('INVALID_TRANSPORT_ACCOUNTING');
        k.usage.networkRequests=(k.usage.networkRequests??0)+requests;
        // Include robots, redirects, geo probes and failed responses, not only evidence.
        k.usage.bytes+=bytes;
        if(k.usage.bytes>k.bounds.bytes||k.usage.networkRequests>(k.bounds.networkRequests??96)) {
            markLimit(k,'transportCapacity'); throw Error('TRANSPORT_CAPACITY_BOUND');
        }
    }
    if(response.failure) {
        if(response.failure.kind==='CAPACITY') markLimit(k,'transportCapacity');
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
        const outcomes = results.slice(0, limit).map((r, i) => ({ url: r.url, result: addDestination(k, { url: r.url, depth: 0, needs: a.needs.map(id => id.split(':').at(-1)), grounding: { kind: 'DISCOVERY_RESULT', action: a.id, index: i } }) }));
        return { kind: 'DISCOVERY', results: results.length, destinations: outcomes };
    }
    if (canonical(response.context) !== canonical(a.context))
        throw Error('OBSERVATION_CONTEXT_MISMATCH');
    const url = normalizeUrl(response.url ?? a.url);
    if (!url || !providerBound(k.objective, url))
        throw Error('PROVIDER_REDIRECT_NOT_AUTHORIZED');
    if (response.outcome === 'POLICY_BLOCKED') {
        const scope = response.policyScope === 'ORIGIN' ? 'ORIGIN' : 'URL';
        k.policyBlocks.push({ scope, value: scope === 'ORIGIN' ? new URL(url).origin : url, observation: a.id });
    }
    const body = typeof response.body === 'string' ? response.body : '', bytes = Buffer.byteLength(body), remaining = k.bounds.bytes - k.usage.bytes;
    if(response.accounting && bytes>response.accounting.bytes) throw Error('INVALID_TRANSPORT_ACCOUNTING');
    // The capability contract must enforce maxBytes while receiving data. Never
    // interpret or retain an over-bound response, even from a faulty offline adapter.
    if (!response.accounting && bytes > remaining)
        throw Error('CAPABILITY_BYTE_CONTRACT_VIOLATION');
    if(!response.accounting) k.usage.bytes += bytes;
    const o = { id: a.id, kind: 'PROVIDER', url, context: structuredClone(a.context), outcome: response.outcome ?? 'ERROR', truncated: response.truncated === true, body, bytes, sha256: digest(body), action: a.id, candidates: [],
        ...(response.format==='WEB'?{format:'WEB',contentType:response.contentType,requestedUrl:a.url,httpStatus:response.httpStatus,acquiredAt:response.acquiredAt,transport:response.transport,access:response.access}: {}) };
    k.observations.push(o);
    if (o.outcome === 'OK' && !o.truncated) {
        const candidates = await interpret(structuredClone(o),structuredClone(k.objective));
        if(candidates?.kind==='SEMANTIC') {
            o.semantic=candidates.envelope;
            const projection=projectSemantic(o,k.objective);
            if(projection.error)throw Error(projection.error);
            o.candidates=projection.candidates;
            o.interpretation={kind:'SEMANTIC',metadata:o.semantic.metadata,accepted:projection.accepted,rejected:projection.rejected,limited:projection.limited};
            if(projection.limited)markLimit(k,'interpretationCapacity');
            k.trace.push({event:'SEMANTIC_INTERPRETATION',observation:o.id,sha256:o.sha256,interpretation:o.interpretation,candidates:o.candidates,sourceSupport:projection.bindings});
        } else {
            if (!Array.isArray(candidates))throw Error('INVALID_INTERPRETER_RESULT');
            const source=readSource(o,k.objective), maximum=1+(Array.isArray(source?.offers)?source.offers.length:0);
            o.candidates=candidates.slice(0,maximum).map(c=>({kind:c.kind,pointer:c.pointer}));
        }
    }
    const web=o.format==='WEB'?projectWebSource(o,k.objective):null;
    if(web?.limited&&!o.semantic) markLimit(k,'interpretationCapacity');
    if(web&&!o.semantic) o.interpretation={ambiguities:web.ambiguities,limited:web.limited};
    const links = (web?.source??readSource(o))?.links;
    if(web) o.navigation=links.map(({url,label,needs,source},index)=>({index,url,label,needs,source}));
    if(web&&navigate&&o.outcome==='OK'&&!o.truncated) {
        // Intelligence may classify an observed anchor, never invent its href.
        const proposals=navigate(structuredClone(o.navigation),structuredClone(evaluate(k).needs));
        if(!Array.isArray(proposals)) throw Error('INVALID_NAVIGATION_RESULT');
        if(proposals.length>k.bounds.candidateDestinations)markLimit(k,'candidateDestinations');
        for(const p of proposals.slice(0,k.bounds.candidateDestinations)) {
            if(!Number.isSafeInteger(p?.index)||!links[p.index]||!Array.isArray(p.needs))continue;
            const current=evaluate(k).needs.map(n=>n.proposition);
            links[p.index].needs=[...new Set([...links[p.index].needs,...p.needs.filter(n=>current.includes(n))])];
        }
    }
    const navigation = [];
    if (o.outcome === 'OK' && !o.truncated && Array.isArray(links)) {
        if (links.length > k.bounds.candidateDestinations)
            markLimit(k, 'candidateDestinations');
        const depth = (k.destinations.find(d => d.url === a.url)?.depth ?? 0) + 1;
        for (const [index, l] of links.slice(0, k.bounds.candidateDestinations).entries())
            navigation.push({ url: l.url, result: addDestination(k, { url: normalizeUrl(l.url, url), depth, needs: l.needs, grounding: { kind: 'PROVIDER_LINK', observation: o.id, pointer: '/links/' + index } }) });
    }
    return { kind: 'PROVIDER', id: o.id, url, context: o.context, outcome: o.outcome, sha256: o.sha256, bytes, navigation };
}
export async function runResearch({ knowledge, objective, permissions, bounds, capabilities = {}, reasoner, interpret = interpretStructured, navigate, save } = {}) {
    const k = knowledge ? structuredClone(knowledge) : createKnowledge({ objective, permissions, bounds });
    if (k.version !== 1)
        throw Error('UNSUPPORTED_KNOWLEDGE_VERSION');
    if (k.stop)
        return k;
    if (!k.trace.length)
        k.trace.push({ event: 'INITIAL', objective: k.objective, truth: evaluate(k) });
    if (k.pending) {
        stop(k, 'RECOVERY_REQUIRED', { action: k.pending.id, why: 'Dispatch outcome is unknown; automatic repetition is prohibited' });
        await persist(k, save);
        return k;
    }
    for (;;) {
        const initial = evaluate(k);
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
                decision = await reasoner(structuredClone({ objective: k.objective, truth: initial, destinations: k.destinations, observations: k.observations.map(({ body, candidates, ...o }) => o), actions: offered.actions, attempts: k.attempts, permissions:k.permissions, bounds:k.bounds, usage:k.usage }));
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
        const selected = offered.actions.find(a => a.id === decision.actionId) ?? offered.actions[0];
        const audit = { needs: initial.needs.map(n => n.id), evaluated: offered.evaluated.map(r => ({ id: r.action.id ?? null, kind: r.action.kind, url: r.action.url ?? null, context: r.action.context ?? null, needs: r.action.needs, reason: r.reason, bounds: r.bounds ?? [] })), selected: selected?.id ?? null, reason: selected ? (decision.actionId === selected.id && typeof decision.reason === 'string' ? decision.reason : selected.reason) : 'No admissible useful action in the current grounded knowledge' };
        k.decisions.push(audit);
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
            if (a.context.transport === 'DECODO')
                k.usage.countryAcquisitions++;
        }
        k.pending = a;
        k.attempts.push({ id: a.id, action: a, status: 'RESERVED' });
        k.trace.push({ event: 'ACTION_SELECTED', action: a, reason: audit.reason });
        await persist(k, save);
        try {
            const response = await capabilities[route(a)](structuredClone(a), { maxBytes: k.bounds.bytes - k.usage.bytes, maxResults: k.bounds.candidateDestinations, maxRequests:(k.bounds.networkRequests??96)-(k.usage.networkRequests??0) });
            const observation = await accept(k, a, response, interpret, navigate), after = evaluate(k);
            k.attempts.at(-1).status = 'COMPLETED';
            k.pending = null;
            k.trace.push({ event: 'OBSERVATION', observation, changes: changes(initial, after), remainingNeeds: after.needs.map(n => n.id) });
        }
        catch (error) {
            k.attempts.at(-1).status = 'FAILED';
            k.pending = null;
            stop(k, k.limitsHit.includes('transportCapacity')?'CAPACITY_BOUND_REACHED':'CAPABILITY_OR_INTERPRETATION_FAILED', { action: a.id, code: error.message });
            await persist(k, save);
            return k;
        }
        await persist(k, save);
    }
}
