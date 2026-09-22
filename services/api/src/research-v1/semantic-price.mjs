import {structuredAmountSpan} from './associated-structured-resources.mjs';
import {hydrateRetainedBody} from './retained-body-reference.mjs';
import {providerCurrencyContext,groundedCurrency} from './price-currency-context.mjs';
// Interpretation of an already admitted provider fragment. Never source authority.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {boundedCall} from './executor-adapters.mjs';
export const semanticPriceRevision='SEMANTIC_PRICE_INTERPRETER_V1';
export const semanticPricePolicyRevision='PROVIDER_CONTAINER_SEMANTICS_V1';
export const semanticLimits=Object.freeze({maxCallsPerTask:4,maxContainerBytes:6000,maxOutputBytes:24000,timeoutMs:20000,maxOutputTokens:2000});
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const exact=(x,keys)=>assert(x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k)),'SEMANTIC_SHAPE');
export function validateSemanticPolicy(p){exact(p,['revision','interpreterRevision','provider','modelRevision',...(Object.hasOwn(p,'imageModel')?['imageModel']:[])]);if(p.imageModel!==undefined)assert(p.imageModel==='qwen/qwen3.6-27b','Unsupported image model');assert(p.revision===semanticPricePolicyRevision&&p.interpreterRevision===semanticPriceRevision);assert(p.provider==='groq'||p.provider==='offline-test');assert(typeof p.modelRevision==='string'&&/^[\w./:-]{1,160}$/.test(p.modelRevision));return p;}
export function semanticContext(task,page,container,policy){page=hydrateRetainedBody(page);validateSemanticPolicy(policy);const text=container.text;assert(Buffer.byteLength(text)<=semanticLimits.maxContainerBytes);const basis={sourceUrl:page.url,sourceHash:page.sourceIntegrity.sha256,container:{offset:container.start,length:container.end-container.start,sha256:sha(page.rawSource.text.slice(container.start,container.end)),textHash:sha(text)},service:task.serviceName,serviceSlug:task.canonicalSlug,market:task.countryCode,...(container.admission?{admission:container.admission}:{}),scope:page.priceAcquisition?.scope??null,...(providerCurrencyContext(task,page)?{currencyContext:providerCurrencyContext(task,page)}:{}),policy};return {...basis,key:sha(basis),text};}
function grounded(f,text){exact(f,['value','start','end','quote']);assert(typeof f.value==='string'&&f.value.length<=200&&Number.isInteger(f.start)&&Number.isInteger(f.end)&&f.start>=0&&f.end>f.start&&f.end<=text.length&&text.slice(f.start,f.end)===f.quote,'SEMANTIC_SPAN');return f.value;}
function decimalText(text){return text.normalize('NFKC').replace(/\p{Decimal_Number}/gu,c=>{let n=c.codePointAt(0),start=n;for(let steps=0;steps<100&&start>0&&/\p{Decimal_Number}/u.test(String.fromCodePoint(start-1));steps++)start--;return String((n-start)%10);}).trim().replace(',','.');}
function amount(value,quote){assert(/^(0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value));assert(decimalText(quote)===value,'SEMANTIC_AMOUNT_ABSENT');}
const iso=new Set(Intl.supportedValuesOf('currency'));
export function validateSemanticOutput(output,context){
 assert(Buffer.byteLength(JSON.stringify(output))<=semanticLimits.maxOutputBytes);exact(output,['offers']);assert(Array.isArray(output.offers)&&output.offers.length<=8);const valid=[];
 for(const o of output.offers){
  exact(o,['plan','amount','currency','cadence','semantics','promotionDuration','ordinaryPriceAfterPromotion','ambiguous']);assert(typeof o.ambiguous==='boolean');
  for(const key of ['plan','amount','currency','cadence','semantics'])grounded(o[key],context.text);
  assert(o.plan.value===o.plan.quote.trim()&&o.plan.value.length>0,'SEMANTIC_PLAN_ABSENT');amount(o.amount.value,o.amount.quote);
  if(context.admission==='OFFICIAL_STRUCTURED_OBJECT_V1')assert(structuredAmountSpan(context.text,o.amount.start,o.amount.end),'SEMANTIC_PARTIAL_STRUCTURED_AMOUNT');
  assert(iso.has(o.currency.value)&&groundedCurrency(o.currency.quote,context.currencyContext)===o.currency.value,'SEMANTIC_CURRENCY_ABSENT');
  assert(['MONTHLY','YEARLY','OTHER','UNKNOWN'].includes(o.cadence.value));
  const literalCadence=/^(?:\/?mo(?:nth)?|monthly|per month)$/i.test(o.cadence.quote.trim())?'MONTHLY':/^(?:\/?yr|\/?year|yearly|annually|per year)$/i.test(o.cadence.quote.trim())?'YEARLY':null;
  assert(!literalCadence||o.cadence.value===literalCadence||o.cadence.value==='UNKNOWN','SEMANTIC_CADENCE_CONTRADICTION');
  assert(['ORDINARY_RECURRING','PROMOTIONAL','INTRODUCTORY','TRIAL_FREE','ONE_TIME','UNKNOWN'].includes(o.semantics.value));
  if(o.semantics.value==='TRIAL_FREE')assert(Number(o.amount.value)===0);
  if(o.promotionDuration){grounded(o.promotionDuration,context.text);assert(o.promotionDuration.value===o.promotionDuration.quote.trim());}
  if(o.ordinaryPriceAfterPromotion){grounded(o.ordinaryPriceAfterPromotion,context.text);amount(o.ordinaryPriceAfterPromotion.value,o.ordinaryPriceAfterPromotion.quote);}
  valid.push(o);
 }
 // An asserted renewal relationship must bind another independent ordinary offer in this container.
 for(const o of valid)if(o.ordinaryPriceAfterPromotion)assert(valid.some(n=>n.plan.value===o.plan.value&&n.currency.value===o.currency.value&&n.semantics.value==='ORDINARY_RECURRING'&&n.amount.value===o.ordinaryPriceAfterPromotion.value),'SEMANTIC_RENEWAL_UNBOUND');
 return output;
}
export function retainedSemanticOffers(task,page,containers,policy,dimensions,at){
 if(!policy)return [];validateSemanticPolicy(policy);const offers=[];
 for(const c of containers){let context;try{context=semanticContext(task,page,c,policy);}catch{continue;}
  // Prior V1 interpretations had no optional currency context. Revalidate their
  // exact original key/spans with their original (narrower) grounding authority.
  const legacy={...context};delete legacy.currencyContext;delete legacy.key;delete legacy.text;legacy.key=sha(legacy);legacy.text=context.text;
  let records=(page.semanticPriceInterpretations??[]).filter(r=>r.key===context.key&&r.status==='COMPLETE');
  if(!records.length)records=(page.semanticPriceInterpretations??[]).filter(r=>r.key===legacy.key&&r.status==='COMPLETE');
  if(records.length!==1)continue;
  if(records[0].key===legacy.key)context=legacy;
  const r=records[0];try{assert.deepEqual(r.context,context);assert(Number.isFinite(Date.parse(r.at))&&Date.parse(r.at)<=Date.parse(at));assert(r.outputHash===sha(r.output));validateSemanticOutput(r.output,context);}catch{continue;}
  for(const o of r.output.offers){const cadence={MONTHLY:'MONTH',YEARLY:'YEAR',OTHER:'OTHER',UNKNOWN:'UNKNOWN'}[o.cadence.value];
   const offerType={TRIAL_FREE:'TRIAL',UNKNOWN:'UNKNOWN_EFFECTIVE',ONE_TIME:'UNKNOWN_EFFECTIVE'}[o.semantics.value]??o.semantics.value;
   const value={amount:o.amount.value,currency:o.currency.value,plan:o.plan.value,cadence,cadenceDescription:cadence==='MONTH'?'Monthly':cadence==='YEAR'?'Yearly':o.cadence.quote,billingRoute:'DIRECT',billingProvider:task.serviceName,offerType,taxTreatment:'UNKNOWN',taxNote:null};
   offers.push({value,quote:c.text,fragment:{offset:context.container.offset,length:context.container.length,sha256:context.container.sha256},interpretation:{revision:semanticPriceRevision,policy:policy.revision,modelRevision:policy.modelRevision,key:context.key,fields:o,rawWording:c.text},dimensions:{...dimensions,PLAN_BINDING:'ESTABLISHED',AMOUNT:'ESTABLISHED',CURRENCY:'ESTABLISHED',CADENCE:cadence==='UNKNOWN'?'MISSING':'ESTABLISHED',COMMERCIAL_SEMANTICS:o.ambiguous||['UNKNOWN','ONE_TIME'].includes(o.semantics.value)?'AMBIGUOUS':'ESTABLISHED',CONFLICT_STATE:'ESTABLISHED'}});
  }
 }
 return offers;
}
export async function interpretUnresolvedContainers({task,page,analysis,policy,interpreter,records,consumeNetwork,saveIntent,at,canConsume=()=>true,strategies=[]}){
 validateSemanticPolicy(policy);assert(JSON.stringify(interpreter.policy)===JSON.stringify(policy),'Semantic capability revision changed');
 if(page.priceEvidenceExcluded===true||Object.values(analysis.dimensions).some(v=>v!=='ESTABLISHED')){page.semanticFallback={version:'SEMANTIC_FALLBACK_V1',status:'NOT_ATTEMPTED',reason:page.priceEvidenceExcluded?'TRANSPORT_POLICY_EXCLUDED':'OFFICIAL_CONTEXT_NOT_ADMITTED',eligible:0,attempted:0,cached:0,blocked:0};return;}
 page.semanticPriceInterpretations??=[];
 const preferred=new Set(strategies.flatMap(s=>s.containers??[]).flatMap(c=>[c.textHash,c.shapeHash]));
 const priority=c=>preferred.has(sha(c.text))||preferred.has(sha(c.text.replace(/\p{Nd}+/gu,'#')));
 page.semanticFallback={version:'SEMANTIC_FALLBACK_V1',eligible:0,attempted:0,cached:0,blocked:0};
 const containers=[...(analysis.containers??[])].sort((a,b)=>Number(priority(b))-Number(priority(a))||a.start-b.start);
 for(const c of containers){
  const fast=analysis.offers.filter(o=>o.fragment.offset===c.start&&o.fragment.length===c.end-c.start);
  if(fast.length&&fast.every(o=>Object.values(o.dimensions).every(v=>v==='ESTABLISHED')))continue;
  page.semanticFallback.eligible++;
  if(c.admission)page.semanticFallback.admission=c.admission;
  let context;try{context=semanticContext(task,page,c,policy);}catch{page.semanticFallback.blocked++;page.semanticFallback.reason='CONTAINER_BOUND';continue;}
  const cached=[...records,...page.semanticPriceInterpretations].find(r=>r.key===context.key&&(r.status==='COMPLETE'||r.status==='IN_FLIGHT'||r.at===at));
  if(cached){page.semanticFallback.cached++;if(!page.semanticPriceInterpretations.some(r=>r.key===cached.key))page.semanticPriceInterpretations.push(structuredClone(cached));continue;}
  const equivalent=[...records,...page.semanticPriceInterpretations].find(r=>r.status==='COMPLETE'&&r.context.sourceUrl===context.sourceUrl&&r.context.sourceHash===context.sourceHash&&r.context.container.textHash===context.container.textHash&&r.context.serviceSlug===context.serviceSlug&&r.context.market===context.market&&JSON.stringify(r.context.scope)===JSON.stringify(context.scope)&&JSON.stringify(r.context.policy)===JSON.stringify(context.policy));
  if(equivalent){page.semanticFallback.cached++;const alias={...structuredClone(equivalent),context,key:context.key,runAttempt:false};records.push(alias);page.semanticPriceInterpretations.push(alias);continue;}
  if(records.filter(r=>r.runAttempt===true).length>=semanticLimits.maxCallsPerTask||!canConsume()){page.semanticFallback.blocked++;page.semanticFallback.reason='SEMANTIC_RESOURCE_BOUND';continue;}
  page.semanticFallback.attempted++;
  const record={key:context.key,context,status:'IN_FLIGHT',at,runAttempt:true};records.push(record);page.semanticPriceInterpretations.push(record);
  // Existing controller action reservation owns the HTTP allowance. Intent is durable before effect.
  await saveIntent();
  try{consumeNetwork();const output=await boundedCall(interpreter.interpret.bind(interpreter),{context},{timeoutMs:semanticLimits.timeoutMs,maxResponseBytes:semanticLimits.maxOutputBytes});validateSemanticOutput(output,context);record.output=output;record.outputHash=sha(output);record.status='COMPLETE';}
  catch{record.status='UNRESOLVED';record.reason='SEMANTIC_UNAVAILABLE_OR_INVALID';} // Never serialize model errors or credentials.
  await saveIntent();
 }
 const relevant=page.semanticPriceInterpretations.filter(r=>r.context?.sourceHash===page.sourceIntegrity?.sha256&&JSON.stringify(r.context?.policy)===JSON.stringify(policy));
 const succeeded=relevant.some(r=>r.status==='COMPLETE'&&r.output?.offers.some(o=>!o.ambiguous&&o.cadence.value!=='UNKNOWN'&&!['UNKNOWN','ONE_TIME'].includes(o.semantics.value)));
 page.semanticFallback.status=succeeded?'SUCCEEDED':page.semanticFallback.attempted||page.semanticFallback.cached?'UNRESOLVED':'NOT_ATTEMPTED';
 page.semanticFallback.reason??=succeeded?'GROUNDED_INTERPRETATION_RETAINED':page.semanticFallback.attempted||page.semanticFallback.cached?'SEMANTIC_RESULT_UNRESOLVED':page.semanticFallback.eligible?'CAPABILITY_BOUND':(containers.length?'DETERMINISTIC_COMPLETE':'NO_SAFE_BOUNDED_STRUCTURAL_CONTEXT');
}
