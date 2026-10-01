// Live Groq evidence understanding; optional translation stays a separate contract.
// Preflight never dispatches IO.
import {createTranslationInterpreter,translationSchema,translationLimits} from './translation.mjs';
import {createEvidenceInterpreter} from './evidence.mjs';
import {semanticWireSchema,wireInput,semanticWireInstructions,reconstructWire,validateWire,wireRevision} from './semantic-wire.mjs';
const liveInterpreters=new WeakSet();
export const isLiveSemanticInterpreter=interpreter=>liveInterpreters.has(interpreter);
export const liveSemanticRevision=wireRevision;
export function liveTranslationContract(request) {
    return {type:'object',additionalProperties:false,required:['schema','observationId','observationSha256','language','segments'],properties:{schema:{enum:[translationSchema]},observationId:{enum:[request.observation.id]},observationSha256:{enum:[request.observation.sha256]},language:{type:['string','null']},segments:{type:'array',maxItems:translationLimits.segments,items:{type:'object',additionalProperties:false,required:['start','end','original','text','status'],properties:{start:{type:'integer'},end:{type:'integer'},original:{type:'string'},text:{type:'string',maxLength:translationLimits.textCharacters},status:{enum:['FAITHFUL','UNCERTAIN']}}}}}};
}
export const liveSemanticContract=()=>semanticWireSchema();
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
        const input=translationOnly?request:wireInput(request);
        const payload={model,temperature:0,max_completion_tokens:maxOutputTokens,response_format:{type:'json_schema',json_schema:{name:translationOnly?'v3_source_bound_translation':'v3_semantic_unit_v1',strict:true,schema:translationOnly?liveTranslationContract(request):liveSemanticContract(request)}},messages:[{role:'system',content:translationOnly?request.instructions:semanticWireInstructions},{role:'user',content:JSON.stringify(input)}]};
        const requestBytes=Buffer.byteLength(JSON.stringify(payload));
        if(!translationOnly&&requestBytes>24576)throw Error('EVIDENCE_REQUEST_BOUND');
        let result;
        try {result=await client.chat.completions.create(payload,{signal});}
        catch(error) {
            const type=error.error?.error?.type??error.error?.type;
            const requestId=error.request_id??error.headers?.get?.('x-request-id')??error.headers?.['x-request-id'];
            const generation=error.error?.error?.failed_generation??error.error?.failed_generation;
            let generationDiagnostic={};
            if(!translationOnly&&typeof generation==='string'&&Buffer.byteLength(generation)<=32768) {
                try {validateWire(JSON.parse(generation));generationDiagnostic={failedGenerationJson:true,wireValidation:'WIRE_VALID'};}
                catch(e) {generationDiagnostic={failedGenerationJson:!(e instanceof SyntaxError),wireValidation:/^WIRE_[A-Z_]+$/.test(e.message)?e.message:'WIRE_JSON_INVALID'};}
            }
            error.v3Diagnostics={...generationDiagnostic,requestBytes,inputCharacters:request.material.segments.reduce((n,s)=>n+s.text.length,0),maxOutputTokens,schema:payload.response_format.json_schema.name,unit:request.unit?.id??null,providerMessageCategory:Number.isInteger(error.status)?'HTTP_API_REJECTION':'TRANSPORT_OR_CLIENT_FAILURE',...(['invalid_request_error','rate_limit_error','authentication_error','server_error'].includes(type)?{apiType:type}:{}),...(typeof requestId==='string'&&/^[a-zA-Z0-9_-]{1,128}$/.test(requestId)&&!['GROQ_API_KEY','TAVILY_API_KEY','DECODO_USERNAME','DECODO_PASSWORD'].some(k=>env[k]&&requestId.includes(env[k]))?{requestId}:{})};
            throw error;
        }
        if(result.choices?.some(c=>c.message?.refusal))throw Error(translationOnly?'TRANSLATION_REFUSAL':'UNDERSTANDING_REFUSAL');
        if(result.choices?.length!==1||result.choices[0].finish_reason!=='stop')throw Error(translationOnly?'TRANSLATION_RESPONSE_INCOMPLETE':'UNDERSTANDING_RESPONSE_INCOMPLETE');
        return translationOnly?result.choices[0].message?.content:reconstructWire(request,result.choices[0].message?.content);
    }});
    liveInterpreters.add(interpreter);
    return interpreter;
}
