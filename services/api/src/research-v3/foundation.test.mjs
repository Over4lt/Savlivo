import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {runResearch, availableActions} from './engine.mjs';
import {evaluate} from './truth.mjs';
import {createKnowledge, checkpoint, restore, context, actionIdentity, normalizeUrl, pricePropositions} from './model.mjs';

const url = 'https://provider.example/pricing';
const objective = (extra = {}) => ({kind: 'PRICE', serviceId: 'fixture', serviceName: 'Example service', providerHosts: ['provider.example'], markets: ['JP'], seeds: [url], ...extra});
const offer = (extra = {}) => ({id: 'standard', amount: 1400, currency: 'JPY', cadence: 'MONTHLY', consumer: true, relationship: 'SUBSCRIPTION', role: 'ORDINARY', market: 'JP', ...extra});
const source = (extra = {}) => ({serviceId: 'fixture', offers: [offer()], ...extra});
const response = (action, body = source(), extra = {}) => ({url: action.url, context: action.context, outcome: 'OK', httpStatus: 200, body: JSON.stringify(body), ...extra});
const directFirst = state => ({actionId: state.actions.find(a => a.context?.transport === 'DIRECT')?.id, reason: 'Compare the unbound provider presentation first'});
const options = (extra = {}) => ({objective: objective(), permissions: {DIRECT: true}, capabilities: {DIRECT: a => response(a)}, ...extra});
const fact = (k, name) => evaluate(k).prices.JP.propositions[name];

test('A: one authoritative presentation establishes all six price propositions', async () => {
  const k = await runResearch(options());
  assert.equal(k.stop.reason, 'OBJECTIVE_ESTABLISHED');
  assert.equal(k.usage.acquisitions, 1);
  for (const p of Object.values(evaluate(k).prices.JP.propositions)) {
    assert.equal(p.state, 'ESTABLISHED');
    assert.equal(p.evidence.length, 1);
    assert.ok(p.evidence[0].reference.sha256);
  }
  assert.equal(evaluate(k).admitted, false); // Price is not admission.
});

test('B: ambiguous cadence remains unknown, then grounded navigation resolves it', async () => {
  const seen = [];
  const k = await runResearch(options({capabilities: {DIRECT: a => {
    seen.push(a.url);
    return response(a, a.url === url ? source({offers: [offer({cadence: null})], links: [{url: '/terms', needs: ['MONTHLY_CADENCE']}, {url: '/news', needs: []}]}) : source());
  }}}));
  assert.deepEqual(seen, [url, 'https://provider.example/terms']);
  assert.equal(k.decisions[1].needs.join(), 'JP:MONTHLY_CADENCE');
  assert.equal(k.stop.reason, 'OBJECTIVE_ESTABLISHED');
  assert.ok(k.trace[2].remainingNeeds.includes('JP:MONTHLY_CADENCE'));
});

test('C/F: Direct HTTP 200 leaves market unknown; same destination Decodo JP resolves only remaining need', async () => {
  const k = await runResearch(options({permissions: {DIRECT: true, DECODO: true}, reasoner: directFirst, capabilities: {
    DIRECT: a => response(a, source({offers: [offer({market: null})]})),
    DECODO: a => {assert.equal(a.context.networkGeography, 'JP'); assert.deepEqual(a.needs, ['JP:TARGET_MARKET']); return response(a);}
  }}));
  assert.deepEqual(k.observations.map(o => o.context), [context('DIRECT'), context('DECODO', 'JP')]);
  assert.equal(k.stop.reason, 'OBJECTIVE_ESTABLISHED');
  assert.equal(k.usage.searches, 0);
});

test('D: country-bound acquisition can be first with Direct also permitted', async () => {
  const k = await runResearch(options({permissions: {DIRECT: true, DECODO: true}, capabilities: {
    DIRECT: () => assert.fail('Direct is not a mandatory gateway'), DECODO: a => response(a)
  }}));
  assert.equal(k.attempts[0].action.context.transport, 'DECODO');
  assert.equal(k.usage.actions, 1);
});

