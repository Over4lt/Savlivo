// V3-only Groq adapter. Import/preflight never dispatches model or research IO.
import {createSemanticInterpreter,semanticSchema,interpretationLimits} from './semantic.mjs';
const liveInterpreters=new WeakSet();
export const isLiveSemanticInterpreter=interpreter=>liveInterpreters.has(interpreter);
export const liveSemanticRevision='V3_GROQ_SEMANTIC_V1';
const nullable=type=>({type:[type,'null']});
const population={anyOf:[{type:'null'},{type:'object',additionalProperties:false,required:['scope','measure','kind','count'],properties:{scope:{enum:['SERVICE_TOTAL','OTHER','UNKNOWN']},measure:{enum:['USERS','MEMBERS','CUSTOMERS','SUBSCRIBERS','ACTIVE_USERS','OTHER','UNKNOWN']},kind:{enum:['EXACT','LOWER_BOUND','UNKNOWN']},count:{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER}}}]};
const fields={serviceId:nullable('string'),population,login:nullable('boolean'),management:nullable('boolean'),id:nullable('string'),amount:nullable('number'),currency:nullable('string'),cadence:{enum:['MONTHLY','YEARLY','WEEKLY','DAILY','UNKNOWN',null]},consumer:nullable('boolean'),relationship:{enum:['SUBSCRIPTION','MEMBERSHIP','INSTALLMENT','ONE_TIME','UNKNOWN',null]},role:{enum:['ORDINARY','TRIAL','BENEFIT','CREDIT','DISCOUNT','UNKNOWN',null]},amountDerivation:{enum:['EXPLICIT','ARITHMETIC','UNKNOWN',null]},market:nullable('string'),conditions:nullable('string')};
const support={type:'array',minItems:1,maxItems:interpretationLimits.supports,items:{type:'object',additionalProperties:false,required:['start','end','quote'],properties:{start:{type:'integer',minimum:0},end:{type:'integer',minimum:1},quote:{type:'string',minLength:1,maxLength:interpretationLimits.quoteCharacters}}}};
export function liveSemanticContract(request) {
    return {type:'object',additionalProperties:false,required:['schema','observationId','observationSha256','language','claims'],properties:{schema:{enum:[semanticSchema]},observationId:{enum:[request.observation.id]},observationSha256:{enum:[request.observation.sha256]},language:nullable('string'),claims:{type:'array',maxItems:interpretationLimits.claims,items:{anyOf:Object.entries(fields).map(([field,value])=>{
        const scope=['serviceId','population','login','management'].includes(field)?'SERVICE':'OFFER';
        return {type:'object',additionalProperties:false,required:['scope','presentation','field','value','status','support'],properties:{scope:{enum:[scope]},presentation:scope==='SERVICE'?{type:'null'}:{type:'string'},field:{enum:[field]},value,status:{enum:['EXPLICIT','AMBIGUOUS']},support}};
    })}}}};
}
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===[...keys].sort().join(',');
// Local validation remains mandatory even if the remote structured-output feature
// is unavailable or misbehaves. Only normalized candidate records cross the boundary.
function normalize(raw,request) {
    if(typeof raw!=='string'||Buffer.byteLength(raw)>interpretationLimits.responseBytes)throw Error('SEMANTIC_RESPONSE_BOUND');
    const e=JSON.parse(raw);
    if(!exact(e,['schema','observationId','observationSha256','language','claims'])||e.schema!==semanticSchema||e.observationId!==request.observation.id||e.observationSha256!==request.observation.sha256||!(e.language===null||typeof e.language==='string')||!Array.isArray(e.claims)||e.claims.length>interpretationLimits.claims)throw Error('INVALID_SEMANTIC_ENVELOPE');
    for(const c of e.claims) {
        if(!exact(c,['scope','presentation','field','value','status','support'])||!['SERVICE','OFFER'].includes(c.scope)||(c.scope==='SERVICE'?c.presentation!==null:typeof c.presentation!=='string'))throw Error('INVALID_SEMANTIC_CLAIM');
        // Full original text segments prevent a model from clipping a qualifier
        // from a supporting sentence. Existing span/body validation is authoritative.
        if(!Array.isArray(c.support)||!c.support.every(s=>request.material.segments.some(t=>s.start===t.start&&s.end===t.end&&s.quote===t.text)))throw Error('INVALID_SEMANTIC_CLAIM');
        if(c.scope==='OFFER') {
            const p=request.material.presentations.find(p=>p.id===c.presentation);
            const segments=p?request.material.segments.filter(s=>s.start>=p.start&&s.end<=p.end):[];
            if(!segments.length||segments.some(t=>!c.support.some(s=>s.start===t.start&&s.end===t.end&&s.quote===t.text)))throw Error('INVALID_SEMANTIC_CLAIM');
        } else delete c.presentation;
    }
    return e;
}

