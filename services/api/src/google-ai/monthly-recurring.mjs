import {buildGoogleAiQuery} from './v4-query.mjs';
import {parseSimplifiedRecovery,simplifiedRecoveryEligibility,simplifiedRecoveryPrompt,simplifiedRecoveryLimits} from './simplified-recovery.mjs';

export const googleAiResearchStatuses=Object.freeze([
  'GOOGLE_AI_SUCCESS',
  'GOOGLE_AI_NO_PRICE',
  'GOOGLE_AI_ACCESS_FAILURE',
  'GOOGLE_AI_MALFORMED_RESPONSE'
]);

export const googleAiDefaults=Object.freeze({
  endpoint:'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
  model:'gemini-3.8-flash',
  timeoutMs:120_000,
  maxResponseBytes:1_048_576,
  maxRequests:2
});

const planSchema={
  type:'object',additionalProperties:false,
  properties:{
    planName:{type:'string'},amount:{type:['number','null']},currency:{type:['string','null']},
    paymentCadence:{type:'string'},commitment:{type:['string','null']},
    ordinaryRecurringPrice:{type:['number','null']},introPrice:{type:['number','null']},
    introDuration:{type:['string','null']},sourceUrl:{type:['string','null']},
    sourceEvidence:{type:['string','null']},marketEvidence:{type:['string','null']},
    billingBasis:{type:['string','null']},annualOnly:{type:'boolean'},freeTier:{type:'boolean'},
    summary:{type:['string','null']},warnings:{type:'array',items:{type:'string'},maxItems:16}
  },
  required:['planName','amount','currency','paymentCadence','commitment','ordinaryRecurringPrice','introPrice','introDuration','sourceUrl','sourceEvidence','marketEvidence','billingBasis','annualOnly','freeTier','summary','warnings']
};
export const googleAiResponseSchema=Object.freeze({
  type:'object',additionalProperties:false,
  properties:{
    provider:{type:'string'},market:{type:'string'},plans:{type:'array',items:planSchema,maxItems:64},
    sources:{type:'array',items:{type:'object',additionalProperties:false,properties:{title:{type:'string'},url:{type:'string'}},required:['title','url']},maxItems:64},
    warnings:{type:'array',items:{type:'string'},maxItems:32}
  },required:['provider','market','plans','sources','warnings']
});

const clean=(value,max=512)=>typeof value==='string'&&value.trim()&&value.length<=max?value.trim().replace(/\s+/g,' '):null;
const finite=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const safeUrl=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}};
const sameProvider=(left,right)=>String(left??'').normalize('NFKC').trim().toLowerCase()===String(right??'').normalize('NFKC').trim().toLowerCase();
const monthly=value=>/^(?:MONTH|MONTHLY|MONTHLY_RECURRING)$/.test(String(value??'').trim().toUpperCase());
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key))&&keys.every(key=>own(value,key));
const nullableString=(value,max)=>value===null||Boolean(clean(value,max));
const stringArray=(value,maxItems,maxLength)=>Array.isArray(value)&&value.length<=maxItems&&value.every(item=>Boolean(clean(item,maxLength)));
const responseKeys=['provider','market','plans','sources','warnings'];
const planKeys=planSchema.required;
const sourceKeys=['title','url'];

function citations(response){
  const rows=[];
  for(const candidate of response?.candidates??[])for(const chunk of candidate?.groundingMetadata?.groundingChunks??[]){
    const url=safeUrl(chunk?.web?.uri);
    if(url)rows.push({title:clean(chunk?.web?.title,300)??'',url});
  }
  return [...new Map(rows.map(row=>[row.url,row])).values()].slice(0,64);
}

const policyFinishReasons=new Set(['SAFETY','BLOCKLIST','PROHIBITED_CONTENT','SPII','RECITATION']);
const policyBlocked=response=>policyFinishReasons.has(response?.promptFeedback?.blockReason)||Array.isArray(response?.candidates)&&response.candidates.some(candidate=>policyFinishReasons.has(candidate?.finishReason));

function outputText(response){
  const values=[];
  for(const candidate of response?.candidates??[])for(const part of candidate?.content?.parts??[])if(typeof part?.text==='string')values.push(part.text);
  return values.length?values.join(''):null;
}

