// Run-scoped transport selection, never evidence or geographic-gap proof.
import assert from 'node:assert/strict';
import {countryCurrencyData} from './market-contract.mjs';
import {validatePriceScope} from './price-scope.mjs';
export const decodoOnlyPolicy='DECODO_ONLY_MARKET_PRICE_RESEARCH_V1';
export function validateAcquisitionPolicy(policy){assert(policy==null||policy===decodoOnlyPolicy,'Unsupported acquisition policy');return policy;}
export function marketPriceAction(action,policy){
 validateAcquisitionPolicy(policy);
 // Query/control discovery has no acquired market price body. Other objectives
 // retain their transport; incidental direct price proposals are excluded on replay.
 return policy===decodoOnlyPolicy&&action.claim==='prices'&&!action.sourceDiscovery&&action.plan?.some(s=>s.url)&&!['GEO_RESEARCH_REQUIRED','CONFLICT_RECONCILIATION'].includes(action.path);
}
export function acquisitionAction(action,policy){
 return marketPriceAction(action,policy)?{...action,id:action.id+':decodo-only',acquisitionPolicy:policy}:action;
}

export function validateMarketAcquisition(x,policy){
 assert(policy===decodoOnlyPolicy&&x.policy===policy,'Experimental transport not authorized');
 assert(Object.keys(x).every(k=>['policy','countryCode','serviceSlug','url','actionId','priceScope','runtimeExecution'].includes(k)));
 if(x.runtimeExecution!==undefined)assert(x.runtimeExecution===true);
 assert(countryCurrencyData.some(([c])=>c===x.countryCode)&&typeof x.serviceSlug==='string'&&x.serviceSlug&&typeof x.actionId==='string'&&x.actionId);
 if(x.priceScope){validatePriceScope(x.priceScope);assert(x.priceScope.countryCode===x.countryCode&&x.priceScope.serviceSlug===x.serviceSlug);}
}
