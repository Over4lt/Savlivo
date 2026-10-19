// Explicit operator-invoked, read-only preflight. No commit command exists.
import path from 'node:path';
import {loadRetainedVerifiedEvidence,preflightRetainedVerifiedV1,snapshotVerifiedTargetV1} from '../src/v2-operations/verified-reconciliation-v1.mjs';
import {pool} from '../src/db.ts';

const [mode,jobId,service,market,sourceHash]=process.argv.slice(2);
if(mode!=='--read-only-preflight'||!jobId||!service||!market||!sourceHash){
 throw Error('USAGE: --read-only-preflight JOB_ID SERVICE MARKET SOURCE_SHA256');
}
const runsRoot=path.resolve(process.env.V2_OPERATIONS_STATE_ROOT??path.join(process.cwd(),'.savlivo/v2-operations'),'runs');
try{
 const evidence=loadRetainedVerifiedEvidence({runsRoot,jobId,service,market,sourceHash});
 const result=await preflightRetainedVerifiedV1({evidence,snapshot:snapshotVerifiedTargetV1});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}finally{await pool.end();}
