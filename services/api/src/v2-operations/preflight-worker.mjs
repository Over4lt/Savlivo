// Preflight validates only. START is dispatched only after durable explicit confirmation.
// Neither action executes research; the existing poller owns queued jobs.
import {parentPort,workerData} from 'node:worker_threads';
import {Operations} from './control.mjs';
import {operationsDiagnostic} from './diagnostics.mjs';
try {
 const {config,input,actor,action}=workerData;
 const ops=new Operations(config);
 const result=action==='START'?ops.start(input.token,actor,input.confirmed):ops.preflight(input,actor);
 parentPort.postMessage({result});
} catch(error) {
 console.error(JSON.stringify(operationsDiagnostic(error,workerData.action==='START'?'start-worker':'preflight-worker')));
 const safe=/^(?:INVALID_|TARGETING_|PREFLIGHT_|RUN_CONTROL_|NO_UNRESOLVED_|STORAGE_|CAPABILITY_|JOB_)[A-Z0-9_]+$/.test(error.message)?error.message:workerData.action==='START'?'START_VALIDATION_FAILED':'PREFLIGHT_VALIDATION_FAILED';
 parentPort.postMessage({error:safe});
}
