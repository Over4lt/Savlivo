export const suggestedOnlyRequestCeiling=1;

export function researchModeOf(config){
 const value=config?.researchMode??'standard';
 if(!['standard','suggested_only'].includes(value))throw Error('INVALID_PRICE_RESEARCH_MODE');
 return value;
}

export function perTargetRequestCeiling(config){
 return researchModeOf(config)==='suggested_only'?suggestedOnlyRequestCeiling:96;
}

export function modeCapabilities(mode,capabilities){
 return mode==='suggested_only'?{direct:false,tavily:false,decodo:false,browser:false,groq:false}:capabilities;
}
