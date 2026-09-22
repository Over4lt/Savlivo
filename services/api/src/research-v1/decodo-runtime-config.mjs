// Operator configuration only. No Keychain access, network or writes on import.
import {execFile} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {promisify} from 'node:util';
import {money,validateMonetaryAuthorizationMode} from './geo-provider.mjs';
const execute=promisify(execFile);
export const decodoKeychainService='com.savlivo.research-v1.decodo';
export const credentialNames=Object.freeze(['SAVLIVO_DECODO_USERNAME','SAVLIVO_DECODO_PASSWORD']);
const configNames=Object.freeze(['SAVLIVO_DECODO_ENABLED','SAVLIVO_DECODO_APPROVED','SAVLIVO_DECODO_ROUTING_MODE',
 'SAVLIVO_DECODO_COST_CLASS','SAVLIVO_DECODO_CURRENCY','SAVLIVO_GEO_VERIFIER_APPROVED',
 'SAVLIVO_DECODO_ESTIMATED_COST','SAVLIVO_DECODO_RESERVED_COST',
 'SAVLIVO_DECODO_LIVE_TASK_CEILING','SAVLIVO_DECODO_LIVE_MARKET_CEILING','SAVLIVO_DECODO_LIVE_RUN_CEILING']);
export async function readDecodoKeychain(account){
 if(process.platform!=='darwin'||!credentialNames.includes(account))return null;
 try{
  const {stdout}=await execute('/usr/bin/security',['find-generic-password','-s',decodoKeychainService,'-a',account,'-w'],
   {encoding:'utf8',timeout:15000,maxBuffer:8192});
  return stdout.replace(/\r?\n$/,'');
 }catch{return null;} // Child-process errors can contain captured secrets. Never propagate them.
}
export async function loadDecodoRuntimeConfig({env=process.env,readKeychain=readDecodoKeychain,
 readConfig=()=>JSON.parse(readFileSync(new URL('./decodo-runtime-config.json',import.meta.url),'utf8'))}={}){
 let configured;
 try{configured=readConfig();if(!configured||Array.isArray(configured)||Object.keys(configured).some(k=>!configNames.includes(k))||
   Object.values(configured).some(v=>typeof v!=='string'))throw Error();}
 catch{throw Error('DECODO_RUNTIME_CONFIG_INVALID');}
 const runtime={...configured,...env};
 for(const name of credentialNames){
  let value=null;
  if(Object.hasOwn(env,name))value=env[name]; // Explicit empty values disable fallback too.
  else try{value=await readKeychain(name);}catch{/* Never surface a secret-bearing helper error. */}
  delete runtime[name];
  // Accidental JSON serialization/spread cannot publish credentials.
  Object.defineProperty(runtime,name,{value:typeof value==='string'?value:'',enumerable:false});
 }
 return Object.freeze(runtime);
}
export function decodoRuntimeAuthorization(env,requested=null,monetaryAuthorizationMode){
 try{
  const mode=validateMonetaryAuthorizationMode(monetaryAuthorizationMode);
  for(const [key,value] of Object.entries({SAVLIVO_DECODO_ENABLED:'true',SAVLIVO_DECODO_APPROVED:'true',
   SAVLIVO_DECODO_ROUTING_MODE:'COMMON_GATEWAY',SAVLIVO_DECODO_COST_CLASS:'PAID',SAVLIVO_GEO_VERIFIER_APPROVED:'true'}))
   if(env[key]!==value)throw Error();
  if(!credentialNames.every(k=>typeof env[k]==='string'&&env[k].trim()))throw Error();
  const currency=env.SAVLIVO_DECODO_CURRENCY;if(!/^[A-Z]{3}$/.test(currency))throw Error();
  const budget={currency,task:env.SAVLIVO_DECODO_LIVE_TASK_CEILING,market:env.SAVLIVO_DECODO_LIVE_MARKET_CEILING,run:env.SAVLIVO_DECODO_LIVE_RUN_CEILING};
  const reserved=money(env.SAVLIVO_DECODO_RESERVED_COST),estimated=money(env.SAVLIVO_DECODO_ESTIMATED_COST);
  if(estimated>reserved||reserved<=0n)throw Error();
  if(mode==='UNBOUNDED'){
   if(requested&&(Object.keys(requested).length!==4||requested.currency!==currency||['task','market','run'].some(k=>requested[k]!=='UNBOUNDED')))throw Error();
   return Object.freeze({currency,task:'UNBOUNDED',market:'UNBOUNDED',run:'UNBOUNDED'});
  }
  if(['task','market','run'].some(k=>money(budget[k])<reserved))throw Error();
  if(requested&&(Object.keys(requested).length!==4||requested.currency!==currency||
   ['task','market','run'].some(k=>money(requested[k])>money(budget[k]))))throw Error();
  return Object.freeze({...requested??budget});
 }catch{throw Error('DECODO_RUNTIME_CONFIG_NOT_READY');}
}