test('E: discovery snippets establish nothing; discovered provider destination enters acquisition', async () => {
  const capabilities = {TAVILY: () => ({results: [{url, snippet: JSON.stringify(source())}, {url: 'https://unrelated.example/pricing'}]}), DIRECT: a => response(a)};
  const settings = options({objective: objective({seeds: []}), permissions: {TAVILY: true, DIRECT: true}, capabilities});
  const limited = await runResearch({...settings, bounds: {actions: 1}});
  assert.equal(limited.stop.reason, 'CAPACITY_BOUND_REACHED');
  assert.equal(limited.observations.length, 0);
  assert.equal(fact(limited, 'PRICE_AMOUNT').state, 'UNRESOLVED');
  const k = await runResearch(settings);
  assert.deepEqual(k.attempts.map(a => a.action.kind), ['DISCOVER', 'ACQUIRE']);
  assert.equal(k.destinations.length, 1);
  assert.equal(k.stop.reason, 'OBJECTIVE_ESTABLISHED');
});

test('G: Direct, JP and AU observations remain distinct; equivalent observations are consumed', async () => {
  const k = await runResearch(options({objective: objective({markets: ['JP', 'AU']}), permissions: {DIRECT: true, DECODO: true}, reasoner: directFirst, capabilities: {
    DIRECT: a => response(a, source({offers: []})),
    DECODO: a => response(a, source({offers: [offer({market: a.context.networkGeography, currency: a.context.networkGeography === 'AU' ? 'AUD' : 'JPY'})]}))
  }}));
  assert.equal(k.stop.reason, 'OBJECTIVE_ESTABLISHED');
  assert.deepEqual(new Set(k.observations.map(o => o.context.networkGeography)), new Set(['UNBOUND', 'JP', 'AU']));
  assert.equal(new Set(k.attempts.map(a => a.id)).size, 3);
  const unfinished = await runResearch(options({permissions: {DIRECT: true, DECODO: true}, capabilities: {DIRECT: a => response(a, source({offers: []})), DECODO: a => response(a, source({offers: []}))}}));
  const rows = availableActions(unfinished, {DIRECT() {}, DECODO() {}}).evaluated;
  assert.equal(rows.filter(r => r.reason === 'SEMANTIC_DUPLICATE').length, 2);
});

test('H: inspected admissible contexts exhausted with trace, deterministic stop', async () => {
  const settings = options({capabilities: {DIRECT: a => response(a, source({offers: []}))}});
  const k = await runResearch(settings);
  assert.equal(k.stop.reason, 'SEMANTIC_EXHAUSTION');
  assert.equal(k.stop.scope, 'CURRENT_GROUNDED_KNOWLEDGE_AND_PERMISSIONS');
  assert.ok(k.stop.remainingNeeds.length);
  assert.ok(k.decisions.at(-1).evaluated.some(r => r.reason === 'SEMANTIC_DUPLICATE'));
  assert.deepEqual(await runResearch(settings), k);
});

test('I: action and planner bounds are capacity, not semantic exhaustion', async () => {
  for (const bounds of [{actions: 0}, {plannerCalls: 0}, {acquisitions: 0}, {bytes: 0}, {observationsPerContext: 0}, {observationsPerDestination: 0}]) {
    const k = await runResearch(options({bounds}));
    assert.equal(k.stop.reason, 'CAPACITY_BOUND_REACHED');
    assert.equal(k.usage.actions, 0);
  }
  const geo = await runResearch(options({permissions: {DECODO: true}, bounds: {countryAcquisitions: 0}, capabilities: {DECODO: a => response(a)}}));
  assert.equal(geo.stop.reason, 'CAPACITY_BOUND_REACHED');
  const search = await runResearch(options({objective: objective({seeds: []}), permissions: {TAVILY: true}, bounds: {searches: 0}, capabilities: {TAVILY() {assert.fail();}}}));
  assert.equal(search.stop.reason, 'CAPACITY_BOUND_REACHED');
});