export function extractGoogleAiJson(text){
  if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text)>262_144)throw Error('OUTPUT_TEXT_INVALID');
  const trimmed=text.trim();
  const fenced=/^```json[\t ]*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
  const candidate=fenced?fenced[1].trim():trimmed;
  try{return JSON.parse(candidate);}catch{throw Error('OUTPUT_JSON_INVALID');}
}

function validationErrors(parsed,{providerName,targetMarket}){
  const errors=[];
  if(!exactKeys(parsed,responseKeys))return ['OUTPUT_CONTRACT_INVALID'];
  if(typeof parsed.provider!=='string'||!clean(parsed.provider,120)||!sameProvider(parsed.provider,providerName))errors.push('PROVIDER_INVALID');
  if(typeof parsed.market!=='string'||parsed.market.toUpperCase()!==targetMarket)errors.push('MARKET_INVALID');
  if(!Array.isArray(parsed.plans)||parsed.plans.length>64)errors.push('PLANS_INVALID');
  else parsed.plans.forEach((row,index)=>{
    const prefix=`PLAN_${index}`;
    if(!exactKeys(row,planKeys)){errors.push(`${prefix}_CONTRACT_INVALID`);return;}
    if(typeof row.planName!=='string'||!clean(row.planName,300))errors.push(`${prefix}_NAME_INVALID`);
    if(typeof row.paymentCadence!=='string'||!clean(row.paymentCadence,80))errors.push(`${prefix}_CADENCE_INVALID`);
    if(row.currency!==null&&(typeof row.currency!=='string'||!/^[A-Za-z]{3}$/.test(row.currency)))errors.push(`${prefix}_CURRENCY_INVALID`);
    for(const field of ['amount','ordinaryRecurringPrice','introPrice'])if(row[field]!==null&&finite(row[field])===null)errors.push(`${prefix}_${field.toUpperCase()}_INVALID`);
    for(const [field,max] of [['commitment',512],['introDuration',512],['sourceEvidence',2000],['marketEvidence',1000],['billingBasis',500],['summary',1000]])if(!nullableString(row[field],max))errors.push(`${prefix}_${field.toUpperCase()}_INVALID`);
    if(row.sourceUrl!==null&&(typeof row.sourceUrl!=='string'||!safeUrl(row.sourceUrl)))errors.push(`${prefix}_SOURCE_URL_INVALID`);
    if(typeof row.annualOnly!=='boolean'||typeof row.freeTier!=='boolean')errors.push(`${prefix}_CLASSIFICATION_INVALID`);
    if(!stringArray(row.warnings,16,300))errors.push(`${prefix}_WARNINGS_INVALID`);
  });
  if(!Array.isArray(parsed.sources)||parsed.sources.length>64)errors.push('SOURCES_INVALID');
  else parsed.sources.forEach((row,index)=>{
    if(!exactKeys(row,sourceKeys)||!clean(row?.title,300)||typeof row.url!=='string'||!safeUrl(row.url))errors.push(`SOURCE_${index}_INVALID`);
  });
  if(!stringArray(parsed.warnings,32,300))errors.push('WARNINGS_INVALID');
  return [...new Set(errors)];
}

function normalizePlan(row,market,grounding){
  const sourceUrl=row.sourceUrl===null?null:safeUrl(row.sourceUrl);
  const sourceReferences=[...new Set([sourceUrl,...grounding.map(value=>value.url)].filter(Boolean))];
  return {
    planName:clean(row.planName,300),amount:finite(row.amount),currency:row.currency===null?null:row.currency.toUpperCase(),paymentCadence:clean(row.paymentCadence,80),
    commitment:row.commitment===null?null:clean(row.commitment),ordinaryRecurringPrice:finite(row.ordinaryRecurringPrice),
    introPrice:finite(row.introPrice),introDuration:row.introDuration===null?null:clean(row.introDuration),
    sourceUrl,sourceEvidence:row.sourceEvidence===null?null:clean(row.sourceEvidence,2000),
    marketEvidence:row.marketEvidence===null?null:clean(row.marketEvidence,1000),billingBasis:row.billingBasis===null?null:clean(row.billingBasis,500),
    annualOnly:row.annualOnly,freeTier:row.freeTier,summary:row.summary===null?null:clean(row.summary,1000),
    warnings:[...new Set(row.warnings.map(value=>clean(value,300)).filter(Boolean))],market,sourceReferences
  };
}

function safeUsage(usage){
  const number=name=>Number.isSafeInteger(usage?.[name])&&usage[name]>=0?usage[name]:null;
  return {inputTokens:number('promptTokenCount'),outputTokens:number('candidatesTokenCount'),thoughtTokens:number('thoughtsTokenCount'),toolUsePromptTokens:number('toolUsePromptTokenCount'),totalTokens:number('totalTokenCount'),googleSearchCalls:null};
}

export function normalizeGoogleAiResponse(response,{providerName,targetMarket,query,model,requestCount,startedAt,finishedAt,additionalCitations=[]}){
  if(!Array.isArray(response?.candidates))throw Error('GENERATE_CONTENT_INCOMPLETE');
  const parsed=extractGoogleAiJson(outputText(response));
  const errors=validationErrors(parsed,{providerName,targetMarket});
  if(errors.length){const error=Error('OUTPUT_CONTRACT_INVALID');error.validationErrors=errors;throw error;}
  const grounding=[...new Map([...additionalCitations,...citations(response)].map(row=>[row.url,row])).values()].slice(0,64);
  const sources=[...new Map([...parsed.sources.map(row=>({title:clean(row.title,300)??'',url:safeUrl(row.url)})),...grounding].map(row=>[row.url,row])).values()].slice(0,64);
  const plans=parsed.plans.map(row=>normalizePlan(row,targetMarket,grounding));
  const timestamp=finishedAt,aiResult={provider:providerName,market:targetMarket,plans,sources,warnings:[...new Set(parsed.warnings.map(value=>clean(value,300)).filter(Boolean))],timestamp,requestCount};
  const usable=plans.some(row=>monthly(row.paymentCadence)&&!row.annualOnly&&!row.freeTier&&Number(row.ordinaryRecurringPrice??row.amount)>0&&/^[A-Z]{3}$/.test(row.currency??''));
  const finishReasons=response.candidates.map(candidate=>clean(candidate?.finishReason,80)).filter(Boolean);
  return {status:usable?'GOOGLE_AI_SUCCESS':'GOOGLE_AI_NO_PRICE',aiResult,audit:{schemaVersion:1,query,researchProvider:'GOOGLE_GEMINI_API_SEARCH_GROUNDED',model,timestamp,normalizedAnswer:aiResult,citations:sources,groundingCitations:grounding,request:{requestCount,startedAt,finishedAt,runtimeMs:Date.parse(finishedAt)-Date.parse(startedAt),responseId:clean(response.responseId,256),status:finishReasons.join(',')||'COMPLETED',usage:safeUsage(response.usageMetadata)}}};
}

async function boundedJson(response,maxBytes){
  const reader=response.body?.getReader();if(!reader)throw Error('RESPONSE_BODY_UNAVAILABLE');const chunks=[];let bytes=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>maxBytes)throw Error('RESPONSE_TOO_LARGE');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('RESPONSE_JSON_INVALID');}
}

const jsonContract=`Return ONLY one JSON object with exactly these top-level fields: provider, market, plans, sources, warnings. Each plan must contain exactly: planName, amount, currency, paymentCadence, commitment, ordinaryRecurringPrice, introPrice, introDuration, sourceUrl, sourceEvidence, marketEvidence, billingBasis, annualOnly, freeTier, summary, warnings. Use null for unknown nullable values. amount, ordinaryRecurringPrice, and introPrice must be non-negative JSON numbers or null. annualOnly and freeTier must be booleans. sources must contain objects with exactly title and HTTPS url. warnings and every plan's warnings must be arrays of strings. Do not wrap the JSON in prose or markdown.`;

