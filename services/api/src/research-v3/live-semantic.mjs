// Live Groq evidence understanding; optional translation stays a separate contract.
// Preflight never dispatches IO.
import {createTranslationInterpreter,translationSchema,translationLimits} from './translation.mjs';
import {createEvidenceInterpreter,evidenceSchema,evidenceLimits} from './evidence.mjs';
const liveInterpreters=new WeakSet();
export const isLiveSemanticInterpreter=interpreter=>liveInterpreters.has(interpreter);
export const liveSemanticRevision='V3_GROQ_LOCAL_EVIDENCE_V2';
export function liveTranslationContract(request) {
    return {type:'object',additionalProperties:false,required:['schema','observationId','observationSha256','language','segments'],properties:{schema:{enum:[translationSchema]},observationId:{enum:[request.observation.id]},observationSha256:{enum:[request.observation.sha256]},language:{type:['string','null']},segments:{type:'array',maxItems:translationLimits.segments,items:{type:'object',additionalProperties:false,required:['start','end','original','text','status'],properties:{start:{type:'integer'},end:{type:'integer'},original:{type:'string'},text:{type:'string',maxLength:translationLimits.textCharacters},status:{enum:['FAITHFUL','UNCERTAIN']}}}}}};
}
const object=properties=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
const text={type:'string',maxLength:256},nullableText={type:['string','null'],maxLength:256};
const strings={type:'array',maxItems:16,items:{type:'string',maxLength:1024}};
export function liveSemanticContract(request) {
    const translated=request.translation?{anyOf:[{type:'null'},object({segment:{type:'integer',minimum:0},text:{type:'string'}})]}:{type:'null'};
    const support={type:'array',maxItems:64,items:object({start:{type:'integer',minimum:0},end:{type:'integer',minimum:1},quote:{type:'string'},translated})};
    const charge=object({id:text,money:object({amount:{type:['number','null']},amountText:nullableText,amountSpan:{anyOf:[{type:'null'},object({start:{type:'integer',minimum:0},end:{type:'integer',minimum:1},quote:text})]},currency:nullableText,currencyText:nullableText}),cadence:object({unit:{enum:['MONTHLY','YEARLY','WEEKLY','DAILY','UNKNOWN']},expression:nullableText}),role:{enum:['INTRODUCTORY','ORDINARY','SUBSEQUENT','BENEFIT','CREDIT','DISCOUNT','INSTALLMENT','TAX','OTHER','UNKNOWN']},derivation:{enum:['EXPLICIT','ARITHMETIC','UNKNOWN']},duration:nullableText,qualifiers:strings,ambiguity:{type:'boolean'},support});
    const transition=object({from:text,to:text,kind:{enum:['RECURS_AFTER_INTRO','UNKNOWN']},ambiguity:{type:'boolean'},support});
    const offer=object({presentation:{enum:request.material.presentations.map(p=>p.id)},name:text,service:text,audience:{enum:['CONSUMER','BUSINESS','UNKNOWN']},relationship:{enum:['SUBSCRIPTION','MEMBERSHIP','INSTALLMENT','ONE_TIME','UNKNOWN']},qualifiers:strings,ambiguity:{type:'boolean'},support,market:object({country:nullableText,basis:{enum:['EXPLICIT','UNKNOWN']},ambiguity:{type:'boolean'},support}),charges:{type:'array',maxItems:8,items:charge},transitions:{type:'array',maxItems:8,items:transition}});
    const population=object({scope:{enum:['SERVICE_TOTAL','PROVIDER_TOTAL','OTHER','UNKNOWN']},measure:{enum:['USERS','MEMBERS','CUSTOMERS','SUBSCRIBERS','ACTIVE_USERS','OTHER','UNKNOWN']},kind:{enum:['EXACT','LOWER_BOUND','UNKNOWN']},count:{type:'number',minimum:0},countText:text,scale:{type:'integer',minimum:1},scaleText:nullableText,ambiguity:{type:'boolean'},support});
    const account=object({operation:{enum:['LOGIN','MANAGE_SUBSCRIPTION']},access:{enum:['ACCOUNT','POST_LOGIN','OTHER','UNKNOWN']},polarity:{enum:['AFFIRMED','NEGATED','UNKNOWN']},ambiguity:{type:'boolean'},support});
    const node=object({id:text,destination:(request.material.destinations?.length?{enum:request.material.destinations.map(d=>d.id)}:text),role:{enum:['LOGIN','ACCOUNT','MANAGE','CANCEL','AUTH','UNKNOWN']},ambiguity:{type:'boolean'},support});
    const edge=object({id:text,from:text,to:text,kind:{enum:['AUTHENTICATES_TO','MANAGES_SUBSCRIPTION','CANCELS_SUBSCRIPTION','UNKNOWN']},ambiguity:{type:'boolean'},support});
    return object({accountGraph:object({nodes:{type:'array',maxItems:Math.min(16,request.material.destinations?.length??0),items:node},edges:{type:'array',maxItems:16,items:edge}}),schema:{enum:[evidenceSchema]},observationId:{enum:[request.observation.id]},observationSha256:{enum:[request.observation.sha256]},language:nullableText,translationArtifact:{enum:[null,...(request.translation?[request.translation.artifact]:[])]},service:object({name:text,ambiguity:{type:'boolean'},support,populations:{type:'array',maxItems:16,items:population},account:{type:'array',maxItems:16,items:account}}),offers:{type:'array',maxItems:8,items:offer}});
}
export const createLiveSemanticInterpreter=options=>createLiveAdapter(options,false);
export const createLiveTranslationInterpreter=options=>createLiveAdapter(options,true);
async function createLiveAdapter({env=process.env,client,fetchImpl=fetch,timeoutMs=30000,maxOutputTokens=8192}={},translationOnly=false) {
    const model=env.SAVLIVO_V3_SEMANTIC_MODEL;
    if(typeof model!=='string'||! /^[\w./:-]{1,160}$/.test(model)||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<1||maxOutputTokens>8192)throw Error('V3_LIVE_SEMANTIC_CONFIGURATION_REQUIRED');
    if(!client) {
        if(!env.GROQ_API_KEY?.trim())throw Error('V3_LIVE_SEMANTIC_CREDENTIAL_REQUIRED');
        const {default:Groq}=await import('groq-sdk');
        client=new Groq({apiKey:env.GROQ_API_KEY,baseURL:'https://api.groq.com',maxRetries:0,timeout:timeoutMs,logLevel:'off',logger:{debug(){},info(){},warn(){},error(){}},fetch:async(url,options)=>{
            if(String(url)!=='https://api.groq.com/openai/v1/chat/completions'||options.method!=='POST')throw Error(translationOnly?'TRANSLATION_ENDPOINT_NOT_ALLOWED':'UNDERSTANDING_ENDPOINT_NOT_ALLOWED');
            const response=await fetchImpl(url,{...options,redirect:'error'}),reader=response.body?.getReader();
            if(!reader)throw Error(translationOnly?'TRANSLATION_RESPONSE_UNAVAILABLE':'UNDERSTANDING_RESPONSE_UNAVAILABLE');
            const chunks=[];let bytes=0;
            try {
                for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>131072)throw Error(translationOnly?'TRANSLATION_RESPONSE_BOUND':'UNDERSTANDING_RESPONSE_BOUND');chunks.push(value);}
                return new Response(Buffer.concat(chunks),{status:response.status,statusText:response.statusText,headers:response.headers});
            } finally {await reader.cancel().catch(()=>{});}
        }});
    }
    const adapter={mode:'LIVE',provider:'groq',model,revision:translationOnly?'V3_GROQ_TRANSLATION_V1':liveSemanticRevision,timeoutMs,maxOutputTokens,maxRetries:0};
    const factory=translationOnly?createTranslationInterpreter:createEvidenceInterpreter;
    const interpreter=factory({adapter,timeoutMs,complete:async(request,{signal})=>{
        const payload={model,temperature:0,max_completion_tokens:maxOutputTokens,response_format:{type:'json_schema',json_schema:{name:translationOnly?'v3_source_bound_translation':'v3_source_bound_evidence_v2',strict:true,schema:translationOnly?liveTranslationContract(request):liveSemanticContract(request)}},messages:[{role:'system',content:request.instructions},{role:'user',content:JSON.stringify(request)}]};
        const requestBytes=Buffer.byteLength(JSON.stringify(payload));
        if(!translationOnly&&requestBytes>24576)throw Error('EVIDENCE_REQUEST_BOUND');
        let result;
        try {result=await client.chat.completions.create(payload,{signal});}
        catch(error) {
            const type=error.error?.error?.type??error.error?.type;
            const requestId=error.request_id??error.headers?.get?.('x-request-id')??error.headers?.['x-request-id'];
            error.v3Diagnostics={requestBytes,inputCharacters:request.material.segments.reduce((n,s)=>n+s.text.length,0),maxOutputTokens,schema:payload.response_format.json_schema.name,unit:request.unit?.id??null,providerMessageCategory:Number.isInteger(error.status)?'HTTP_API_REJECTION':'TRANSPORT_OR_CLIENT_FAILURE',...(['invalid_request_error','rate_limit_error','authentication_error','server_error'].includes(type)?{apiType:type}:{}),...(typeof requestId==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(requestId)&&!['GROQ_API_KEY','TAVILY_API_KEY','DECODO_USERNAME','DECODO_PASSWORD'].some(k=>env[k]&&requestId.includes(env[k]))?{requestId}:{})};
            throw error;
        }
        if(result.choices?.some(c=>c.message?.refusal))throw Error(translationOnly?'TRANSLATION_REFUSAL':'UNDERSTANDING_REFUSAL');
        if(result.choices?.length!==1||result.choices[0].finish_reason!=='stop')throw Error(translationOnly?'TRANSLATION_RESPONSE_INCOMPLETE':'UNDERSTANDING_RESPONSE_INCOMPLETE');
        return result.choices[0].message?.content;
    }});
    liveInterpreters.add(interpreter);
    return interpreter;
}