test('J: invalid price semantics never establish an ordinary monthly target price', async t => {
  const cases = {
    annualDivided: {cadence: 'MONTHLY', amountDerivation: 'ANNUAL_DIVIDED_BY_12'},
    annual: {cadence: 'YEARLY'}, benefit: {role: 'BENEFIT'}, credit: {role: 'CREDIT'}, discount: {role: 'DISCOUNT'},
    installment: {amountDerivation: 'INSTALLMENT_ARITHMETIC'}, installmentRelationship: {relationship: 'INSTALLMENT'},
    trial: {role: 'TRIAL'}, zero: {amount: 0}, cadenceAmbiguous: {cadence: null},
    wrongMarket: {market: 'AU'}, currencyAmbiguous: {currency: '$'}, nonConsumer: {consumer: false}
  };
  for (const [name, fields] of Object.entries(cases)) await t.test(name, async () => {
    const k = await runResearch(options({capabilities: {DIRECT: a => response(a, source({offers: [offer(fields)]}))}}));
    assert.equal(evaluate(k).prices.JP.established, false);
    assert.notEqual(k.stop.reason, 'OBJECTIVE_ESTABLISHED');
  });
  for (const data of [source({serviceId: 'another-service'}), {offers: [offer()]}]) {
    const k = await runResearch(options({capabilities: {DIRECT: a => response(a, data)}}));
    assert.equal(fact(k, 'SERVICE_IDENTITY').state, 'UNRESOLVED');
  }
});

test('K: minimal independent service admission; missing evidence is not contradiction', async () => {
  const full = source({population: {scope: 'SERVICE_TOTAL', measure: 'MEMBERS', count: 100000, kind: 'EXACT'}, account: {login: true, manageMembership: true}});
  const settings = options({objective: objective({kind: 'SERVICE_QUALIFICATION', markets: []}), capabilities: {DIRECT: a => response(a, full)}});
  assert.equal(evaluate(await runResearch(settings)).admitted, true);
  for (const missing of ['population', 'account', 'offers']) {
    const body = structuredClone(full); delete body[missing];
    const k = await runResearch({...settings, capabilities: {DIRECT: a => response(a, body)}});
    assert.equal(evaluate(k).admitted, false);
    assert.ok(evaluate(k).needs.every(n => n.state === 'UNRESOLVED'));
  }
  for (const fields of [{cadence: 'YEARLY'}, {cadence: null}, {amountDerivation: 'ANNUAL_DIVIDED_BY_12'}, {role: 'TRIAL'}]) {
    const k = await runResearch({...settings, capabilities: {DIRECT: a => response(a, {...full, offers: [offer(fields)]})}});
    assert.equal(evaluate(k).service.CONSUMER_MONTHLY_SUBSCRIPTION_EXISTS.state, 'UNRESOLVED');
  }
  for (const population of [{scope: 'COUNTRY_COUNT', measure: 'MEMBERS', count: 1000000, kind: 'EXACT'}, {scope: 'SERVICE_TOTAL', measure: 'MEMBERS', count: 90000, kind: 'LOWER_BOUND'}]) {
    const k = await runResearch({...settings, capabilities: {DIRECT: a => response(a, {...full, population})}});
    assert.equal(evaluate(k).service.SERVICE_SIZE_100K_PLUS.state, 'UNRESOLVED');
  }
});

test('contradictory observations survive repetition; missing new evidence does not erase facts', async () => {
  const k = await runResearch(options({objective: objective({seeds: [url, 'https://provider.example/other', 'https://provider.example/empty']}), capabilities: {DIRECT: a => response(a, a.url.endsWith('empty') ? source({offers: []}) : source({offers: [offer({cadence: null, amount: a.url === url ? 1400 : 1500})]}))}}));
  assert.equal(fact(k, 'PRICE_AMOUNT').state, 'CONTRADICTED');
  assert.equal(fact(k, 'PRICE_AMOUNT').contradictions.length, 2);
  assert.equal(fact(k, 'CURRENCY').state, 'ESTABLISHED');
  assert.equal(fact(k, 'MONTHLY_CADENCE').state, 'UNRESOLVED');
});