function requestBody({objective,validationFailures}){
  const refinement=Array.isArray(validationFailures)&&validationFailures.length>0;
  const input=refinement
    ? `${objective}\n\nValidation errors: ${validationFailures.join(', ')}. Return valid JSON only.`
    : objective;
  return {
    systemInstruction:{parts:[{text:'Use current Google Search-grounded web research. Treat search results as leads, prefer first-party provider sources, quote exact supporting text when available, and never invent a price.'}]},
    contents:[{role:'user',parts:[{text:input}]}],
    tools:[{googleSearch:{}}],
    generationConfig:{maxOutputTokens:8192}
  };
}

const boundedFailureReasons=values=>[...new Set((values??[]).filter(value=>typeof value==='string'&&/^[A-Z0-9_]{1,80}$/.test(value)))].slice(0,8);
function failureAudit({query,model,startedAt,finishedAt,requestCount,status,citations:sourceCitations=[],usage=null,failureReasons=[]}){
  return {schemaVersion:1,query,researchProvider:'GOOGLE_GEMINI_API_SEARCH_GROUNDED',model,timestamp:finishedAt,normalizedAnswer:null,citations:sourceCitations,request:{requestCount,startedAt,finishedAt,runtimeMs:Math.max(0,Date.parse(finishedAt)-Date.parse(startedAt)),status,usage,normalizationFailures:boundedFailureReasons(failureReasons)}};
}

