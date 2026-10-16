import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {interpretWorkerArguments} from './runner.mjs';

test('isolated interpretation worker loads TypeScript contract imports with a scrubbed environment',()=>{
 const args=interpretWorkerArguments('/tmp/interpret-worker-import-check');
 assert.deepEqual(args.slice(0,2),['--import','tsx']);
 const child=spawnSync(process.execPath,args,{cwd:process.cwd(),env:{PATH:process.env.PATH??''},encoding:'utf8',timeout:15000});
 assert.equal(child.status,1);
 assert.match(child.stderr,/V2_OFFLINE_REPLAY_FAILED/);
 assert.doesNotMatch(child.stderr,/ERR_MODULE_NOT_FOUND/);
});
