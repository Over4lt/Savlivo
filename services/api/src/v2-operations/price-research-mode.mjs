export const suggestedOnlyRequestCeiling=2;

// Missing permissions belong to older frozen jobs, whose behavior must not
// change on resume. New jobs freeze both choices in their preflight.
export function aiProvidersOf(config){
 const value=config?.aiProviders;
 if(value===undefined)return {gemini:true,openai:true};
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||
    Object.keys(value).some(key=>!['gemini','openai'].includes(key))||
    typeof value.gemini!=='boolean'||typeof value.openai!=='boolean')throw Error('INVALID_PRICE_RESEARCH_AI_PROVIDERS');
 return {gemini:value.gemini,openai:value.openai};
}

export function aiRestrictedEnvironment(base,config){
 const env={...base},allowed=aiProvidersOf(config);
 if(!allowed.gemini)delete env.GEMINI_API_KEY;
 if(!allowed.openai)delete env.OPENAI_API_KEY;
 return env;
}

export function researchModeOf(config){
 const value=config?.researchMode??'standard';
 if(!['standard','suggested_only'].includes(value))throw Error('INVALID_PRICE_RESEARCH_MODE');
 return value;
}

export function perTargetRequestCeiling(config){
 // Older single-target jobs omitted this field under their one-request
 // contract. New preflights explicitly freeze the two-request ceiling.
 return researchModeOf(config)==='suggested_only'?(config?.perTargetRequestCeiling===2?2:1):96;
}

export function modeCapabilities(mode,capabilities){
 return mode==='suggested_only'?{direct:false,tavily:false,decodo:false,browser:false,groq:false}:capabilities;
}
