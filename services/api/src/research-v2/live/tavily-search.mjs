// Discovery transport only. Never exports credentials or commercial evidence.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {normalizePublicUrl} from '../../research-v1/public-network.mjs';
const execute=promisify(execFile);
export async function readTavilyKeychain(){
 if(process.platform!=='darwin')return null;
 try{const {stdout}=await execute('/usr/bin/security',['find-generic-password','-s','com.savlivo.research-v2.tavily','-a','TAVILY_API_KEY','-w'],{encoding:'utf8',timeout:15000,maxBuffer:8192});return stdout.trim();}catch{return null;}
}
export const createTavilySearch=options=>createSearch(options,50);
// Explicit manual benchmark only; normal callers retain the 50-call ceiling.
export const createTavilyBenchmarkSearch=options=>createSearch({...options,maxCalls:58},58);
async function createSearch({readKeychain=readTavilyKeychain,fetchImpl=fetch,maxCalls=50,timeoutMs=20000}={},ceiling){
 let key;try{key=await readKeychain();}catch{}if(typeof key!=='string'||!key.trim())throw Error('TAVILY_CREDENTIAL_UNAVAILABLE');
 if(!Number.isInteger(maxCalls)||maxCalls<1||maxCalls>ceiling)throw Error('TAVILY_INVALID_BOUND');let calls=0;
 return async({query,target})=>{
  const meta={transport:'TAVILY_SEARCH_BASIC',timestamp:new Date().toISOString(),service:target.service,market:target.market,query,results:[]};
  if(typeof query!=='string'||query.length>2000||query.includes(key))return {...meta,query:'REDACTED_INVALID_QUERY',failure:{code:'TAVILY_INVALID_QUERY'}};
  if(calls++>=maxCalls)return {...meta,failure:{code:'TAVILY_SEARCH_BOUND'}};
  try{
   const response=await fetchImpl('https://api.tavily.com/search',{method:'POST',redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({query,topic:'general',search_depth:'basic',max_results:8,include_answer:false,include_raw_content:false,include_images:false,auto_parameters:false,include_usage:true})});
   if(!response.ok)return {...meta,failure:{code:'TAVILY_HTTP_'+response.status}};
   const reader=response.body.getReader();let bytes=0;const chunks=[];
   try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>262144)throw Error();chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
   const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!Array.isArray(data.results))throw Error();
   const results=[];for(const row of data.results.slice(0,8)){try{const url=normalizePublicUrl(row.url).href,title=String(row.title??'').slice(0,300);if(url.includes(key)||title.includes(key))continue;results.push({url,title,evidenceStatus:'DISCOVERY_LEAD_ONLY'});}catch{}}
   // Titles are required by existing relevance/ranking. No snippets, answers or raw response persist.
   return {...meta,results,responseBytes:bytes,usageCredits:Number.isFinite(data.usage?.credits)?data.usage.credits:null};
  }catch{return {...meta,failure:{code:'TAVILY_REQUEST_FAILED'}};}
 };
}
