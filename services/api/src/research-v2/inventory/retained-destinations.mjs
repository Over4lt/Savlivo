// Retained URLs are routing leads only. They confer no price, market or ownership proof.
import fs from 'node:fs';import {createHash} from 'node:crypto';
import {normalizePublicUrl} from '../../research-v1/public-network.mjs';
export function applyRetainedDestinations(targets,document,inputHashes){
 if(document.version!==1||!Array.isArray(document.targets))throw Error('EXPANSION_ROUTING_SCHEMA');
 const byId=new Map(targets.map(t=>[t.id,t])),cache=new Map(),seen=new Set(),out=new Map();
 for(const row of document.targets){const target=byId.get(row.id);if(!target||seen.has(row.id)||!Array.isArray(row.destinations))throw Error('EXPANSION_ROUTING_TARGET');seen.add(row.id);
  const urls=[],knownCommercialUrls=[];for(const entry of row.destinations){const url=normalizePublicUrl(entry.url).href;if(url!==entry.url||!target.authorities.some(a=>a.hostname===new URL(url).hostname))throw Error('EXPANSION_ROUTING_UNREVIEWED_HOST');
   const ref=entry.reference;if(!ref||inputHashes[ref.path]!==ref.sha256)throw Error('EXPANSION_ROUTING_UNBOUND_SOURCE');
   if(!cache.has(ref.path)){const bytes=fs.readFileSync(ref.path);if(createHash('sha256').update(bytes).digest('hex')!==ref.sha256)throw Error('EXPANSION_ROUTING_SOURCE_CHANGED');cache.set(ref.path,JSON.parse(bytes));}
   const source=cache.get(ref.path).targets?.find(t=>t.id===row.id&&t.service===target.service&&t.market===target.market);
   if(!source||!(source.leads??[]).some(l=>l.url===url)&&!(source.reads??[]).some(r=>r.requestedUrl===url)&&!(source.urls??[]).includes(url))throw Error('EXPANSION_ROUTING_DESTINATION_NOT_RETAINED');
   if(entry.commercialReference){const ref=entry.commercialReference;if(inputHashes[ref.path]!==ref.sha256)throw Error('EXPANSION_ROUTING_COMMERCIAL_UNBOUND');
    const key='events:'+ref.path;if(!cache.has(key)){const bytes=fs.readFileSync(ref.path);if(createHash('sha256').update(bytes).digest('hex')!==ref.sha256)throw Error('EXPANSION_ROUTING_SOURCE_CHANGED');cache.set(key,bytes.toString('utf8').split('\n').filter(Boolean).map(JSON.parse));}
    if(!cache.get(key).some(e=>e.type==='PROVIDER_INTERPRETATION'&&e.target===target.id&&e.url===url&&e.outcome?.usable&&e.outcome?.monetary>0))throw Error('EXPANSION_ROUTING_COMMERCIAL_NOT_RETAINED');
    knownCommercialUrls.push(url);
   }
   if(!urls.includes(url))urls.push(url);
  }
  // Fresh run: never inherit completion, access permission, geo proof or verdicts.
  out.set(row.id,{...target,knownCommercialUrls,urls:[...new Set([...urls,...target.urls])]});
 }
 if(seen.size!==targets.length)throw Error('EXPANSION_ROUTING_INCOMPLETE');
 return targets.map(t=>out.get(t.id));
}
