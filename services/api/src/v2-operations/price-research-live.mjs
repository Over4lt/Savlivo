import {createTavilySearch,readTavilyKeychain} from '../research-v2/live/tavily-search.mjs';
import {createV2RobotsPublicAdapter} from '../research-v2/live/robots-policy.mjs';
import {createTavilyDiscovery} from '../research-v2/live/tavily-discovery.mjs';
import {loadDecodoRuntimeConfig,credentialNames} from '../research-v1/decodo-runtime-config.mjs';
import {geminiChildEnvironment} from '../google-ai/keychain.mjs';
import {createDecodoProvider} from '../../../../docs/catalog/global-47/research-v1/decodo-adapter.mjs';
import {runLive} from '../research-v2/live/runner.mjs';

export async function priceResearchChildEnvironment(base=process.env){
 const env=await geminiChildEnvironment(base);if(!env.TAVILY_API_KEY){const key=await readTavilyKeychain();if(key)env.TAVILY_API_KEY=key;}
 try{const runtime=await loadDecodoRuntimeConfig({env});for(const name of credentialNames)if(runtime[name])env[name]=runtime[name];for(const [name,value]of Object.entries(runtime))if(name.startsWith('SAVLIVO_DECODO_')||name==='SAVLIVO_GEO_VERIFIER_APPROVED')env[name]=value;}catch{}
 return env;
}

export async function createPriceResearchAdapters({market,capabilities}){
 let outerSearch=null,runtime=null,bundle=null;
 if(capabilities.decodo){runtime=await loadDecodoRuntimeConfig();bundle=createDecodoProvider({env:runtime});if(!bundle.provider?.ready||!bundle.provider?.configured||!bundle.verifier?.approved)throw Error('DECODO_PREFLIGHT_FAILED');}
 return async({stage,directory,targets=[]})=>{
  if(stage==='PROVIDER_SEED')return {search:async args=>{if(!capabilities.tavily)throw Error('TAVILY_NOT_PERMITTED');outerSearch??=await createTavilySearch({maxCalls:2});return outerSearch(args);},read:async({url,maxBytes=2097152,stopOnCrossHostRedirect=false})=>{if(!capabilities.direct)throw Error('DIRECT_NOT_PERMITTED');return createV2RobotsPublicAdapter({authorities:[],retainRaw:true,maxLinks:80,maxReads:1,maxRequests:4,network:{timeoutMs:15000,maxBytes,maxRedirects:1,pricingResources:false}}).read({url,targetCountry:market,maxRedirects:1,stopOnCrossHostRedirect});}};
  if(stage!=='KNOWN_SERVICE_CHILD')throw Error('UNKNOWN_ADAPTER_STAGE');
  const discovery=await createTavilyDiscovery({inventory:targets,bounds:{searches:2}}),live=discovery.bind({dir:directory,runtime,bundle,runLive,dependencies:{}});
  return {search:live.search,read:live.read,classify:live.classify,consumeProvider:live.consumeProvider,acquire:live.acquire};
 };
}
