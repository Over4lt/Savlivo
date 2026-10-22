// One gate is shared by all markets in a canonical Suggested Only batch.
// Google's project quota also includes callers outside this process; a 429
// therefore pauses this batch, but cannot grant project-wide capacity.
export function createSuggestedOnlyGoogleGate({minimumIntervalMs=1000,rateLimitCooldownMs=30000,now=()=>Date.now(),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
 if(!Number.isSafeInteger(minimumIntervalMs)||minimumIntervalMs<0||!Number.isSafeInteger(rateLimitCooldownMs)||rateLimitCooldownMs<0)throw Error('SUGGESTED_ONLY_RATE_CONFIG_INVALID');
 let nextAt=0,cooldownUntil=0,tail=Promise.resolve();
 return {
  before(){
   const reservation=tail.then(async()=>{
    while(true){const delay=Math.max(nextAt,cooldownUntil)-now();if(delay<=0)break;await sleep(delay);}
    nextAt=now()+minimumIntervalMs;
   });
   tail=reservation.catch(()=>{});
   return reservation;
  },
  after(requestStatus){
   if(requestStatus==='HTTP_429')cooldownUntil=Math.max(cooldownUntil,now()+rateLimitCooldownMs);
  }
 };
}
