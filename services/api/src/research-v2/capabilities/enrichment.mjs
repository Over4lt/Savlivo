// Optional host capabilities; no network/renderer initialization on import.
import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import fs from 'node:fs';import {createHash} from 'node:crypto';
import {validateDirectProviderPage} from '../live/direct-provider-evidence.mjs';
import {discoverAssociatedResources,associatedResourceUrl} from '../../research-v1/associated-structured-resources.mjs';
import {validateSemanticOutput,semanticLimits} from '../../research-v1/semantic-price.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
export function pricingGap(target,page,result){
 return target.researchObjective!=='CATALOG_ONLY'&&!result.sufficient&&!result.verified?.length&&page.outcome==='OK'&&page.authority?.status==='CONFIGURED_REVIEWED';
}
export async function enrichProvider({capabilities,ledger,target,page,directory,result,charge,readResource,verify,env=process.env,createRuntime,createSemantic}){
 if(!pricingGap(target,page,result)||(!capabilities.browser&&!capabilities.groq))return result;
 const parent=validateDirectProviderPage({target,page,directory});let current=result;
 const refs=discoverAssociatedResources(parent);
 const rendering=(result.renderingRequired===true||target.demonstratedRendering===true||/enable javascript|requires javascript|javascript is required/i.test(parent.rawSource.text));
 if(capabilities.browser&&rendering&&refs.json.length===0&&(refs.scripts.length>0||/<script\b/i.test(parent.rawSource.text))){
  const execution=await ledger.attempt('browser',{service:target.service,url:parent.url,sourceHash:page.bodyHash,trigger:'STATIC_EXHAUSTED_RENDERING_REQUIRED'},async()=>{
   // Retained bytes can execute with DIRECT off; missing bytes cannot.
   const eligibleRead=async args=>{
    if(!associatedResourceUrl(args.url,parent.url)||!target.authorities.some(a=>a.hostname===new URL(args.url).hostname))throw Error('BROWSER_RESOURCE_AUTHORITY_REQUIRED');
    const retained=[...(parent.associatedScriptEvidence??[]),...(parent.structuredResources??[])].find(p=>p.url===args.url&&p.rawSource?.text&&sha(p.rawSource.text)===p.sourceIntegrity?.sha256&&p.accessDecisions?.length&&p.accessDecisions.every(d=>['ALLOWED','NO_ROBOTS_POLICY'].includes(d.decision)));
    if(retained)return retained;
    if(!capabilities.direct||!readResource)throw Error('NO_POLICY_AUTHORIZED_RESOURCE_TRANSPORT');return readResource(args);
   };
   const scripts=[];for(const ref of refs.scripts){if(!target.authorities.some(a=>a.hostname===new URL(ref.url).hostname))continue;const p=await eligibleRead({url:ref.url,kind:'SCRIPT',maxBytes:512000});if(p.outcome==='OK')scripts.push(p);}
   const staticRefs=discoverAssociatedResources(parent,scripts);if(staticRefs.json.length){const resources=[];for(const ref of staticRefs.json){const p=await eligibleRead({url:ref.url,kind:'JSON',maxBytes:256000});if(p.outcome==='OK')resources.push({page:p});}return {status:'STATIC_RESOURCE_DISCOVERED',reason:'BROWSER_NOT_NEEDED',execution:{resources}};}
   const {createPageRuntime,qualifyPageRuntime}=createRuntime?{}:await import('./bounded-page-runtime.mjs');

   const runtime=createRuntime?await createRuntime():createPageRuntime({available:()=>true,artifactDirectory:directory+'/browser-artifacts'});
   const acquired=await runtime.execute({parent:{...parent,structuredResourceDiscovery:{status:'NO_STATIC_STRUCTURED_RESOURCE_ACQUIRED'}},bindingRef:page.bodyHash,staticExhausted:true,readResource:eligibleRead});
   return {status:acquired.outcome,reason:acquired.reason,execution:acquired};
  });
  // Only independently reviewed intact resource pages enter mature verification.
  // No synthetic DERIVED authority or inherited sibling-host trust.
  for(const resource of execution.execution?.resources??[]){const p=resource.page;if(p.authority?.status!=='CONFIGURED_REVIEWED')continue;const body=p.rawSource?.text;if(!body||sha(body)!==p.sourceIntegrity?.sha256)continue;
   fs.mkdirSync(directory+'/bodies',{recursive:true});p.bodyHash=sha(body);p.bodyFile='bodies/'+p.bodyHash+'.txt';fs.writeFileSync(directory+'/'+p.bodyFile,body);current=await verify({target,page:p,directory});if(current.sufficient)break;
  }
  current={...current,browser:{status:execution.status,reason:execution.reason}};
 }
 if(capabilities.groq&&pricingGap(target,page,current)){
  // Bounded existing provider container, not search text or an entire document.
  const containers=[...parent.rawSource.text.matchAll(/<(?:article|section|li|div)\b[^>]*>([^]*?)<\/(?:article|section|li|div)>/gi)].map(m=>({text:m[0],offset:m.index}));
  const span=containers.find(c=>Buffer.byteLength(c.text)<=semanticLimits.maxContainerBytes&&/(?:USD|EUR|GBP|NOK|SEK|DKK|\$|€|£)/.test(c.text)&&/\d/.test(c.text)&&!/<script\b|<style\b|\bhidden\b/i.test(c.text));
  if(span){const interpretation=await ledger.attempt('groq',{service:target.service,url:parent.url,sourceHash:sha(page.bodyHash+':'+span.offset+':'+span.text),trigger:'UNRESOLVED_PRICING_SEMANTICS',policy:'PROVIDER_CONTAINER_SEMANTICS_V1'},async()=>{
    const factory=createSemantic??(await import('./semantic-price-runtime.mjs')).createSemanticPriceRuntime;
    const runtime=await factory({env:{...env,SAVLIVO_PRICE_SEMANTIC_ENABLED:'true'}});
    charge(target.service,'GROQ');
    const context={sourceUrl:parent.url,sourceHash:page.bodyHash,service:target.serviceName,market:target.market,text:span.text,container:{offset:span.offset,sha256:sha(span.text)},policy:runtime.policy};
    const output=await runtime.interpret({context,signal:AbortSignal.timeout(semanticLimits.timeoutMs)});const offers=validateSemanticOutput(output,context).offers;
    // A grounded semantic proposal is not a verified price. Re-run the SAME
    // source verifier; never manufacture translated provider text or authority.
    const checked=await verify({target,page,directory});
    let proposalVerification={decisions:[]};if(offers.length&&checked.runDirectory){const proposalFile=directory+'/semantic-'+sha(JSON.stringify(context))+'.json';fs.writeFileSync(proposalFile,JSON.stringify({context,output,runDirectory:checked.runDirectory}),{flag:'wx',mode:0o600});await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[fileURLToPath(new URL('./semantic-verification-worker.mjs',import.meta.url)),proposalFile],{env:{PATH:process.env.PATH??''},stdio:'ignore'});child.on('error',reject);child.on('exit',n=>n===0?resolve():reject(Error('SEMANTIC_VERIFICATION_FAILED')));});proposalVerification=JSON.parse(fs.readFileSync(proposalFile+'.verification.json'));}
    return {proposalVerification,status:offers.length?'SOURCE_GROUNDED_PROPOSAL':'ABSTAINED',sourceHash:page.bodyHash,container:context.container,offers,model:runtime.policy.modelRevision,verifierOutcome:proposalVerification.decisions.some(d=>d.status==='V2_VERIFIED')?'VERIFIED':'UNRESOLVED',verified:checked.verified??[]};
   });current={...current,semanticInterpretation:interpretation};}
 }
 return current;
}
