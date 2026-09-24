// One explicit permission contract. Availability and eligibility are separate.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
export const capabilityNames=Object.freeze(['direct','tavily','decodo','browser','groq']);
export const defaults=Object.freeze({direct:true,tavily:true,decodo:true,browser:false,groq:false});
export const capabilityLimits=Object.freeze({browserPerService:1,browserPerRun:20,groqPerService:2,groqPerRun:40});
export function resolveCapabilities(value,objective='MATURE_LIFECYCLE'){
 const v=value===undefined?{...defaults,...(objective==='LOGIN_MANAGE'?{decodo:false}:{})}:value;
 if(!v||Array.isArray(v)||Object.keys(v).length!==5||capabilityNames.some(k=>typeof v[k]!=='boolean')||Object.keys(v).some(k=>!capabilityNames.includes(k)))throw Error('INVALID_CAPABILITIES');
 if(objective==='LOGIN_MANAGE'&&(v.decodo||v.browser||v.groq))throw Error('UNSUPPORTED_LOGIN_MANAGE_CAPABILITY');
 return Object.freeze(Object.fromEntries(capabilityNames.map(k=>[k,v[k]])));
}
export function requireCapability(c,name){if(c[name]!==true)throw Error('CAPABILITY_DISABLED_'+name.toUpperCase());}
export function browserAvailability(){
 const binary=['/usr/local/bin/docker','/opt/homebrew/bin/docker','/usr/bin/docker'].find(f=>fs.existsSync(f));
 const socket=[homedir()+'/.docker/run/docker.sock','/var/run/docker.sock'].find(f=>fs.existsSync(f));
 if(!binary||!socket)return {available:false,reason:'DOCKER_UNAVAILABLE'};
 // Local daemon inspection only. Never launches Chromium or pulls an image.
 const r=spawnSync(binary,['--host','unix://'+socket,'image','inspect','mcr.microsoft.com/playwright@sha256:68f1c3dca663d0e8331e8af4681b0b315eca7de1bd7fa934aac0accbeb9f8323'],{encoding:'utf8',timeout:3000,maxBuffer:65536,env:{PATH:'/usr/bin:/bin',DOCKER_CONFIG:'/nonexistent'}});
 return {available:r.status===0,reason:r.status===0?'LOCAL_IMAGE_PRESENT_SANDBOX_CHECK_AT_USE':'DOCKER_OR_PINNED_IMAGE_UNAVAILABLE'};
}
export function capabilityAvailability(env=process.env,{browser=false,probeBrowser=browserAvailability}={}){
 const keyConfigured=!!env.GROQ_API_KEY?.trim(),modelConfigured=/^[\w./:-]{1,160}$/.test(env.SAVLIVO_PRICE_SEMANTIC_MODEL??'');
 const groqReason=keyConfigured?(modelConfigured?'CONFIGURED':env.SAVLIVO_PRICE_SEMANTIC_MODEL?'GROQ_MODEL_INVALID':'GROQ_MODEL_REQUIRED'):(modelConfigured?'GROQ_KEY_REQUIRED':'GROQ_KEY_AND_MODEL_REQUIRED');
 const decodoConfigured=!!env.SAVLIVO_DECODO_USERNAME?.trim()&&!!env.SAVLIVO_DECODO_PASSWORD?.trim();
 const values={direct:{available:true,reason:'CONFIGURED'},tavily:{available:!!env.TAVILY_API_KEY?.trim(),reason:env.TAVILY_API_KEY?.trim()?'CONFIGURED':'TAVILY_API_KEY_REQUIRED'},decodo:{available:decodoConfigured,reason:decodoConfigured?'DECODO_CONFIGURATION_VALIDATED_AT_USE':'DECODO_CREDENTIALS_REQUIRED'},browser:browser?probeBrowser():{available:false,reason:'NOT_PROBED_NO_BROWSER_INITIALIZATION'},groq:{available:keyConfigured&&modelConfigured,keyConfigured,modelConfigured,reason:groqReason}};
 // Additive readiness metadata; permission snapshots and execution policy are unchanged.
 // Availability is a local prerequisite check, not a remote credential or sandbox test.
 return Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{...value,readiness:value.available?(key==='decodo'||key==='browser'?'CONDITIONAL':'AVAILABLE'):(value.reason==='NOT_PROBED_NO_BROWSER_INITIALIZATION'?'NOT_CHECKED':'UNAVAILABLE')}]));
}
export function capabilityPreflight(c,env=process.env,options={}){
 const availability=capabilityAvailability(env,{...options,browser:c.browser});
 return {capabilities:c,availability,ready:capabilityNames.every(k=>!c[k]||availability[k].available),limits:capabilityLimits};
}
