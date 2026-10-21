export const suggestedOnlyRequestCeiling=2;

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
