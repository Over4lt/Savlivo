import test from 'node:test';import assert from 'node:assert/strict';
import {terminationText,elapsedText} from './live-status.js';
import {terminationDiagnostic} from '../../../services/api/src/v2-operations/job-status.mjs';
const job={id:'fixture',status:'FAILED'},phase={jobId:'fixture',event:'AUTHORITATIVE_VALIDATION_STARTED',at:'2026-09-25T12:00:00Z'};
for(const error of ['WORKER_SPAWN_FAILED','EXECUTION_TIMEOUT','MATURE_EXECUTION_INTERRUPTED_CHECKPOINT_PRESERVED'])test('recorded cause has precedence: '+error,()=>{
 const diagnostic=terminationDiagnostic({...job,error},phase,false);assert.equal(diagnostic.kind,'CAUSE');assert.equal(diagnostic.reason,error);assert.match(terminationText({...job,diagnostic}),/Last recorded phase: AUTHORITATIVE_VALIDATION_STARTED/);
});
test('successful completion never displays failure diagnostics',()=>{
 assert.equal(terminationDiagnostic({...job,status:'COMPLETE',error:'OLD_ERROR'},phase,false),null);
 assert.equal(terminationText({status:'COMPLETE',diagnostic:{kind:'CAUSE',reason:'OLD_ERROR'}}),'');
});
test('recorded operator stop is distinguished from unexplained stop',()=>{
 assert.equal(terminationDiagnostic({...job,status:'STOPPED',stopRequested:true},phase,false).reason,'OPERATOR_STOP_REQUESTED');
 assert.equal(terminationDiagnostic({...job,status:'STOPPED'},phase,false).kind,'UNKNOWN');
});
test('recorded phase failure is shown without inventing its underlying cause',()=>{
 assert.equal(terminationDiagnostic(job,{...phase,event:'PREPARATION_FAILED'},false).reason,'PREPARATION_FAILED');
});
test('probable process loss identifies concrete basis without asserting OOM or terminality',()=>{
 const running={...job,status:'RUNNING'},diagnostic=terminationDiagnostic(running,phase,false);
 assert.equal(diagnostic.kind,'PROBABLE_CAUSE');assert.match(terminationText({...running,diagnostic}),/Probable cause:.*RUNNING job PID.*unknown/);assert.doesNotMatch(diagnostic.reason,/OOM|memory|timeout/i);assert.equal(running.status,'RUNNING');
 assert.equal(terminationDiagnostic(running,phase,null),null);assert.equal(terminationDiagnostic(running,phase,true),null);
});
test('unpersisted exit code/signal cannot be invented from process disappearance',()=>{
 const diagnostic=terminationDiagnostic(job,phase,false);assert.equal(diagnostic.kind,'UNKNOWN');assert.doesNotMatch(diagnostic.reason,/SIGKILL|137|OOM/);
});
test('foreign phase and unbounded error text are not exposed',()=>{
 const diagnostic=terminationDiagnostic({...job,error:'secret=private exception text'},{...phase,jobId:'other'},false);
 assert.equal(diagnostic.kind,'UNKNOWN');assert.equal(diagnostic.lastPhase,null);assert.doesNotMatch(JSON.stringify(diagnostic),/secret|VALIDATION/);
});
test('missing diagnostics use explicit unknown, while active/read errors do not invent run failure',()=>{
 assert.equal(terminationText(job),'Cause unavailable from recorded status.');assert.equal(terminationText({status:'RUNNING'}),'');
});
test('abnormal elapsed freezes at authoritative terminal time',()=>{
 assert.equal(elapsedText({...job,terminal:true,startedAt:'2026-09-25T12:00:00Z',finishedAt:'2026-09-25T12:01:02Z'},Date.now()),'Elapsed: 1m 2s');
});