test('offer, market and qualifier boundaries prevent assembling unrelated fragments', async () => {
  for (const second of [offer({id: 'other', amount: null}), offer({role: 'TRIAL', amount: null}), offer({market: 'AU', amount: null}), offer({conditions: 'introductory', amount: null})]) {
    const k = await runResearch(options({capabilities: {DIRECT: a => response(a, source({offers: [offer({cadence: null}), second]}))}}));
    assert.equal(evaluate(k).prices.JP.established, false);
  }
});

test('policy stop prevents Decodo bypass; disabled capability never dispatches', async () => {
  const k = await runResearch(options({permissions: {DIRECT: true, DECODO: true}, reasoner: directFirst, capabilities: {
    DIRECT: a => response(a, {}, {outcome: 'POLICY_BLOCKED', policyScope: 'URL'}), DECODO() {assert.fail('No policy bypass');}
  }}));
  assert.equal(k.usage.actions, 1);
  assert.ok(k.decisions.at(-1).evaluated.some(r => r.reason === 'PROVIDER_ACCESS_POLICY'));
  const disabled = await runResearch(options({permissions: {}, capabilities: {DIRECT() {assert.fail();}, DECODO() {assert.fail();}, TAVILY() {assert.fail();}}}));
  assert.equal(disabled.usage.actions, 0);
});

test('no speculative/external URLs, irrelevant navigation or normalized duplicate crawling', async () => {
  const k = await runResearch(options({reasoner: () => ({proposals: [{kind: 'ACQUIRE', url: 'https://provider.example/invented', context: context('DIRECT'), needs: ['JP:PRICE_AMOUNT'], value: 999, reason: 'Guess'}]}), capabilities: {DIRECT: a => response(a, source({offers: [], links: [
    {url: url + '#buy', needs: pricePropositions}, {url: url + '?utm_source=test', needs: pricePropositions},
    {url: '/news', needs: []}, {url: 'https://unrelated.example/price', needs: pricePropositions}
  ]}))}}));
  assert.equal(k.usage.actions, 1);
  assert.equal(k.destinations.length, 1);
  assert.ok(k.decisions[0].evaluated.some(r => r.reason === 'UNGROUNDED_DESTINATION'));
  assert.equal(normalizeUrl('http://provider.example/'), null);
  assert.equal(normalizeUrl('https://127.0.0.1/'), null);
});

test('query paraphrases cannot expand the same semantic discovery action', async () => {
  let calls = 0;
  const k = await runResearch(options({objective: objective({seeds: []}), permissions: {TAVILY: true}, capabilities: {TAVILY() {calls++; return {results: []};}}, reasoner: s => ({proposals: [{kind: 'DISCOVER', market: 'JP', query: 'different words ' + s.attempts.length, needs: s.truth.needs.map(n => n.id), value: 10, reason: 'Find current missing facts'}]})}));
  assert.equal(calls, 1);
  assert.equal(k.stop.reason, 'SEMANTIC_EXHAUSTION');
  const a = k.attempts[0].action;
  assert.equal(actionIdentity(a), actionIdentity({...a, query: 'yet another paraphrase'}));
});

test('planner metadata and redirect aliases cannot manufacture fresh observation identities', async () => {
  const k = await runResearch(options({reasoner: s => ({proposals: [null, {kind: 'ACQUIRE', url, context: {...context('DIRECT'), nonce: s.attempts.length}, needs: s.truth.needs.map(n => n.id), value: 100, reason: 'Observe provider facts'}]}), capabilities: {DIRECT: a => response(a, source({offers: [], links: [{url: '/canonical', needs: pricePropositions}]}), {url: 'https://provider.example/canonical'})}}));
  assert.equal(k.usage.actions, 1);
  assert.equal(k.stop.reason, 'SEMANTIC_EXHAUSTION');
  assert.ok(k.decisions.at(-1).evaluated.some(r => r.url === 'https://provider.example/canonical' && r.reason === 'SEMANTIC_DUPLICATE'));
});

