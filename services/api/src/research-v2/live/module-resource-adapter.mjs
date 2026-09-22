// Reuses existing V2 robots and V1 public-reader/geo transport semantics. No V1 changes.
import {createV2RobotsPublicAdapter} from './robots-policy.mjs';
export function moduleResourceAdapterFactory(url,maxBytes=2097152){
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>2097152)throw Error('INVALID_MODULE_LIMIT');
 return options=>{
  const ordinary=createV2RobotsPublicAdapter(options);
  const resource=createV2RobotsPublicAdapter({...options,retainRaw:true,publicEvidence:{maxRedirects:0,maxBodyBytes:maxBytes,maxTotalBodyBytes:4194304},network:{...options.network,pricingResources:false,scriptUrls:[url],mixedJsonUrls:[],structuredJsonUrls:[]}});
  return {...ordinary,read:input=>(input.url===url?resource:ordinary).read(input),checkAccess:(u,opts)=>(u===url?resource:ordinary).checkAccess(u,opts)};
 };
}
