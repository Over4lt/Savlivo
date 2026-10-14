import {createPlaywrightRenderedCapability} from './browser-render.mjs';

export const browserRuntimeModeVariable='SAVLIVO_BROWSER_RUNTIME';
export const localContainerBrowserMode='LOCAL_CONTAINER';
export const localContainerBrowserEndpoint='ws://127.0.0.1:3001/';
export const localPlaywrightVersion='1.58.2';

export function localContainerBrowserConfiguration(env=process.env){
 const legacy=Object.prototype.hasOwnProperty.call(env,'SAVLIVO_BROWSER_WS_ENDPOINT')?env.SAVLIVO_BROWSER_WS_ENDPOINT:undefined;
 if(legacy!==undefined&&legacy!=='')return {configured:false,reason:'BROWSER_ENDPOINT_OVERRIDE_FORBIDDEN'};
 const mode=env[browserRuntimeModeVariable];
 if(mode===undefined||mode==='')return {configured:false,reason:'LOCAL_CONTAINER_BROWSER_NOT_CONFIGURED'};
 if(mode!==localContainerBrowserMode)return {configured:false,reason:'BROWSER_RUNTIME_MODE_INVALID'};
 return {configured:true,reason:'LOCAL_CONTAINER_PLAYWRIGHT_CONFIGURED',endpoint:localContainerBrowserEndpoint};
}

export function createLocalContainerBrowserType(browserType,{timeoutMs=30000}={}){
 if(!browserType||typeof browserType.connect!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>120000)throw Error('LOCAL_CONTAINER_BROWSER_CLIENT_INVALID');
 return {launch:(options={})=>browserType.connect(localContainerBrowserEndpoint,{timeout:timeoutMs,headers:{'x-playwright-launch-options':JSON.stringify(options)}})};
}

export async function createLocalContainerRenderedBrowser({env=process.env,browserType,proxyFor,connectTimeoutMs=30000}={}){
 const configuration=localContainerBrowserConfiguration(env);if(!configuration.configured)throw Error(configuration.reason);
 browserType??=(await import('../../../../infrastructure/playwright-client/node_modules/playwright-core/index.mjs')).firefox;
 return createPlaywrightRenderedCapability({browserType:createLocalContainerBrowserType(browserType,{timeoutMs:connectTimeoutMs}),launchOptions:{headless:true},proxyFor});
}
