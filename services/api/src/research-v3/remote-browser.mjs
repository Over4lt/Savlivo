import {createPlaywrightRenderedCapability} from './browser-render.mjs';

export const remoteBrowserEndpointVariable='SAVLIVO_BROWSER_WS_ENDPOINT';
export const remotePlaywrightVersion='1.58.2';

export function remoteBrowserConfiguration(env=process.env){
 const raw=Object.prototype.hasOwnProperty.call(env,remoteBrowserEndpointVariable)?env[remoteBrowserEndpointVariable]:undefined;
 if(raw===undefined||raw==='')return {configured:false,reason:'REMOTE_BROWSER_ENDPOINT_NOT_CONFIGURED'};
 if(typeof raw!=='string'||raw!==raw.trim())return {configured:false,reason:'REMOTE_BROWSER_ENDPOINT_INVALID'};
 let endpoint;try{endpoint=new URL(raw);}catch{return {configured:false,reason:'REMOTE_BROWSER_ENDPOINT_INVALID'};}
 const privateName=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(endpoint.hostname),loopback=['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname);
 if(endpoint.protocol!=='ws:'||!endpoint.port||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/'||!privateName&&!loopback||env.NODE_ENV==='production'&&loopback)return {configured:false,reason:'REMOTE_BROWSER_ENDPOINT_INVALID'};
 return {configured:true,reason:'REMOTE_PLAYWRIGHT_CONFIGURED',endpoint:endpoint.href};
}

export function createRemoteChromium(browserType,endpoint,{timeoutMs=30000}={}){
 if(!browserType||typeof browserType.connect!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>120000)throw Error('REMOTE_BROWSER_CLIENT_INVALID');
 return {launch:()=>browserType.connect(endpoint,{timeout:timeoutMs})};
}

export async function createRemoteRenderedBrowser({env=process.env,browserType,proxyFor,connectTimeoutMs=30000}={}){
 const configuration=remoteBrowserConfiguration(env);if(!configuration.configured)throw Error(configuration.reason);
 browserType??=(await import('../../../../infrastructure/playwright-client/node_modules/playwright-core/index.mjs')).chromium;
 return createPlaywrightRenderedCapability({chromium:createRemoteChromium(browserType,configuration.endpoint,{timeoutMs:connectTimeoutMs}),proxyFor});
}
