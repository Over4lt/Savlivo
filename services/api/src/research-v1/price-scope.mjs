// Shared exact price-scope contract; no pricing/runtime dependencies.
import assert from 'node:assert/strict';
export const scopeFields=['serviceSlug','countryCode','plan','cadence','billingRoute','currency','offerType','taxTreatment'];
export function priceScopeKey(scope){return JSON.stringify(scopeFields.map(k=>scope[k]??null));}
export function validatePriceScope(scope){
 for(const key of scopeFields)assert(typeof scope[key]==='string'&&scope[key].length,`Missing price scope: ${key}`);
 assert(['MONTH','YEAR'].includes(scope.cadence));assert(/^[A-Z]{3}$/.test(scope.currency));
 return scope;
}
