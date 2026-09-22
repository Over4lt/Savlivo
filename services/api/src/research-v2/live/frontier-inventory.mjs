import assert from 'node:assert/strict';
import {frontierAcquisitionReference} from './source-frontier.mjs';
// Consume the validated bounded frontier; preserve every reviewed URL and its order.
// Only the first discovered candidate fills an otherwise source-less target.
export function applyFrontierInventory(inventory,candidates,{coveredServices=[]}={}){return inventory.map(t=>{
 const selected=candidates.filter(c=>c.service===t.service&&c.market===t.market&&c.targetId===t.id).sort((a,b)=>a.rank-b.rank);
 if(!selected.length||t.urls.length&&coveredServices.includes(t.service))return t;
 const c=selected.find(c=>!t.urls.includes(c.normalizedUrl));if(!c)return t;
 const binding=c.providerDomainValidation;assert(binding?.validated&&binding.service===t.service&&binding.hostname===new URL(c.normalizedUrl).hostname&&binding.reference);
 const reference=frontierAcquisitionReference(c);
 return {...t,urls:[...t.urls,c.normalizedUrl],authorities:[...t.authorities,{hostname:binding.hostname,provider:t.serviceName,sourceType:'OFFICIAL_PROVIDER',sourceUrl:c.normalizedUrl,checkedAt:'2026-09-15T00:00:00.000Z',discoveryDomainBinding:binding}],discoveryCandidates:[reference]};
 });}