export async function researchMonthlyRecurringWithGoogleAi({providerName,targetMarket,providerNamespace=null,apiKey,fetchImpl=fetch,clock=()=>new Date().toISOString(),endpoint=googleAiDefaults.endpoint,model=googleAiDefaults.model,timeoutMs=googleAiDefaults.timeoutMs,maxResponseBytes=googleAiDefaults.maxResponseBytes,maxRequests=googleAiDefaults.maxRequests}={}){
  const provider=clean(providerName,120),market=clean(targetMarket,8)?.toUpperCase();
  if(!provider||!/^[A-Z]{2}$/.test(market??''))throw Error('GOOGLE_AI_RESEARCH_INPUT_INVALID');
  const query=buildGoogleAiQuery({providerName:provider,targetMarket:market,providerNamespace}),objective=`${query}\n\n${jsonContract}`,startedAt=clock();
  if(typeof apiKey!=='string'||!apiKey.trim())return {status:'GOOGLE_AI_ACCESS_FAILURE',aiResult:null,audit:failureAudit({query,model,startedAt,finishedAt:startedAt,requestCount:0,status:'CREDENTIAL_UNAVAILABLE'})};
  if(!/^gemini-[a-z0-9.-]{1,80}$/.test(model)||!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>2)throw Error('GOOGLE_AI_RESEARCH_CONFIG_INVALID');
  let requests=0,lastMalformed='MALFORMED_RESPONSE',validationFailures=[],retainedCitations=[],retainedUsage=null;
  while(requests<maxRequests){
    requests++;let response;
    try{response=await fetchImpl(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:{'content-type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify(requestBody({objective,validationFailures:requests>1?validationFailures:[]}))});}
    catch{const finishedAt=clock();return {status:'GOOGLE_AI_ACCESS_FAILURE',aiResult:null,audit:failureAudit({query,model,startedAt,finishedAt,requestCount:requests,status:'TRANSPORT_FAILURE',citations:retainedCitations})};}
    if(!response.ok){const finishedAt=clock();return {status:'GOOGLE_AI_ACCESS_FAILURE',aiResult:null,audit:failureAudit({query,model,startedAt,finishedAt,requestCount:requests,status:'HTTP_'+response.status,citations:retainedCitations})};}
    let generated;
    try{generated=await boundedJson(response,maxResponseBytes);}catch{lastMalformed='RESPONSE_INVALID';validationFailures=['GENERATE_CONTENT_RESPONSE_INVALID'];continue;}
    if(policyBlocked(generated)){const finishedAt=clock();return {status:'GOOGLE_AI_ACCESS_FAILURE',aiResult:null,audit:failureAudit({query,model,startedAt,finishedAt,requestCount:requests,status:'POLICY_BLOCK',failureReasons:['POLICY_BLOCK']})};}
    retainedCitations=[...new Map([...retainedCitations,...citations(generated)].map(row=>[row.url,row])).values()].slice(0,64);
    retainedUsage=safeUsage(generated.usageMetadata);
    const finishedAt=clock();
    try{return normalizeGoogleAiResponse(generated,{providerName:provider,targetMarket:market,query,model,requestCount:requests,startedAt,finishedAt,additionalCitations:retainedCitations});}
    catch(error){lastMalformed='NORMALIZATION_FAILED';validationFailures=boundedFailureReasons(Array.isArray(error?.validationErrors)&&error.validationErrors.length?error.validationErrors:[error?.message??'OUTPUT_INVALID']);if(!validationFailures.length)validationFailures=['OUTPUT_INVALID'];}
  }
  const finishedAt=clock();return {status:'GOOGLE_AI_MALFORMED_RESPONSE',aiResult:null,audit:failureAudit({query,model,startedAt,finishedAt,requestCount:requests,status:lastMalformed,citations:retainedCitations,usage:retainedUsage,failureReasons:validationFailures})};
}


// The strict request remains the primary authority. Recovery has one separate,
// shared-budget request and returns only Suggested/discovery material.
export async function researchMonthlyRecurringWithRecovery(options={}){
 const strict=await researchMonthlyRecurringWithGoogleAi(options),maxTotalRequests=options.maxTotalRequests??3,eligibility=simplifiedRecoveryEligibility(strict,{maxTotalRequests});
 const recovery={attempted:false,reason:eligibility.reason,outcome:eligibility.eligible?'RECOVERY_NOT_STARTED':'NOT_ELIGIBLE',requestCount:0,aiResult:null,audit:null,diagnostics:[]};
 if(!eligibility.eligible)return {...strict,recovery};
 const provider=options.providerName.trim().replace(/\s+/g,' '),targetMarket=options.targetMarket.toUpperCase(),apiKey=options.apiKey,fetchImpl=options.fetchImpl??fetch,clock=options.clock??(()=>new Date().toISOString()),endpoint=options.endpoint??googleAiDefaults.endpoint,model=options.model??googleAiDefaults.model,timeoutMs=options.timeoutMs??googleAiDefaults.timeoutMs,maxResponseBytes=Math.min(options.maxResponseBytes??googleAiDefaults.maxResponseBytes,googleAiDefaults.maxResponseBytes),query=simplifiedRecoveryPrompt(provider,targetMarket),startedAt=clock();
 recovery.attempted=true;recovery.requestCount=simplifiedRecoveryLimits.requests;
 const finish=(outcome,{aiResult=null,diagnostics=[],usage=null}={})=>{const finishedAt=clock();return {...strict,recovery:{...recovery,outcome,aiResult,diagnostics,audit:{schemaVersion:1,query,researchProvider:'GOOGLE_GEMINI_API_SEARCH_GROUNDED',model,timestamp:finishedAt,request:{requestCount:1,startedAt,finishedAt,runtimeMs:Math.max(0,Date.parse(finishedAt)-Date.parse(startedAt)),status:outcome,usage}}}};};
 let response;
 try{response=await fetchImpl(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:{'content-type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({systemInstruction:{parts:[{text:'Use Google Search grounding. Return concise JSON. Treat source URLs as discovery leads, and never infer monthly billing from an annual equivalent.'}]},contents:[{role:'user',parts:[{text:query}]}],tools:[{googleSearch:{}}],generationConfig:{maxOutputTokens:4096}})});}catch{return finish('RECOVERY_TRANSPORT_FAILURE');}
 if(!response.ok)return finish('RECOVERY_HTTP_FAILURE',{diagnostics:[{reason:'HTTP_STATUS',status:response.status}]});
 let generated;try{generated=await boundedJson(response,maxResponseBytes);}catch{return finish('RECOVERY_RESPONSE_INVALID');}
 const timestamp=clock(),parsed=parseSimplifiedRecovery(generated,{providerName:provider,targetMarket,requestCount:1,timestamp});
 return finish(parsed.outcome,{aiResult:parsed.aiResult,diagnostics:parsed.diagnostics,usage:safeUsage(generated.usageMetadata)});
}
