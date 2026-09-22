import {readHistoricalReference} from '../offline-recovery/geo-evidence.mjs';
import {htmlTree} from '../offline-recovery/extract.mjs';
import {loadLiveSource} from './live-source.mjs';
// Offline, explicit retained links only. Never fetch or infer a terms URL.
export function validGoverningRedirect(p,o){try{return [301,302,307,308].includes(p.status)&&p.target?.service===o.service&&p.target?.market===o.market&&p.location===o.url&&new URL(p.url).origin===new URL(o.url).origin&&p.proof?.tlsVerified===true&&p.proof?.access==='PUBLIC'&&p.proof?.url===p.url&&p.proof?.singleHop===true;}catch{return false;}}
export function loadGoverningResources(body,occurrence,sources,bindings=[]){
 const urls=new Set();for(const n of htmlTree(body).nodes)if(n.tag==='a'&&/customer agreement|subscription terms|terms and conditions/i.test(n.text)){try{const u=new URL(n.attrs.href,occurrence.url);if(u.protocol==='https:')urls.add(u.href);}catch{}}
 if(!urls.size||urls.size>16)return [];
 const rows=[];for(const s of sources)for(const o of s.occurrences??[]){if(o.service!==occurrence.service||o.market!==occurrence.market)continue;try{let linked=o.url,redirectEvidence=null;if(!urls.has(linked)){const target=readHistoricalReference({...o.record,pointer:'/target'}),ref=target.onlineDiscoveryProof?.provenance?.redirectReference;if(!ref)continue;const p=readHistoricalReference(ref);if(!validGoverningRedirect(p,o)||!urls.has(p.url))continue;linked=p.url;redirectEvidence={reference:ref,from:p.url,to:p.location,status:p.status,proof:p.proof};}const r=loadLiveSource(o,s.sha256,bindings);rows.push({url:linked,retainedUrl:o.url,redirectEvidence,body:r.body,receipt:r.receipt});}catch{}}
 if(rows.length>32)return [];return rows;
}
