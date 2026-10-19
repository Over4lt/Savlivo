import {runVerifiedBootstrap} from '../src/verified-history-bootstrap.ts';
import {pool} from '../src/db.ts';

const args=process.argv.slice(2);
const execute=args.includes('--execute');
const expected=args.find(value=>value.startsWith('--expected-digest='))?.slice('--expected-digest='.length);
const confirm=args.find(value=>value.startsWith('--confirm='))?.slice('--confirm='.length);
if(args.some(value=>!['--execute'].includes(value)&&!value.startsWith('--expected-digest=')&&!value.startsWith('--confirm='))||
  new Set(args.map(value=>value.split('=')[0])).size!==args.length)throw Error('BOOTSTRAP_INVALID_ARGUMENTS');
try{
 const result=await runVerifiedBootstrap({execute,expectedDigest:expected,confirm});
 process.stdout.write(JSON.stringify(result)+'\n');
}finally{await pool.end();}
