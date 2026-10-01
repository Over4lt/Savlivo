// Independent V3 domain primitives. No filesystem, network or V2 imports.
import { createHash } from 'node:crypto';
import {validateNamespaces,navigationOwned,authorityBinding,navigationParametersSafe} from './discovery-authority.mjs';
import {acquisitionCapacity} from './acquisition-contract.mjs';
export const canonical = value => JSON.stringify(sort(value));
function sort(v) {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])]));
    return v;
}
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
export const states = Object.freeze({ ESTABLISHED: 'ESTABLISHED', UNRESOLVED: 'UNRESOLVED', CONTRADICTED: 'CONTRADICTED' });
export const servicePropositions = Object.freeze(['SERVICE_IDENTITY', 'SERVICE_SIZE_100K_PLUS', 'CONSUMER_MONTHLY_SUBSCRIPTION_EXISTS', 'ACCOUNT_LOGIN_EXISTS', 'MEMBERSHIP_MANAGEMENT_EXISTS']);
export const pricePropositions = Object.freeze(['SERVICE_IDENTITY', 'PRICE_AMOUNT', 'CURRENCY', 'MONTHLY_CADENCE', 'CONSUMER_SUBSCRIPTION', 'TARGET_MARKET']);
export const defaultBounds = Object.freeze({ actions: 20, searches: 4, acquisitions: 12, countryAcquisitions: 8, navigationDepth: 4, candidateDestinations: 128, sitemapAcquisitions: 4, discoveryProvenance: 8, bytes: acquisitionCapacity.objectiveWireBytes, decodedBytes: acquisitionCapacity.objectiveDecodedBytes, acquisitionMs: acquisitionCapacity.objectiveAcquisitionMs, observationsPerContext: 1, observationsPerDestination: 3, plannerCalls: 24, networkRequests: 96, modelCalls: 12 });
export function normalizeUrl(value, base) {
    try {
        const u = new URL(value, base);
        if (u.protocol !== 'https:' || u.username || u.password || u.port || u.href.length > 2048 || /^(?:\[|\d+(?:\.\d+){3}$)/.test(u.hostname) || /(^|\.)(localhost|local|internal|invalid|test)$/.test(u.hostname))
            return null;
        u.hash = '';
        for (const k of [...u.searchParams.keys()])
            if (/^utm_/i.test(k))
                u.searchParams.delete(k);
        // Preserve unknown parameters and repeated-key ordering: they may select another offer.
        if (new Set(u.searchParams.keys()).size === [...u.searchParams].length)
            u.searchParams.sort();
        return u.href;
    }
    catch {
        return null;
    }
}
export const providerBound = (objective, url) => !!normalizeUrl(url) && objective.providerHosts.includes(new URL(url).hostname);
export const context = (transport, networkGeography = 'UNBOUND') => ({ transport, networkGeography, representation: 'PROVIDER_PAGE' });
export function actionIdentity(action) {
    return digest(action.kind === 'DISCOVER' ? ['DISCOVER', action.market ?? null, action.family??[...action.needs].sort()] : ['ACQUIRE', action.url, action.context]);
}
export function createKnowledge({ objective, permissions = {}, bounds = {} }) {
    if (!objective || !['PRICE', 'SERVICE_QUALIFICATION'].includes(objective.kind) || !objective.serviceId || !objective.serviceName || !Array.isArray(objective.providerHosts) || !objective.providerHosts.length)
        throw Error('INVALID_OBJECTIVE');
    const b = { ...defaultBounds, ...bounds };
    for (const [k, v] of Object.entries(b))
        if (!(k in defaultBounds) || !Number.isSafeInteger(v) || v < 0)
            throw Error('INVALID_BOUND:' + k);
    if (b.observationsPerContext > 1)
        throw Error('REOBSERVATION_REQUIRES_A_NEW_CONTEXT_CONTRACT');
    const o = structuredClone({ ...objective, markets: objective.markets ?? [], seeds: objective.seeds ?? [] });
    if (o.kind === 'PRICE' && (!o.markets.length || o.markets.length > b.candidateDestinations || new Set(o.markets).size !== o.markets.length || o.markets.some(m => !/^[A-Z]{2}$/.test(m))))
        throw Error('INVALID_MARKETS');
    if (o.kind === 'SERVICE_QUALIFICATION' && o.markets.length)
        throw Error('SERVICE_SIZE_IS_NOT_PER_MARKET');
    if (o.providerHosts.some(h => typeof h !== 'string' || !normalizeUrl('https://' + h + '/') || new URL('https://' + h + '/').hostname !== h))
        throw Error('INVALID_PROVIDER_HOST');
    validateNamespaces(o);
    const k = { version: 1, objective: o, permissions: Object.fromEntries(['DIRECT', 'TAVILY', 'DECODO'].map(p => [p, permissions[p] === true])), bounds: b, destinations: [], navigationResources: [], authorityBindings: [], observations: [], attempts: [], decisions: [], trace: [], policyBlocks: [], limitsHit: [], usage: { actions: 0, searches: 0, acquisitions: 0, countryAcquisitions: 0, bytes: 0, decodedBytes: 0, retainedBytes: 0, acquisitionMs: 0, sitemapAcquisitions: 0, plannerCalls: 0, networkRequests: 0, modelCalls: 0 }, pending: null, stop: null };
    for (const url of o.seeds)
        addDestination(k, { url, depth: 0, needs: o.kind === 'PRICE' ? pricePropositions : servicePropositions, grounding: { kind: 'OPERATOR_SEED' } });
    return k;
}
export function addDestination(k, { url, depth, needs, grounding, discovery }) {
    const normalized = normalizeUrl(url);
    if (!normalized || !navigationOwned(k.objective, normalized))
        return 'OUTSIDE_PROVIDER_BOUNDARY';
    if (!grounding || !['OPERATOR_SEED', 'PROVIDER_ROOT', 'DISCOVERY_RESULT', 'PROVIDER_LINK', 'SITEMAP_ENTRY', 'ROBOTS_SITEMAP'].includes(grounding.kind))
        return 'UNGROUNDED_DESTINATION';
    if(grounding.kind!=='OPERATOR_SEED'&&!navigationParametersSafe(normalized))return 'UNSAFE_NAVIGATION_PARAMETER';
    const allowed = k.objective.kind === 'PRICE' ? pricePropositions : servicePropositions;
    const relevant = [...new Set((needs ?? []).filter(n => allowed.includes(n)))];
    if (!relevant.length)
        return 'NO_RELEVANT_NEED';
    if (!Number.isSafeInteger(depth) || depth < 0)
        return 'INVALID_DEPTH';
    if (depth > k.bounds.navigationDepth) {
        markLimit(k, 'navigationDepth');
        return 'NAVIGATION_DEPTH_BOUND';
    }
    const old = k.destinations.find(d => d.url === normalized);
    if (old) {
        old.needs = [...new Set([...old.needs, ...relevant])].sort();
        old.depth = Math.min(old.depth, depth);
        old.provenance??=[old.grounding];
        if(old.provenance.length<k.bounds.discoveryProvenance&&!old.provenance.some(g=>canonical(g)===canonical(grounding)))old.provenance.push(structuredClone(grounding));
        if(discovery&&(discovery.score??0)>(old.discovery?.score??0))old.discovery=structuredClone(discovery);
        return 'KNOWN_DESTINATION';
    }
    if (k.destinations.length >= k.bounds.candidateDestinations) {
        const replace=k.destinations.filter(d=>d.discovery&&!k.attempts.some(a=>a.action.url===d.url)&&!k.observations.some(o=>o.url===d.url)).sort((a,b)=>(a.discovery.score??0)-(b.discovery.score??0)||b.url.localeCompare(a.url))[0];
        if(replace&&(discovery?.score??0)>(replace.discovery.score??0)) {
            k.trace.push({event:'FRONTIER_REPLACED',evicted:replace.url,admitted:normalized,reason:'UNATTEMPTED_LOWER_DISCOVERY_VALUE'});
            k.destinations.splice(k.destinations.indexOf(replace),1);
        } else {markLimit(k, 'candidateDestinations');return 'DESTINATION_BOUND';}
    }
    materializeAuthority(k,normalized);
    k.destinations.push({ url: normalized, depth, needs: relevant.sort(), grounding, provenance:[structuredClone(grounding)], ...(discovery?{discovery:structuredClone(discovery)}:{}) });
    return 'ADMITTED';
}
export function markLimit(k, name) {
    if (!k.limitsHit.includes(name)) k.limitsHit.push(name);
}
export function checkpoint(k) {
    const payload = structuredClone(k);
    return { version: 1, sha256: digest(payload), payload };
}
export function restore(snapshot) {
    if (snapshot?.version !== 1 || snapshot.payload?.version !== 1 || snapshot.sha256 !== digest(snapshot.payload))
        throw Error('CHECKPOINT_INTEGRITY');
    return structuredClone(snapshot.payload);
}

// Materialize only an operator-reviewed authority permission. This is not a source claim.
export function materializeAuthority(k,url) {
    const binding=authorityBinding(k.objective,url);
    if(!binding)return false;
    if(!k.objective.providerHosts.includes(binding.host)) {
        k.objective.providerHosts.push(binding.host);k.objective.providerHosts.sort();
        k.authorityBindings??=[];k.authorityBindings.push(binding);
    }
    return true;
}
