// Host-authored capability budget. No page/model values or provider-specific rules.
import assert from 'node:assert/strict';
import {runtimeResourceLimits} from './page-runtime-limits.mjs';
import {structuredResourceLimits as staticLimits} from './associated-structured-resources.mjs';
export const runtimeSessionBudgetVersion='RUNTIME_SESSION_BODY_V1';
export function runtimeSessionBudget(){
 // Parent: at most five origins (four redirects). BEFORE/AFTER share the
 // verifier's initial origin but may visit four different redirect origins each.
 // Each static resource uses a fresh robots reader; runtime robots are already
 // charged by the runtime's onBodyBytes callback and belong inside its 4 MB.
 const stages={BEFORE:10000,AFTER:10000,PARENT:1000000,
  ROBOTS:(5+1+4+4+staticLimits.total)*512000,STATIC:staticLimits.totalBytes,RUNTIME:runtimeResourceLimits.totalBytes};
 return {version:runtimeSessionBudgetVersion,stages,ceiling:Object.values(stages).reduce((a,b)=>a+b,0)};
}
export function validateRuntimeSessionBudget(value){assert.deepEqual(value,runtimeSessionBudget());return value;}
