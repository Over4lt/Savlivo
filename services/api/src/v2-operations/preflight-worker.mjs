// Validation only: never starts/enqueues research. Separate isolate keeps auth/HTTP responsive.
import {parentPort,workerData} from 'node:worker_threads';
import {Operations} from './control.mjs';
import {operationsDiagnostic} from './diagnostics.mjs';
try {
 const {config,input,actor}=workerData;
 const result=new Operations(config).preflight(input,actor);
 parentPort.postMessage({result});
} catch(error) {
 console.error(JSON.stringify(operationsDiagnostic(error,'preflight-worker')));
 const safe=/^(?:INVALID_|TARGETING_|PREFLIGHT_|RUN_CONTROL_|NO_UNRESOLVED_|STORAGE_)[A-Z0-9_]+$/.test(error.message)?error.message:'PREFLIGHT_VALIDATION_FAILED';
 parentPort.postMessage({error:safe});
}
