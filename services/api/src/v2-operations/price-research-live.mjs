import {createTavilySearch,readTavilyKeychain,resolveTavilyCredential} from '../research-v2/live/tavily-search.mjs';
import {createV2RobotsPublicAdapter} from '../research-v2/live/robots-policy.mjs';
import {createTavilyDiscovery} from '../research-v2/live/tavily-discovery.mjs';
import {loadDecodoRuntimeConfig,credentialNames,decodoRuntimeAuthorization} from '../research-v1/decodo-runtime-config.mjs';
import {geminiChildEnvironment,readGeminiKeychain} from '../google-ai/keychain.mjs';
import {capabilityNames,capabilityPreflight} from '../research-v2/capabilities/config.mjs';
import {createDecodoProvider} from '../../../../docs/catalog/global-47/research-v1/decodo-adapter.mjs';
import {runLive} from '../research-v2/live/runner.mjs';
import {randomBytes} from 'node:crypto';
import {createLocalContainerRenderedBrowser,localContainerBrowserConfiguration} from '../research-v3/local-container-browser.mjs';

const unavailable=(reason)=>({available:false,reason,readiness:'UNAVAILABLE'});
const available=(reason,extra={})=>({available:true,reason,readiness:'AVAILABLE',...extra});
const decodoFailure=error=>['DECODO_RUNTIME_CONFIG_INVALID','DECODO_RUNTIME_CONFIG_NOT_READY'].includes(error?.message)?error.message:'DECODO_PREFLIGHT_FAILED';

// PRICE_RESEARCH admission checks only local configuration. Network/browser initialization remains lazy at execution.
export async function priceResearchCapabilityPreflight(capabilities,{env=process.env,markets=[],readTavily=readTavilyKeychain,readDecodo=undefined,readGemini=readGeminiKeychain,loadDecodo=loadDecodoRuntimeConfig,decodoProvider=createDecodoProvider}={}){
 const base=capabilityPreflight(capabilities,env,{probeBrowser:()=>{const config=localContainerBrowserConfiguration(env);return {available:config.configured,reason:config.reason};}}),availability={...base.availability};
 if(capabilities.tavily)try{await resolveTavilyCredential({env,readKeychain:readTavily});availability.tavily=available('CONFIGURED',{credentialSource:env.TAVILY_API_KEY?.trim()?'ENVIRONMENT':'LOCAL_KEYCHAIN'});}catch{availability.tavily=unavailable('TAVILY_CREDENTIAL_UNAVAILABLE');}
 if(capabilities.decodo)try{
  const runtime=await loadDecodo({env,...(readDecodo?{readKeychain:readDecodo}:{})});decodoRuntimeAuthorization(runtime,null,'BOUNDED');const bundle=decodoProvider({env:runtime});
  if(!bundle.provider?.enabled||!bundle.provider?.approved||!bundle.provider?.ready||!bundle.provider?.configured||!bundle.verifier?.approved)throw Error('DECODO_PREFLIGHT_FAILED');
  if(markets.length&&markets.some(market=>!bundle.provider.countries.includes(market)))throw Error('DECODO_TARGET_MARKET_UNAVAILABLE');
  availability.decodo=available('DECODO_LOCAL_RUNTIME_READY',{readiness:'CONDITIONAL'});
 }catch(error){availability.decodo=unavailable(error?.message==='DECODO_TARGET_MARKET_UNAVAILABLE'?error.message:decodoFailure(error));}
 let googleAi;
 try{const child=await geminiChildEnvironment(env,readGemini),configured=!!child.GEMINI_API_KEY?.trim();googleAi=configured?available('CONFIGURED',{credentialSource:env.GEMINI_API_KEY?.trim()?'ENVIRONMENT':'LOCAL_KEYCHAIN',blocking:false}):{...unavailable('GEMINI_CREDENTIAL_UNAVAILABLE'),blocking:false};}
 catch{googleAi={...unavailable('GEMINI_CREDENTIAL_UNAVAILABLE'),blocking:false};}
 return {...base,availability,ready:capabilityNames.every(name=>!capabilities[name]||availability[name].available),auxiliary:{googleAi}};
}

export async function priceResearchChildEnvironment(base=process.env,{readGemini=readGeminiKeychain,readTavily=readTavilyKeychain,readDecodo=undefined,loadDecodo=loadDecodoRuntimeConfig}={}){
 const env=await geminiChildEnvironment(base,readGemini);try{env.TAVILY_API_KEY=await resolveTavilyCredential({env,readKeychain:readTavily});}catch{}
 try{const runtime=await loadDecodo({env,...(readDecodo?{readKeychain:readDecodo}:{})});for(const name of credentialNames)if(runtime[name])env[name]=runtime[name];for(const [name,value]of Object.entries(runtime))if(name.startsWith('SAVLIVO_DECODO_')||name==='SAVLIVO_GEO_VERIFIER_APPROVED')env[name]=value;}catch{}
 return env;
}

export async function createPriceResearchAdapters({market,capabilities,env=process.env},{createDiscovery=createTavilyDiscovery,createRenderedBrowser=createLocalContainerRenderedBrowser}={}){
 let outerSearch=null,runtime=null,bundle=null;
 if(capabilities.decodo){runtime=await loadDecodoRuntimeConfig({env});bundle=createDecodoProvider({env:runtime});if(!bundle.provider?.ready||!bundle.provider?.configured||!bundle.verifier?.approved)throw Error('DECODO_PREFLIGHT_FAILED');}
 return async({stage,directory,targets=[]})=>{
  if(stage==='PROVIDER_SEED')return {search:async args=>{if(!capabilities.tavily)throw Error('TAVILY_NOT_PERMITTED');outerSearch??=await createTavilySearch({env,maxCalls:2});return outerSearch(args);},read:async({url,maxBytes=2097152,stopOnCrossHostRedirect=false})=>{if(!capabilities.direct)throw Error('DIRECT_NOT_PERMITTED');return createV2RobotsPublicAdapter({authorities:[],retainRaw:true,maxLinks:80,maxReads:1,maxRequests:4,network:{timeoutMs:15000,maxBytes,maxRedirects:1,pricingResources:false}}).read({url,targetCountry:market,maxRedirects:1,stopOnCrossHostRedirect});}};
  if(stage!=='KNOWN_SERVICE_CHILD')throw Error('UNKNOWN_ADAPTER_STAGE');
  const dependencies=capabilities.browser?{createRenderedBrowser:()=>createRenderedBrowser({env,proxyFor:context=>runtime?{server:'http://gate.decodo.com:7000',username:'user-'+runtime.DECODO_USERNAME+'-country-'+context.networkGeography.toLowerCase()+'-session-'+randomBytes(16).toString('hex'),password:runtime.DECODO_PASSWORD}:null})}:{},discovery=await createDiscovery({inventory:targets,env,bounds:{searches:2},searchEnabled:capabilities.tavily}),live=discovery.bind({dir:directory,runtime,bundle,runLive,dependencies});
  return {search:live.search,read:live.read,classify:live.classify,consumeProvider:live.consumeProvider,acquire:live.acquire,...(capabilities.browser?{render:live.render}:{})};
 };
}
