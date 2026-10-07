import {monthlyPayment,paymentChoice,ordinaryCharge} from './payment-semantics.mjs';
import { canonical, digest, providerBound, servicePropositions, pricePropositions } from './model.mjs';
import {projectObservation} from './projection.mjs';
import {verifiedCountryContext} from './truth-contract.mjs';
export {truthContract} from './truth-contract.mjs';
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
const refForAvailability=(o,pointer,web)=>({observation:o.id,sha256:o.sha256,pointer,...(web?{source:web.bindings[pointer]}:{})});
export function readSource(observation, objective) {
    if (observation.semantic) return null; // Retired model-produced proposition envelopes are not evidence.
    if (observation.format === 'WEB') return projectObservation(observation, objective).source;
    try { return JSON.parse(observation.body); }
    catch { return null; }
}
// Initial deterministic interpreter contract. Future interpreters must identify
// source-backed candidates, not submit proposition states or unsupported values.
export function interpretStructured(observation, objective) {
    const source = readSource(observation, objective);
    if (!source || typeof source !== 'object')
        return [];
    return [{ kind: 'SERVICE', pointer: '' }, ...(Array.isArray(source.offers) ? source.offers.map((_, i) => ({ kind: 'OFFER', pointer: '/offers/' + i })) : [])];
}
export function evaluate(k) {
    const availability=Object.fromEntries(k.objective.markets.map(m=>[m,[]]));
    const service = slots(servicePropositions), groups = new Map(), accountAccess={LOGIN:blank(),ACCOUNT:blank(),MANAGE:blank(),CANCEL:blank()};
    for (const o of k.observations) {
        if (o.kind !== 'PROVIDER' || o.outcome !== 'OK' || o.truncated || digest(o.body) !== o.sha256 || !providerBound(k.objective, o.url))
            continue;
        if(o.semantic)continue;
        const web = o.format === 'WEB' ? projectObservation(o,k.objective) : null;
        if(web?.error) continue;
        const source = web?.source ?? readSource(o);
        if (source?.serviceId !== k.objective.serviceId)
            continue;
        for(const graph of source.accountGraphs??[]) {
            for(const node of graph.nodes) {
                const ref={observation:o.id,sha256:o.sha256,node:node.id,destination:node.url,support:node.support};
                if(node.providerControlled&&['LOGIN','ACCOUNT','CANCEL'].includes(node.role))claim(accountAccess[node.role],true,ref);
                if(node.role==='AUTH'&&graph.edges.some(e=>e.from===node.id&&e.kind==='AUTHENTICATES_TO'&&graph.nodes.some(n=>n.id===e.to&&n.role==='ACCOUNT'&&n.providerControlled)))claim(accountAccess.LOGIN,true,ref);
                if(node.role==='MANAGE'&&node.providerControlled&&graph.edges.some(e=>e.to===node.id&&e.kind==='MANAGES_SUBSCRIPTION'&&graph.nodes.some(n=>n.id===e.from&&n.role==='ACCOUNT'&&n.providerControlled)))claim(accountAccess.MANAGE,true,ref);
            }
        }
        const reference = pointer => ({ observation: o.id, sha256: o.sha256, pointer, ...(web ? {source: web.bindings[pointer]} : {}) });
        for(const [i,choice] of (source.subscriptionChoices??[]).entries()) {
            const market=!choice.marketAmbiguous?(choice.market??verifiedCountryContext(o)):null;
            if(choice.monthlyOffered===false&&choice.scope==='SERVICE'&&['COMPLETE','EXPLICIT_NO_MONTHLY'].includes(choice.basis)&&availability[market]&&!choice.excludedMarkets?.includes(market))availability[market].push({value:false,reference:reference('/subscriptionChoices/'+i)});
        }
        for(const [i,choice] of (source.subscriptionChoices??[]).entries()){const market=!choice.marketAmbiguous?(choice.market??verifiedCountryContext(o)):null;if(paymentChoice(choice)&&availability[market]&&!choice.excludedMarkets?.includes(market))availability[market].push({value:true,reference:reference('/subscriptionChoices/'+i)});}
        for (const c of o.candidates ?? []) {
            if (c.kind === 'SERVICE' && c.pointer === '') {
                claim(service.SERVICE_IDENTITY, true, reference('/serviceId'));
                for(const [index,n] of [source.population,...(source.populations??[])].entries()) {
                    if (n?.scope === 'SERVICE_TOTAL' && ['USERS', 'MEMBERS', 'CUSTOMERS', 'SUBSCRIBERS', 'ACTIVE_USERS'].includes(n.measure) && Number.isSafeInteger(n.count) && n.count >= 0) {
                        if (n.kind === 'EXACT' || n.kind === 'LOWER_BOUND' && n.count >= 100000)
                            claim(service.SERVICE_SIZE_100K_PLUS, n.count >= 100000, reference(index===0?'/population':'/populations/'+(index-1)));
                    }
                }
                for(const [i,item] of (source.accountStatements??[]).entries())claim(service[item.operation==='LOGIN'?'ACCOUNT_LOGIN_EXISTS':'MEMBERSHIP_MANAGEMENT_EXISTS'],item.value,reference('/accountStatements/'+i));
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
            if (monthlyPayment(offer) && explicitCadence)
                claim(service.CONSUMER_MONTHLY_SUBSCRIPTION_EXISTS, true, reference(c.pointer));
            const explicitMarket = typeof offer.market === 'string' && /^[A-Z]{2}$/.test(offer.market) ? offer.market : null;
            const country = !offer.marketAmbiguous ? verifiedCountryContext(o) : null;
            const market = explicitMarket ?? country;
            if(monthlyPayment(offer)&&availability[market]&&!offer.excludedMarkets?.includes(market))availability[market].push({value:true,reference:refForAvailability(o,c.pointer,web)});
            // Never assemble a price from unrelated plans, qualifiers, or geographically
            // different unlocalized presentations. A source without an offer ID stands alone.
            const id = typeof offer.id === 'string' && offer.id ? offer.id : o.id + c.pointer;
            const key = canonical([id, market, offer.conditions ?? null, offer.billingCadence??'UNKNOWN',offer.commitment??null, offer.role ?? null, offer.amountDerivation ?? 'EXPLICIT', market ? null : o.context.networkGeography]);
            if (!groups.has(key))
                groups.set(key, { id, market, conditions: offer.conditions ?? null, propositions: slots(pricePropositions) });
            const g = groups.get(key), p = g.propositions, ref = reference(c.pointer);
            for(const excluded of offer.excludedMarkets??[])if(/^[A-Z]{2}$/.test(excluded)) {g.exclusions??=[];g.exclusions.push({country:excluded,reference:ref});}
            claim(p.SERVICE_IDENTITY, true, reference('/serviceId'));
            const ordinary = ordinaryCharge(offer) && (!offer.amountDerivation || offer.amountDerivation === 'EXPLICIT');
            claim(p.PRICE_AMOUNT, offer.amount, ref, ordinary && offer.billingCadence==='MONTHLY' && ['MONTHLY','UNKNOWN',null].includes(offer.cadence??null) && typeof offer.amount === 'number' && Number.isFinite(offer.amount) && offer.amount > 0);
            claim(p.CURRENCY, offer.currency, ref, typeof offer.currency === 'string' && currencies.has(offer.currency));
            if(monthlyPayment(offer))claim(p.MONTHLY_SUBSCRIPTION,true,ref);
            if (['MONTHLY', 'YEARLY', 'WEEKLY', 'DAILY'].includes(offer.cadence))
                claim(p.MONTHLY_CADENCE, offer.cadence === 'MONTHLY', ref);
            if (typeof offer.consumer === 'boolean' && ['SUBSCRIPTION', 'MEMBERSHIP', 'INSTALLMENT', 'ONE_TIME'].includes(offer.relationship))
                claim(p.CONSUMER_SUBSCRIPTION, consumer, ref);
            if (market)
                claim(p.TARGET_MARKET, market, explicitMarket?ref:{...ref,marketContext:{basis:'VERIFIED_COUNTRY_OBSERVATION',country,verification:o.transport.verification}});
        }
    }
    const prices = {};
    for (const market of k.objective.markets) {
        const options = [...groups.values()].map(g => {
            const p = structuredClone(g.propositions);
            for(const exclusion of g.exclusions??[])if(exclusion.country===market)claim(p.TARGET_MARKET,false,{...exclusion.reference,marketContext:{basis:'EXPLICIT_PROVIDER_EXCLUSION',country:market}});
            if (g.market && g.market !== market) {
                p.TARGET_MARKET.state = 'CONTRADICTED';
                p.TARGET_MARKET.contradictions = p.TARGET_MARKET.evidence;
            }
            return { ...g, propositions: p, established: pricePropositions.every(n => p[n].state === 'ESTABLISHED') };
        });
        options.sort((a, b) => Number(b.established) - Number(a.established) || Number(b.market === market) - Number(a.market === market) || Object.values(b.propositions).filter(p => p.state === 'ESTABLISHED').length - Object.values(a.propositions).filter(p => p.state === 'ESTABLISHED').length || a.id.localeCompare(b.id));
        prices[market] = options[0] ?? { id: null, market: null, propositions: slots(pricePropositions), established: false };
    }
    const eligibility=Object.fromEntries(Object.entries(availability).map(([market,evidence])=>{
        const positive=evidence.some(e=>e.value===true),negative=evidence.some(e=>e.value===false);
        const state=positive&&!negative?'MONTHLY_SUBSCRIPTION_ESTABLISHED':negative&&!positive?'MONTHLY_SUBSCRIPTION_NOT_OFFERED':'MONTHLY_SUBSCRIPTION_UNRESOLVED';
        return [market,{state,result:state==='MONTHLY_SUBSCRIPTION_ESTABLISHED'?'ELIGIBLE':state==='MONTHLY_SUBSCRIPTION_NOT_OFFERED'?'INELIGIBLE':'UNRESOLVED',evidence,conflicting:positive&&negative}];
    }));
    for(const [market,v] of Object.entries(prices))if(eligibility[market]?.result!=='ELIGIBLE'){v.established=false;if(eligibility[market]?.conflicting)v.propositions.MONTHLY_SUBSCRIPTION={state:'CONTRADICTED',value:null,evidence:eligibility[market].evidence,contradictions:eligibility[market].evidence};}
    const needs = [];
    if (k.objective.kind === 'SERVICE_QUALIFICATION') {
        for (const n of servicePropositions)
            if (service[n].state !== 'ESTABLISHED')
                needs.push({ id: n, proposition: n, market: null, state: service[n].state });
    }
    if (k.objective.kind === 'PRICE')
        for (const [market, v] of Object.entries(prices))
            if(eligibility[market]?.result!=='INELIGIBLE')for (const n of pricePropositions)
                if (v.propositions[n].state !== 'ESTABLISHED')
                    needs.push({ id: market + ':' + n, proposition: n, market, offerId: v.id, state: v.propositions[n].state });
    const ineligibleMarkets=Object.keys(eligibility).filter(m=>eligibility[m].result==='INELIGIBLE');
    const established=needs.length===0&&ineligibleMarkets.length===0;
    return { eligibility,ineligibleMarkets,resolved:needs.length===0,service, accountAccess, offers: [...groups.values()], prices, needs, established, admitted: servicePropositions.every(n => service[n].state === 'ESTABLISHED') && (k.objective.markets.length===0 || k.objective.markets.every(m=>eligibility[m]?.result==='ELIGIBLE')) };
}