export async function createLiveSemanticInterpreter({env=process.env,client,fetchImpl=fetch,timeoutMs=30000,maxOutputTokens=8192}={}) {
    const model=env.SAVLIVO_V3_SEMANTIC_MODEL;
    if(typeof model!=='string'||! /^[\w./:-]{1,160}$/.test(model)||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<1||maxOutputTokens>8192)throw Error('V3_LIVE_SEMANTIC_CONFIGURATION_REQUIRED');
    if(!client) {
        if(!env.GROQ_API_KEY?.trim())throw Error('V3_LIVE_SEMANTIC_CREDENTIAL_REQUIRED');
        const {default:Groq}=await import('groq-sdk');
        client=new Groq({apiKey:env.GROQ_API_KEY,baseURL:'https://api.groq.com',maxRetries:0,timeout:timeoutMs,logLevel:'off',logger:{debug(){},info(){},warn(){},error(){}},fetch:async(url,options)=>{
            if(String(url)!=='https://api.groq.com/openai/v1/chat/completions'||options.method!=='POST')throw Error('SEMANTIC_ENDPOINT_NOT_ALLOWED');
            const response=await fetchImpl(url,{...options,redirect:'error'}),reader=response.body?.getReader();
            if(!reader)throw Error('SEMANTIC_RESPONSE_UNAVAILABLE');
            const chunks=[];let bytes=0;
            try {
                for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>131072)throw Error('SEMANTIC_RESPONSE_BOUND');chunks.push(value);}
                return new Response(Buffer.concat(chunks),{status:response.status,statusText:response.statusText,headers:response.headers});
            } finally {await reader.cancel().catch(()=>{});}
        }});
    }
    const adapter={mode:'LIVE',provider:'groq',model,revision:liveSemanticRevision,timeoutMs,maxOutputTokens,maxRetries:0};
    const interpreter=createSemanticInterpreter({model,adapter,timeoutMs,complete:async(request,{signal})=>{
        const result=await client.chat.completions.create({model,temperature:0,max_completion_tokens:maxOutputTokens,response_format:{type:'json_schema',json_schema:{name:'v3_source_bound_candidates',strict:true,schema:liveSemanticContract(request)}},messages:[{role:'system',content:request.instructions+' Return only the strict JSON contract. No hidden reasoning or truth verdicts. presentation is null for SERVICE. Quote complete supplied original segments, never clipped phrases. For each OFFER field include every segment inside its supplied presentation so limiting qualifiers cannot be omitted. Use AMBIGUOUS whenever a qualifier cannot be represented or support exceeds bounds. Language is descriptive only; it cannot support market. Do not infer identity merely from provider ownership.'},{role:'user',content:JSON.stringify(request)}]},{signal});
        if(result.choices?.length!==1||result.choices[0].finish_reason!=='stop'||result.choices[0].message?.refusal)throw Error('INVALID_SEMANTIC_ENVELOPE');
        return normalize(result.choices[0].message?.content,request);
    }});
    liveInterpreters.add(interpreter);
    return interpreter;
}
