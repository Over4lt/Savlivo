// State eligibility only; worker identity and conflicts are checked separately.
export function resumeAllowed(job,events=[]){
 if(['STOPPED','INTERRUPTED','FAILED'].includes(job?.status))return true;
 // A previously executing job explicitly resumed by an operator can retry a
 // failed lease claim. An initially skipped admission is not checkpoint recovery.
 return job?.status==='SKIPPED_CONFLICT'&&job.error==='EXECUTION_LEASE_UNAVAILABLE'&&Number.isFinite(Date.parse(job.startedAt??''))&&events.some(e=>e.type==='RESUME_REQUESTED'&&e.jobId===job.id);
}