test('planner and interpreter cannot fabricate facts or change execution permissions', async () => {
  const k = await runResearch(options({reasoner: s => {s.truth.established = true; return {established: true};}, interpret: () => [{kind: 'OFFER', pointer: '/offers/999', amount: 10, state: 'ESTABLISHED'}], capabilities: {DIRECT: a => response(a, source({offers: []}))}}));
  assert.equal(fact(k, 'PRICE_AMOUNT').state, 'UNRESOLVED');
  assert.equal(k.stop.reason, 'SEMANTIC_EXHAUSTION');
});

test('resume keeps consumed context and budget; uncertain dispatch is not repeated', async () => {
  let saved;
  const settings = options({permissions: {DIRECT: true, DECODO: true}, reasoner: directFirst, capabilities: {DIRECT: a => response(a, source({offers: [offer({market: null})]})), DECODO: a => response(a)}, bounds: {actions: 2}});
  await assert.rejects(runResearch({...settings, save: s => {saved = s; if (s.payload.attempts.length === 1 && !s.payload.pending) throw Error('SIMULATED_PROCESS_EXIT');}}), /SIMULATED_PROCESS_EXIT/);
  const k = await runResearch({...settings, knowledge: restore(saved), capabilities: {...settings.capabilities, DIRECT() {assert.fail('Consumed Direct cannot repeat');}}});
  assert.equal(k.usage.actions, 2);
  assert.equal(k.stop.reason, 'OBJECTIVE_ESTABLISHED');
  const altered = structuredClone(saved); altered.payload.usage.actions = 0;
  assert.throws(() => restore(altered), /CHECKPOINT_INTEGRITY/);
  let pending;
  await assert.rejects(runResearch({...settings, save: s => {pending = s; throw Error('CRASH_BEFORE_RESULT');}}), /CRASH_BEFORE_RESULT/);
  const uncertain = await runResearch({...settings, knowledge: restore(pending), capabilities: {DIRECT() {assert.fail();}, DECODO() {assert.fail();}}});
  assert.equal(uncertain.stop.reason, 'RECOVERY_REQUIRED');
  assert.equal(uncertain.usage.actions, 1);
});

test('navigation/destination/bytes bounds stay explicit; context receipt must match request', async () => {
  for (const bounds of [{navigationDepth: 0}, {candidateDestinations: 1}]) {
    const k = await runResearch(options({bounds, capabilities: {DIRECT: a => response(a, source({offers: [], links: [{url: '/plans', needs: pricePropositions}]}))}}));
    assert.equal(k.stop.reason, 'CAPACITY_BOUND_REACHED');
    assert.equal(k.usage.acquisitions, 1);
  }
  const over = await runResearch(options({bounds: {bytes: 4}}));
  assert.equal(over.stop.code, 'CAPABILITY_BYTE_CONTRACT_VIOLATION');
  assert.equal(over.observations.length, 0);
  const mismatch = await runResearch(options({capabilities: {DIRECT: a => response(a, source(), {context: context('DECODO', 'JP')})}}));
  assert.equal(mismatch.stop.code, 'OBSERVATION_CONTEXT_MISMATCH');
  const noSearchBytes = await runResearch(options({objective: objective({seeds: []}), permissions: {TAVILY: true}, bounds: {bytes: 0}, capabilities: {TAVILY() {assert.fail('Byte capacity must be checked before dispatch');}}}));
  assert.equal(noSearchBytes.stop.reason, 'CAPACITY_BOUND_REACHED');
});

test('V3 production modules import no V2, network, filesystem or Operations modules', () => {
  for (const file of ['model.mjs', 'truth.mjs', 'engine.mjs']) {
    const contents = readFileSync(new URL(file, import.meta.url), 'utf8');
    for (const match of contents.matchAll(/from ['"]([^'"]+)['"]/g)) assert.ok(['node:crypto', './model.mjs', './truth.mjs', './source.mjs'].includes(match[1]), match[1]);
    assert.doesNotMatch(contents, /\b(?:fetch|eval)\s*\(|import\s*\(/);
  }
  assert.ok(readdirSync(new URL('.', import.meta.url)).includes('engine.mjs'));
  assert.equal(checkpoint(createKnowledge({objective: objective()})).version, 1);
});
