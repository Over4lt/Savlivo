import test from 'node:test';import assert from 'node:assert/strict';
import {operationsDiagnostic,childDiagnostic} from './diagnostics.mjs';
test('diagnostics redact secrets, filesystem paths and raw child output',()=>{
 const d=operationsDiagnostic(Object.assign(Error('/private/secret token=value'),{code:'EACCES'}),'preflight');
 assert.deepEqual(d,{event:'V2_OPERATIONS_FAILURE',stage:'preflight',reason:'UNCLASSIFIED_FAILURE',code:'EACCES'});
 const child=childDiagnostic({status:1,stderr:'secret\n'+JSON.stringify({event:'V2_OPERATIONS_FAILURE',reason:'GENESIS_DEPLOYMENT_REPOSITORY_INPUTS_MISSING'})});
 assert.equal(child.reason,'GENESIS_DEPLOYMENT_REPOSITORY_INPUTS_MISSING');assert(!JSON.stringify(child).includes('secret'));
 assert.equal(childDiagnostic({error:{code:'ETIMEDOUT'},signal:'SIGTERM'}).code,'ETIMEDOUT');
});

test('timeout, heap exhaustion and externally killed process remain distinct',()=>{
 assert.equal(childDiagnostic({error:{code:'ETIMEDOUT'},signal:'SIGTERM'}).failureKind,'TIMEOUT');
 assert.equal(childDiagnostic({signal:'SIGABRT',stderr:'FATAL ERROR: Reached heap limit Allocation failed'}).failureKind,'HEAP_LIMIT_EXCEEDED');
 assert.equal(childDiagnostic({signal:'SIGKILL'}).failureKind,'PROCESS_KILLED_OOM_POSSIBLE');
 assert.equal(childDiagnostic({status:1}).failureKind,'VALIDATION_OR_PROCESS_EXIT');
});
