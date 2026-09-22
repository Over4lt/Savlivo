// Install before loading corpus readers. No network or subprocess can be used by this process.
import {createRequire,syncBuiltinESMExports} from 'node:module';
const require=createRequire(import.meta.url);
export const counters={externalNetwork:0,provider:0,decodo:0,groq:0,browser:0,subprocess:0};
export function reject(capability){return function(){counters[capability]++;throw Error('OFFLINE_CAPABILITY_DISABLED:'+capability);};}
export const adapters=Object.freeze(Object.fromEntries(['provider','decodo','groq','browser'].map(k=>[k,reject(k)])));
for(const [name,methods]of Object.entries({http:['request','get'],https:['request','get'],http2:['connect'],net:['connect','createConnection'],tls:['connect'],dgram:['createSocket'],dns:['lookup','resolve','resolve4','resolve6'],child_process:['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'],worker_threads:['Worker']})){
 const module=require('node:'+name),kind=['child_process','worker_threads'].includes(name)?'subprocess':'externalNetwork';
 for(const method of methods)module[method]=reject(kind);
 if(name==='net')module.Socket.prototype.connect=reject(kind);
 if(name==='dns')for(const key of Object.keys(module.promises))if(typeof module.promises[key]==='function')module.promises[key]=reject(kind);
}
globalThis.fetch=reject('externalNetwork');globalThis.WebSocket=reject('externalNetwork');
syncBuiltinESMExports();
export function assertOffline(){if(Object.values(counters).some(Boolean))throw Error('OFFLINE_INVOCATION_ATTEMPTED');return {...counters};}
