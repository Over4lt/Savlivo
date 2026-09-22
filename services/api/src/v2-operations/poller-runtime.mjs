// Lifecycle of the existing poller, not a research controller.
// No historical PID is adopted or signalled: only ChildProcess handles spawned by this poller.
export function executionSpawnOptions(supervised=typeof process.send==='function'){
 return {detached:!supervised};
}
export async function runPoller({tick,heartbeat,children,intervalMs=15_000,drainMs=18_000,log=console.error}){
 let stop=false,wake=null,parentGone=false;const supervised=typeof process.send==='function';
 const halt=()=>{stop=true;wake?.();};
 const disconnected=()=>{parentGone=true;halt();};
 process.on('SIGTERM',halt);process.on('SIGINT',halt);process.on('disconnect',disconnected);
 const wait=()=>new Promise(resolve=>{const timer=setTimeout(done,intervalMs);function done(){clearTimeout(timer);wake=null;resolve();}wake=done;if(stop)done();});
 try{
  while(!stop){heartbeat('RUNNING');try{await tick(()=>stop);}catch(e){log('OPERATIONS_TICK_FAILED',e.message);}if(!stop)await wait();}
 }finally{
  halt();
  try{heartbeat('STOPPING');}catch(e){log('OPERATIONS_HEARTBEAT_FAILED',e.code);}
  const pending=[...children];
  for(const child of pending)try{child.kill('SIGTERM');}catch(e){log('OPERATIONS_CHILD_STOP_FAILED',e.code);}
  const deadline=Date.now()+drainMs;
  while(pending.some(c=>c.exitCode===null&&c.signalCode===null)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,50));
  for(const child of pending)if(child.exitCode===null&&child.signalCode===null)try{
   // Under the production supervisor all descendants share its poller group;
   // the supervisor applies the final group kill. Standalone mode owns detached groups.
   if(typeof process.send==='function')child.kill('SIGKILL');else process.kill(-child.pid,'SIGKILL');
  }catch(e){if(e.code!=='ESRCH')log('OPERATIONS_CHILD_KILL_FAILED',e.code);}
  try{heartbeat('STOPPED');}catch(e){log('OPERATIONS_HEARTBEAT_FAILED',e.code);}
  process.off('SIGTERM',halt);process.off('SIGINT',halt);process.off('disconnect',disconnected);
  if(process.connected)process.disconnect();
  if(supervised&&parentGone){try{process.kill(-process.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}}
 }
}
