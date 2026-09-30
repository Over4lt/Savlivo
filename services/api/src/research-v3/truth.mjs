import { canonical, digest, providerBound, servicePropositions, pricePropositions } from './model.mjs';
const currencies = new Set(Intl.supportedValuesOf('currency'));
const blank = () => ({ state: 'UNRESOLVED', value: null, evidence: [], contradictions: [] });
const slots = names => Object.fromEntries(names.map(n => [n, blank()]));
function claim(slot, value, reference, sufficient = true) {
    if (!sufficient)
        return;
    const item = { value, reference };
    if (!slot.evidence.some(e => canonical(e) === canonical(item)))
        slot.evidence.push(item);
    const values = [...new Set(slot.evidence.map(e => canonical(e.value)))];
    slot.state = values.length > 1 || value === false ? 'CONTRADICTED' : 'ESTABLISHED';
    // Once contradictory observations exist, a later repeat cannot erase them.
    if (slot.evidence.some(e => e.value === false))
        slot.state = 'CONTRADICTED';
    slot.value = values.length === 1 ? slot.evidence[0].value : null;
    slot.contradictions = slot.state === 'CONTRADICTED' ? slot.evidence : [];
}
export function readSource(observation) {
    try { return JSON.parse(observation.body); }
    catch { return null; }
}
// Initial deterministic interpreter contract. Future interpreters must identify
// source-backed candidates, not submit proposition states or unsupported values.
export function interpretStructured(observation) {
    const source = readSource(observation);
    if (!source || typeof source !== 'object')
        return [];
    return [{ kind: 'SERVICE', pointer: '' }, ...(Array.isArray(source.offers) ? source.offers.map((_, i) => ({ kind: 'OFFER', pointer: '/offers/' + i })) : [])];
}
export function evaluate(k) {
    const service = slots(servicePropositions), groups = new Map();
    for (const o of k.observations) {
        if (o.kind !== 'PROVIDER' || o.outcome !== 'OK' || o.truncated || digest(o.body) !== o.sha256 || !providerBound(k.objective, o.url))
            continue;
        const source = readSource(o);
        if (source?.serviceId !== k.objective.serviceId)
            continue;
        const reference = pointer => ({ observation: o.id, sha256: o.sha256, pointer });
        for (const c of o.candidates ?? []) {
            if (c.kind === 'SERVICE' && c.pointer === '') {
                claim(service.SERVICE_IDENTITY, true, reference('/serviceId'));
                const n = source.population;
                if (n?.scope === 'SERVICE_TOTAL' && ['USERS', 'MEMBERS', 'CUSTOMERS', 'SUBSCRIBERS', 'ACTIVE_USERS'].includes(n.measure) && Number.isSafeInteger(n.count) && n.count >= 0) {
                    if (n.kind === 'EXACT' || n.kind === 'LOWER_BOUND' && n.count >= 100000)
                        claim(service.SERVICE_SIZE_100K_PLUS, n.count >= 100000, reference('/population'));
                }
                if (typeof source.account?.login === 'boolean')
                    claim(service.ACCOUNT_LOGIN_EXISTS, source.account.login, reference('/account/login'));
                if (typeof source.account?.manageMembership === 'boolean')
                    claim(service.MEMBERSHIP_MANAGEMENT_EXISTS, source.account.manageMembership, reference('/account/manageMembership'));
            }
            if (c.kind !== 'OFFER' || !/^\/offers\/(0|[1-9]\d*)$/.test(c.pointer))
                continue;
            const offer = source.offers?.[Number(c.pointer.split('/').at(-1))];
            if (!offer || typeof offer !== 'object')
                continue;
            const consumer = offer.consumer === true && ['SUBSCRIPTION', 'MEMBERSHIP'].includes(offer.relationship);
            const explicitCadence = !offer.amountDerivation || offer.amountDerivation === 'EXPLICIT';
            if (consumer && offer.cadence === 'MONTHLY' && explicitCadence && offer.role !== 'TRIAL')
                claim(service.CONSUMER_MONTHLY_SUBSCRIPTION_EXISTS, true, reference(c.pointer));
            const market = typeof offer.market === 'string' && /^[A-Z]{2}$/.test(offer.market) ? offer.market : null;
            // Never assemble a price from unrelated plans, qualifiers, or geographically
            // different unlocalized presentations. A source without an offer ID stands alone.
            const id = typeof offer.id === 'string' && offer.id ? offer.id : o.id + c.pointer;
            const key = canonical([id, market, offer.conditions ?? null, offer.role ?? null, offer.amountDerivation ?? 'EXPLICIT', market ? null : o.context.networkGeography]);
            if (!groups.has(key))
                groups.set(key, { id, market, conditions: offer.conditions ?? null, propositions: slots(pricePropositions) });
            const g = groups.get(key), p = g.propositions, ref = reference(c.pointer);
            claim(p.SERVICE_IDENTITY, true, reference('/serviceId'));
            const ordinary = offer.role === 'ORDINARY' && (!offer.amountDerivation || offer.amountDerivation === 'EXPLICIT');
            claim(p.PRICE_AMOUNT, offer.amount, ref, ordinary && typeof offer.amount === 'number' && Number.isFinite(offer.amount) && offer.amount > 0);
            claim(p.CURRENCY, offer.currency, ref, typeof offer.currency === 'string' && currencies.has(offer.currency));
            if (['MONTHLY', 'YEARLY', 'WEEKLY', 'DAILY'].includes(offer.cadence))
                claim(p.MONTHLY_CADENCE, offer.cadence === 'MONTHLY', ref);
            if (typeof offer.consumer === 'boolean' && ['SUBSCRIPTION', 'MEMBERSHIP', 'INSTALLMENT', 'ONE_TIME'].includes(offer.relationship))
                claim(p.CONSUMER_SUBSCRIPTION, consumer, ref);
            if (market)
                claim(p.TARGET_MARKET, market, ref);
        }
    }
    const prices = {};
    for (const market of k.objective.markets) {
        const options = [...groups.values()].map(g => {
            const p = structuredClone(g.propositions);
            if (g.market && g.market !== market) {
                p.TARGET_MARKET.state = 'CONTRADICTED';
                p.TARGET_MARKET.contradictions = p.TARGET_MARKET.evidence;
            }
            return { ...g, propositions: p, established: pricePropositions.every(n => p[n].state === 'ESTABLISHED') };
        });
        options.sort((a, b) => Number(b.established) - Number(a.established) || Number(b.market === market) - Number(a.market === market) || Object.values(b.propositions).filter(p => p.state === 'ESTABLISHED').length - Object.values(a.propositions).filter(p => p.state === 'ESTABLISHED').length || a.id.localeCompare(b.id));
        prices[market] = options[0] ?? { id: null, market: null, propositions: slots(pricePropositions), established: false };
    }
    const needs = [];
    if (k.objective.kind === 'SERVICE_QUALIFICATION') {
        for (const n of servicePropositions)
            if (service[n].state !== 'ESTABLISHED')
                needs.push({ id: n, proposition: n, market: null, state: service[n].state });
    }
    if (k.objective.kind === 'PRICE')
        for (const [market, v] of Object.entries(prices))
            for (const n of pricePropositions)
                if (v.propositions[n].state !== 'ESTABLISHED')
                    needs.push({ id: market + ':' + n, proposition: n, market, offerId: v.id, state: v.propositions[n].state });
    return { service, offers: [...groups.values()], prices, needs, established: needs.length === 0, admitted: servicePropositions.every(n => service[n].state === 'ESTABLISHED') };
}
