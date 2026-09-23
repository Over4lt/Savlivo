import {operationsDiagnostic} from '../../../../services/api/src/v2-operations/diagnostics.mjs';
// Generic entry point to the existing mature cohort executor.
import {lifecycleMain} from './run-v15-mature-v2.mjs';
lifecycleMain(['--lifecycle',...process.argv.slice(2)]).catch(e=>{console.error(JSON.stringify(operationsDiagnostic(e,'native-check')));console.error(/^(LIFECYCLE_|HANDOFF_|AUTHORITY_|Usage:)/.test(e.message)?e.message:'MATURE_V2_STOPPED_INSPECT_LOCAL_CHECKPOINT');process.exitCode=1;});
