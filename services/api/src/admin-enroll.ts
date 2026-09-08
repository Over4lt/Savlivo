// Operator-only CLI, never imported by the HTTP server. Does not create an admin role.
import {adminConfiguration} from "./private-data-http.js";
import {issueEnrollmentGrant} from "./admin-passkeys.js";
import {privateDataPool} from "./private-data-db.js";
try {
  const id=process.argv[2], config=adminConfiguration();
  if(!config || !process.stdout.isTTY || process.env.ADMIN_ENROLLMENT_CONFIRM!=="issue-one-use-grant" ||
    !id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw new Error("OPERATOR_PRECHECK_FAILED");
  const token=await issueEnrollmentGrant(id,config);
  process.stdout.write(`One-use enrollment grant (expires in five minutes; do not log/share):\n${token}\n`);
} catch {process.stderr.write("Enrollment grant not issued. Check authorized local setup.\n");process.exitCode=1;}
finally {await privateDataPool.end();}
