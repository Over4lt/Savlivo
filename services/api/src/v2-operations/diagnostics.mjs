// Deliberately exclude messages, stacks, paths, argv, environment and subprocess output.
export function operationsDiagnostic(error,stage='request'){
 const message=String(error?.message??'');
 const reason=/^(?:MATURE_LIFECYCLE_|INVALID_LIFECYCLE_|LIFECYCLE_|GENESIS_|STORAGE_|TARGETING_|HANDOFF_|AUTHORITY_|CONTROL_)[A-Z0-9_]+$/.test(message)?message:'UNCLASSIFIED_FAILURE';
 const code=['ENOENT','EACCES','EPERM','ENOSPC','EROFS','ETIMEDOUT','ENOBUFS','EIO'].includes(error?.code)?error.code:null;
 return {event:'V2_OPERATIONS_FAILURE',stage,reason,code,...(error?.operationsDiagnostic??{})};
}
export function childDiagnostic(result){
 let reason='NATIVE_CHECK_FAILED',childCode=null;
 // Only accept a machine reason emitted by our CLI; never forward stderr itself.
 for(const line of String(result.stderr??'').split('\n'))try{const x=JSON.parse(line);if(x.event==='V2_OPERATIONS_FAILURE'){const safe=operationsDiagnostic({message:x.reason,code:x.code});reason=safe.reason;childCode=safe.code;}}catch{}
 const failureKind=result.error?.code==='ETIMEDOUT'?'TIMEOUT':/FATAL ERROR:.*(?:heap|Allocation)/i.test(String(result.stderr??''))?'HEAP_LIMIT_EXCEEDED':result.signal==='SIGKILL'?'PROCESS_KILLED_OOM_POSSIBLE':result.signal?'PROCESS_SIGNAL':'VALIDATION_OR_PROCESS_EXIT';
 return {stage:'native-check',failureKind,reason,exitStatus:Number.isInteger(result.status)?result.status:null,signal:['SIGTERM','SIGKILL','SIGABRT'].includes(result.signal)?result.signal:null,code:operationsDiagnostic(result.error).code??childCode};
}
