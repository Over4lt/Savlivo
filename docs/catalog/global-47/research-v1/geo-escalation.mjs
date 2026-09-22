import {runtimeSessionBudget} from './runtime-session-budget.mjs';
import {decodoOnlyPolicy,validateAcquisitionPolicy,validateMarketAcquisition} from './acquisition-policy.mjs';
// Existing executor gap consumer. No provider onboarding, payment operations or runtime imports.
import assert from 'node:assert/strict';
import {validPriceGeo} from './price-geo-evidence.mjs';
import {createRobotsPublicAdapter} from './robots-access.mjs';
import {normalizePublicUrl,publicAddress,PublicNetworkError} from './public-network.mjs';
import {researchDimensions,boundedCall,unknownCost} from './executor-adapters.mjs';
import {timestamp} from './contract.mjs';
import {selectGeoProviders,createGeoBinding,geoId,money,verificationPolicy} from './geo-provider.mjs';

const permitted=d=>['ALLOWED','NO_ROBOTS_POLICY'].includes(d.decision);
const official=s=>['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT'].includes(s.sourceType);
const failureCodes=new Set(['TIMEOUT','ABORTED','NETWORK_FAILED','DNS_FAILED','UNSAFE_DNS','UNSAFE_HOST','UNSUPPORTED_URL',
  'EXIT_VERIFIER_UNAVAILABLE','BINDING_CHANGED','BRACKET_EXIT_CHANGED','PROVIDER_METADATA_CONFLICT','BRACKET_TIME_LIMIT','EXIT_COUNTRY_MISMATCH','EXIT_CHANGED','SECRET_IN_RESPONSE','READ_BUDGET_EXHAUSTED','NETWORK_BUDGET_EXHAUSTED','ROBOTS_ACCESS_STOP',
  'INVALID_REDIRECT','REDIRECT_LIMIT','REDIRECT_LOOP','RESPONSE_TOO_LARGE','UNSUPPORTED_CONTENT']);
const code=e=>failureCodes.has(e?.code)?e.code:e?.message==='Adapter timeout'?'TIMEOUT':'ADAPTER_FAILED'; // Never serialize exception text/credentials.
const clone=v=>structuredClone(v);

import {localizedHistoryComplete} from './price-localized-access.mjs';

export function admittedGeoGap({researchId,gap,freeAttempts,freeComplete}){
  if(!researchId||!gap||freeComplete!==true||!researchDimensions.includes(gap.evidenceGap)
    ||typeof gap.reasonForEscalation!=='string'||!gap.reasonForEscalation.trim()||!gap.sourceUrls?.length||!gap.freeAttempts?.length)return {allowed:false,reason:'NO_ADMITTED_GEO_GAP'};
  try{
    assert(Buffer.byteLength(JSON.stringify({gap,freeAttempts}))<=1000000,'Gap input exceeds bound');
    assert(/^[A-Z]{2}$/.test(gap.targetCountry));assert(gap.sourceUrls.length<=24);
    for(const url of gap.sourceUrls){normalizePublicUrl(url);
      const matching=freeAttempts.filter(a=>a.source?.url===url);
      if(matching.some(a=>a.outcome==='ACCESS_CONTROL_STOP'||a.source.accessDecisions?.some(d=>!permitted(d))))return {allowed:false,reason:'ACCESS_POLICY_STOP'};
      const source=matching.find(a=>gap.freeAttempts.includes(a.id)&&['OK','GEO_BLOCKED','UNRESOLVED'].includes(a.outcome)&&official(a.source)
        &&a.source.geoGaps?.some(g=>g.fact===gap.evidenceGap&&g.requiresTargetGeo===true&&g.reason?.trim()));
      assert(source,'No originating geographic evidence');
      if(gap.evidenceGap==='prices'){
        assert(gap.priceScope?.countryCode===gap.targetCountry);
        assert(source.stage==='LOCALIZED_URL'||source.stage==='SUPPORT'||localizedHistoryComplete(gap,freeAttempts));
        assert(source.source.geoGaps.some(g=>validPriceGeo(g,source.source,gap.priceScope)),'Scoped price geographic proof missing');
      }
      assert(source.source.accessDecisions?.some(d=>d.targetUrl===url&&permitted(d)),'Missing permitted target policy');
    }
    return {allowed:true,reason:'EXISTING_UNRESOLVED_GEOGRAPHIC_EVIDENCE'};
  }catch{return {allowed:false,reason:'UNSAFE_OR_UNSUPPORTED_GAP'};}
}

/** One engine per research run. Registry, transports, verifier and budget hook are trusted
 * operator dependencies, never model-controlled. No providers/credentials are installed. */
export function createGeoEscalation({providers=[],transports={},resolveSecret=()=>null,verifier,clock,
  robotsAdapterFactory=createRobotsPublicAdapter,resolveHost,limits:input={},authorities=[],proofVersion=1,acquisitionPolicy=null,imageResources=false,pageRuntime=null}={}){
  assert(typeof imageResources==='boolean');assert(!imageResources||proofVersion===2,'IMAGE_BRACKET_REQUIRED');
  validateAcquisitionPolicy(acquisitionPolicy);assert(typeof clock==='function');assert([1,2].includes(proofVersion));
  const limits={providers:3,reads:6,networkRequests:18,timeoutMs:10000,...input};
  assert(Object.keys(input).every(k=>['providers','reads','networkRequests','timeoutMs'].includes(k)));
  for(const n of Object.values(limits))assert(Number.isSafeInteger(n)&&n>0&&n<=1000000);
  const registry=clone(providers),used={providers:0,reads:0,networkRequests:0,controlRequests:0};let busy=false,costHalted=false;
  return {version:proofVersion,runtimeAvailable:pageRuntime?.available===true,runtimeAcquisitionVersion:pageRuntime?.available===true?pageRuntime.acquisitionVersion??null:null,
    async execute({researchId,runId,gap,freeAttempts,freeComplete,locale=null,budgetDecision,remainingReads=0,consume=()=>{},pathMemoryDecision=null,experimentalAcquisition=null}){
      const at=clock();timestamp(at);
      if(experimentalAcquisition){
        const x=experimentalAcquisition;
        assert(acquisitionPolicy===decodoOnlyPolicy&&proofVersion===2&&x.policy===acquisitionPolicy,'Experimental transport not authorized');
        validateMarketAcquisition(x,acquisitionPolicy);
        assert(!gap&&!freeAttempts&&!freeComplete,'Experimental acquisition cannot fabricate free history');
        const url=normalizePublicUrl(x.url);assert(url.protocol==='https:');
        gap={targetCountry:x.countryCode,evidenceGap:'prices',sourceUrls:[url.href]};
      }
      const output={schemaVersion:proofVersion,researchId,runId,targetCountry:gap?.targetCountry??null,checkedAt:at,
        gap:experimentalAcquisition?null:gap?clone(gap):null,...(experimentalAcquisition?{experimentalAcquisition:clone(experimentalAcquisition)}:{}),limits:{...limits,remainingReads},selection:null,attempts:[],outcome:'UNRESOLVED',reason:null,used:null};
      const before=clone(used);let logical=0;
      const done=()=>{output.used=Object.fromEntries(Object.keys(used).map(k=>[k,used[k]-before[k]]));return output;};
      const admission=experimentalAcquisition?{allowed:true}:admittedGeoGap({researchId,gap,freeAttempts,freeComplete});
      if(!admission.allowed){output.reason=admission.reason;return done();}
      if(costHalted){output.reason='COST_POLICY_STOP';return done();}
      if(busy){output.reason='CONCURRENT_GEO_NOT_ALLOWED';return done();}busy=true;
      try{
        assert(Number.isSafeInteger(remainingReads)&&remainingReads>=0&&typeof consume==='function');
        assert(typeof runId==='string'&&runId.length>0&&runId.length<=200);
        const secrets=new Map();
        const secretAvailable=ref=>{try{const value=resolveSecret(ref);if(typeof value!=='string'||!value.trim())return false;secrets.set(ref,value);return true;}catch{return false;}};
        const selected=selectGeoProviders(experimentalAcquisition?registry.filter(p=>p.id==='decodo'&&p.costClass==='PAID'&&p.verification?.level==='BRACKET_VERIFIED'):registry,{targetCountry:gap.targetCountry,capability:'PUBLIC_HTTP',transports,secretAvailable});
        output.selection={considered:selected.considered,order:selected.eligible.map(p=>p.id),comparison:selected.comparison};
        if(!selected.eligible.length){output.reason='NO_CONFIGURED_GEO_PROVIDER';return done();}
        if(!verifier?.approved||typeof verifier.parse!=='function'){output.reason='EXIT_VERIFIER_UNAVAILABLE';return done();}
        assert(typeof verifier.id==='string'&&/^[\w:-]{1,120}$/.test(verifier.id));
        const verificationUrl=normalizePublicUrl(verifier.url).href;assert(verificationUrl.startsWith('https:'));
        for(const p of selected.eligible){
          if(pathMemoryDecision){const decision=pathMemoryDecision(p,gap);assert(['TRY','PREFER','SKIP'].includes(decision.decision));
           (output.selection.memory??=[]).push({providerId:p.id,...clone(decision)});if(decision.decision==='SKIP')continue;}

          const proofPolicy=verificationPolicy(p),bracket=proofPolicy.level==='BRACKET_VERIFIED';
          if(proofPolicy.version>proofVersion){output.reason='PROOF_VERSION_UNSUPPORTED';continue;}
          const requiredReads=bracket?3:2;
          if(used.providers>=limits.providers||logical+requiredReads>remainingReads||used.reads+requiredReads>limits.reads||used.networkRequests>=limits.networkRequests){output.reason='GEO_BUDGET_EXHAUSTED';break;}
          // An independent configured source, not the gateway's own country claim.
          if(new URL(verificationUrl).hostname===new URL(p.endpoint).hostname){output.reason='VERIFIER_NOT_INDEPENDENT';continue;}
          const attemptId='geo-'+geoId([runId,researchId,gap.evidenceGap,used.providers,p.id,...(experimentalAcquisition?[experimentalAcquisition.actionId,gap.sourceUrls[0]]:[])]);
          const attemptStarted=performance.now();
          const a={id:attemptId,providerId:p.id,costClass:p.costClass,method:'APPROVED_PROXY',mode:p.mode,
            targetCountry:gap.targetCountry,bindingRef:attemptId,sessionRef:p.mode==='SESSION'?attemptId+'-session':null,
            requestedUrl:gap.sourceUrls[0],finalUrl:null,redirects:[],locale,checkedAt:clock(),gapFact:gap.evidenceGap,
            reportedExitCountry:null,exitVerification:{status:'UNKNOWN',country:null,address:null,method:verifier.id,evidence:null},
            estimatedCost:clone(p.cost.estimate),authorizedCeiling:clone(p.cost.ceiling),actualCost:unknownCost(),authorization:null,
            outcome:'UNRESOLVED',failure:null,cleanup:'NOT_REQUIRED',settlement:null,receipts:[],reads:[],page:null};
          if(proofVersion===2)a.transportVerification={version:2,level:'UNVERIFIED',requestedLevel:proofPolicy.level,
            providerId:p.id,bindingRef:attemptId,targetCountry:gap.targetCountry,before:null,after:null,target:null,
            equality:false,continuity:'NOT_ESTABLISHED',conflicts:[],
            limitation:bracket?'Same independently observed exit before and after on one approved sticky binding; not cryptographic per-hop proof. Unobservable transient rotations cannot be excluded.':'Approved hop receipts plus independent exit check; receipt trust depends on the reviewed transport.'};
          output.attempts.push(a);
          if(p.costClass==='PAID'){
            if(typeof budgetDecision!=='function'){a.failure='NO_BUDGET_AUTHORIZATION';continue;}
            try{
              const auth=await boundedCall(budgetDecision,{operation:'RESERVE',researchId,runId,targetCountry:gap.targetCountry,
                attemptId,providerId:p.id,ceiling:clone(p.cost.ceiling)}, {timeoutMs:limits.timeoutMs,maxResponseBytes:10000});
              if(auth?.allowed===false){a.failure=['NO_AUTHORIZATION','INSUFFICIENT_BUDGET','BUDGET_FROZEN','DUPLICATE_RESERVATION'].includes(auth.reason)?auth.reason:'BUDGET_DENIED';continue;}
              assert(auth?.allowed===true&&typeof auth.reservationId==='string'&&/^[\w:-]{1,120}$/.test(auth.reservationId));
              assert(Array.isArray(auth.authorizationIds)&&auth.authorizationIds.length>0&&auth.authorizationIds.length<=3&&auth.authorizationIds.every(s=>typeof s==='string'&&/^[\w:-]{1,120}$/.test(s)));
              assert.deepEqual(auth.ceiling,p.cost.ceiling);a.authorization={allowed:true,reservationId:auth.reservationId,authorizationIds:[...auth.authorizationIds],ceiling:clone(p.cost.ceiling)};
            }catch{a.failure='BUDGET_DENIED_OR_UNAVAILABLE';continue;}
          }
          used.providers++;
          const bodyBudget=experimentalAcquisition&&bracket&&pageRuntime?.available===true?runtimeSessionBudget():null;
          const binding=createGeoBinding(p,transports[p.transportRef],{bindingRef:attemptId,targetCountry:gap.targetCountry,
            bodyBudget,secret:secrets.get(p.secretRef)??null,timeoutMs:limits.timeoutMs,ceiling:p.cost.ceiling,maxRequests:limits.networkRequests-used.networkRequests,onControl:()=>{used.controlRequests++;}});
          let policyStop=false,bodyStage='PARENT';
          const boundRequest=(r,stage=bodyStage)=>binding.requestOnce({...r,...(bodyBudget?{bodyStage:r.robotsPolicyRetrieval&&stage!=='RUNTIME'?'ROBOTS':stage,...(['BEFORE','AFTER'].includes(stage)&&!r.robotsPolicyRetrieval?{maxBytes:Math.min(r.maxBytes,10000)}:{})}:{})});
          const charge=kind=>{
            if(kind==='READ'){
              if(used.reads>=limits.reads||logical>=remainingReads)throw Object.assign(Error(),{code:'READ_BUDGET_EXHAUSTED'});
              consume('READ');used.reads++;logical++;
            }else{
              if(used.networkRequests>=limits.networkRequests)throw Object.assign(Error(),{code:'NETWORK_BUDGET_EXHAUSTED'});
              consume('NETWORK');used.networkRequests++;
            }
          };
          // Fresh wrapper per binding: no direct/provider/session cache reuse. Existing parser,
          // per-hop policy, body limits, URL/DNS checks and extraction remain authoritative.
          const reader=robotsAdapterFactory({clock,authorities,...(gap.evidenceGap==='prices'?{retainRaw:true}:{}),maxReads:requiredReads,maxRequests:limits.networkRequests,
            network:{...(experimentalAcquisition?{pricingResources:true}:{}),...(gap.evidenceGap==='prices'?{mixedJsonUrls:[gap.sourceUrls[0]]}:{}),...(resolveHost?{resolveHost}:{}),...(verifier.format==='JSON'?{jsonUrls:[verificationUrl]}:{}),requestOnce:r=>boundRequest(r),timeoutMs:limits.timeoutMs}});
          const read=async url=>{charge('READ');const page=await reader.read({url,locale,targetCountry:gap.targetCountry,maxRedirects:4,consumeNetwork:()=>charge('NETWORK')});
            a.reads.push({url:page.url,outcome:page.outcome,httpStatus:page.httpStatus??null,failure:page.failure??null,...(page.bodyDiagnostic?{bodyDiagnostic:page.bodyDiagnostic}:{}),redirects:page.redirects,accessDecisions:page.accessDecisions??[],indexingDirectives:page.indexingDirectives??null});
            if(page.outcome==='ACCESS_CONTROL_STOP'||page.httpStatus===402||['ACCESS_CONTROL_STOP','UNSAFE_DNS','UNSAFE_HOST','UNSUPPORTED_URL'].includes(page.failure?.code))policyStop=true;return page;};
          try{
            const opened=await binding.open();a.reportedExitCountry=opened.reportedCountry;if(opened.transportMetadata)a.transportMetadata=opened.transportMetadata;
            if(bracket){
              a.reportedExitAddress=opened.reportedAddress;
              // Admission observations are transport-unverified and never service evidence.
              // Refresh in this binding before the target bracket; no extra logical page read.
              try{a.transportVerification.accessAdmission={level:'UNVERIFIED',decisions:await reader.checkAccess(a.requestedUrl,{consumeNetwork:()=>charge('NETWORK')})};}
              catch(e){policyStop=true;a.transportVerification.accessAdmission={level:'UNVERIFIED',decisions:e.accessDecisions??[]};throw e;}
            }
            const verify=async phase=>{
              bodyStage=phase==='before'?'BEFORE':'AFTER';const exitPage=await read(verificationUrl);bodyStage='PARENT';
              if(exitPage.outcome!=='OK')throw new PublicNetworkError(failureCodes.has(exitPage.failure?.code)?exitPage.failure.code:'EXIT_VERIFIER_UNAVAILABLE');
              assert(typeof exitPage.extraction?.text==='string'&&exitPage.extraction.text.length<=10000,'Bounded exit evidence required');
              const exit=await boundedCall(verifier.parse,{text:exitPage.extraction.text}, {timeoutMs:limits.timeoutMs,maxResponseBytes:10000});
              assert(exit&&Object.keys(exit).length===2&&/^[A-Z]{2}$/.test(exit.country)&&publicAddress(exit.address));
              const receipt=binding.receipts().findLast(r=>r.url===exitPage.url);
              assert(receipt&&(bracket||receipt.exitAddress===exit.address),'Verifier IP does not match binding');
              const evidence={status:exit.country===gap.targetCountry?'MATCH':'MISMATCH',country:exit.country,address:exit.address,
                method:verifier.id,evidence:{url:exitPage.url,checkedAt:exitPage.checkedAt,bindingRef:attemptId,bodySha256:receipt.bodySha256,text:exitPage.extraction.text}};
              if(phase==='before')a.exitVerification=evidence;
              if(proofVersion===2)a.transportVerification[phase]=clone(evidence);
              if(exit.country!==gap.targetCountry)throw new PublicNetworkError('EXIT_COUNTRY_MISMATCH');
              return exit;
            };
            const bracketStartedAt=bracket?clock():null,bracketStartMonotonic=bracket?performance.now():null;
            if(bracket)timestamp(bracketStartedAt);
            const exit=await verify('before');
            if(!bracket)binding.setVerifiedExit(exit.address);
            const startedAt=proofVersion===2?clock():null;if(proofVersion===2)timestamp(startedAt);
            const page=await read(a.requestedUrl);a.finalUrl=page.url;a.redirects=page.redirects;
            if(proofVersion===2)a.transportVerification.target={requestedUrl:a.requestedUrl,finalUrl:page.url,redirects:page.redirects,startedAt,completedAt:clock(),outcome:page.outcome};
            if(page.outcome==='OK'){
              const structured=[];let resourceScripts=[],runtimeEvidence=null;
              if(experimentalAcquisition&&bracket&&page.authority?.status==='CONFIGURED_REVIEWED'&&page.sourceType==='OFFICIAL_PROVIDER'&&page.contentType==='text/html'){
                const {discoverAssociatedResources,structuredResourceLimits:L,structuredResourceVersion}=await import('./associated-structured-resources.mjs');
                let discovery=discoverAssociatedResources(page),bytes=0;
                page.structuredResourceDiscovery={version:structuredResourceVersion,attempts:[],diagnostics:discovery.diagnostics,limited:discovery.limited};
                a.structuredResourceDiscovery=page.structuredResourceDiscovery;
                const fetchResource=async ref=>{
                  if(logical+2>remainingReads||used.reads+2>limits.reads||bytes>=L.totalBytes){page.structuredResourceDiscovery.diagnostics.push('RESOURCE_BUDGET_BOUND');return null;}
                  const limit=Math.min(ref.kind==='SCRIPT'?L.scriptBytes:L.jsonBytes,L.totalBytes-bytes);
                  const resourceReader=robotsAdapterFactory({clock,authorities:[],retainRaw:true,maxReads:1,maxRequests:limits.networkRequests,
                    network:{...(ref.kind==='SCRIPT'?{scriptUrls:[ref.url],scriptScan:{parentUrl:page.url,parentHash:page.sourceIntegrity.sha256,parentReference:ref,maxBytes:limit}}:{structuredJsonUrls:[ref.url]}),maxBytes:limit,timeoutMs:limits.timeoutMs,...(resolveHost?{resolveHost}:{}),requestOnce:r=>boundRequest(r,'STATIC')}});
                  charge('READ');const child=await resourceReader.read({url:ref.url,locale,targetCountry:gap.targetCountry,maxRedirects:0,consumeNetwork:()=>charge('NETWORK')});
                  const row={url:ref.url,kind:ref.kind,reference:ref,outcome:child.outcome,failure:child.failure??null,...(child.bodyDiagnostic?{bodyDiagnostic:clone(child.bodyDiagnostic)}:{}),httpStatus:child.httpStatus??null,accessDecisions:child.accessDecisions??[]};
                  a.reads.push(row);page.structuredResourceDiscovery.attempts.push(row);
                  if(child.scriptScan){bytes+=child.scriptScan.bytesScanned;row.scriptScan=clone(child.scriptScan);return child;}
                  if(child.rawSource?.text)bytes+=Buffer.byteLength(child.rawSource.text);
                  if(child.outcome!=='OK'||child.httpStatus!==200)return null;
                  if(ref.kind==='SCRIPT'?!['application/javascript','text/javascript'].includes(child.contentType):child.contentType!=='application/json'){row.outcome='UNRESOLVED';row.failure={code:'RESOURCE_CONTENT_TYPE'};return null;}
                  if(ref.kind==='JSON'){try{JSON.parse(child.rawSource.text);}catch{row.outcome='UNRESOLVED';row.failure={code:'RESOURCE_JSON_INVALID'};return null;}}
                  return child;
                };
                // Explicit JSON references take priority; scripts are discovery only, never price evidence.
                for(const ref of discovery.json){const child=await fetchResource(ref);if(child)structured.push({child,reference:ref});}
                if(!discovery.json.length){
                  for(const ref of discovery.scripts){const child=await fetchResource(ref);if(child)resourceScripts.push(child);if(child?.scriptScan?.matches.length)break;}
                  discovery=discoverAssociatedResources(page,resourceScripts);page.structuredResourceDiscovery.diagnostics.push(...discovery.diagnostics);
                  for(const ref of discovery.json){const child=await fetchResource(ref);if(child)structured.push({child,reference:ref});}
                }
                page.structuredResourceDiscovery.status=structured.length?'STRUCTURED_ACQUIRED':'NO_STATIC_STRUCTURED_RESOURCE_ACQUIRED';
                page.structuredResourceDiscovery.observedBytes=bytes;
                // Preserve even unresolved script evidence for offline diagnosis and hash-checked replay.
                page.associatedScriptEvidence=resourceScripts;
              }
              // Fall back inside this verified binding; do not wait for a later controller action.
              if(experimentalAcquisition&&bracket&&pageRuntime?.available===true&&!structured.length&&page.structuredResourceDiscovery?.status==='NO_STATIC_STRUCTURED_RESOURCE_ACQUIRED'){
                const execution=await pageRuntime.execute({parent:page,bindingRef:attemptId,clock,staticExhausted:true,readResource:async({url,kind,maxBytes,signal,onBytes})=>{
                  if(logical+2>remainingReads||used.reads+2>limits.reads)throw new PublicNetworkError('READ_BUDGET_EXHAUSTED');
                  const rr=robotsAdapterFactory({clock,retainRaw:true,authorities:[],maxReads:1,maxRequests:limits.networkRequests,network:{retainRuntimeCors:true,...(kind==='SCRIPT'?{scriptUrls:[url]}:{structuredJsonUrls:[url]}),maxBytes,timeoutMs:limits.timeoutMs,onBodyBytes:onBytes,...(resolveHost?{resolveHost}:{}),requestOnce:r=>boundRequest(r,'RUNTIME')}});
                  charge('READ');const child=await rr.read({url,locale,targetCountry:gap.targetCountry,signal,maxRedirects:0,consumeNetwork:()=>charge('NETWORK')});
                  a.reads.push({url,kind:'RUNTIME_'+kind,...(child.bodyDiagnostic?{bodyDiagnostic:child.bodyDiagnostic}:{}),outcome:child.outcome,httpStatus:child.httpStatus??null,failure:child.failure??null,accessDecisions:child.accessDecisions??[]});return child;
                }});
                // Replay bodies are diagnostic artifacts on the attempt, not pricing/model input.
                const {retainedScripts,retainedParent,retainedScriptBytes,diagnostics,screenshot,...summary}=execution;
                runtimeEvidence={...summary,resources:execution.resources.map(r=>r.observation)};
                a.runtimeExecution={...runtimeEvidence,retainedScripts,retainedParent,retainedScriptBytes,diagnostics,screenshot};page.runtimeExecution=runtimeEvidence;
                if(execution.outcome==='CAPTURED'&&execution.cleanup==='CLOSED')for(const resource of execution.resources)structured.push({child:resource.page,reference:{...resource.observation,basis:'OBSERVED_RUNTIME_REQUEST'}});
              }
              const assets=[];
              if(imageResources&&experimentalAcquisition&&bracket){
                // Dormant low-level contract exercised only by explicit offline fixtures.
                // Canonical runtime factories never enable this option.
                const {associatedImages,imageDimensions,imageHash,imageLimits,imageResourceVersion}=await import('./image-resource.mjs');
                const refs=associatedImages(page,authorities);let assetBytes=0;page.imageResourceOutcome={eligible:refs.length,attempted:0,acquired:0,reason:refs.length?'BOUNDED_ASSOCIATED_IMAGES':'NO_REVIEWED_ASSOCIATED_IMAGES'};
                for(const ref of refs){
                  // Leave the mandatory AFTER read reserved. Never open another session.
                  if(logical+2>remainingReads||used.reads+2>limits.reads)break;
                  const imageReader=robotsAdapterFactory({clock,authorities,maxReads:1,maxRequests:limits.networkRequests,network:{imageUrls:[ref.url],maxBytes:Math.min(imageLimits.bytes,imageLimits.totalBytes-assetBytes),...(resolveHost?{resolveHost}:{}),requestOnce:r=>boundRequest(r),timeoutMs:limits.timeoutMs}});
                  charge('READ');page.imageResourceOutcome.attempted++;const imageRead={url:ref.url,kind:'IMAGE',outcome:'IN_FLIGHT'};a.reads.push(imageRead);let response;try{response=await imageReader.readImage({url:ref.url,locale,consumeNetwork:()=>charge('NETWORK')});}catch(e){if(e.accessDecisions?.some(d=>!permitted(d))||['ACCESS_CONTROL_STOP','ROBOTS_ACCESS_STOP'].includes(e.code))policyStop=true;throw e;}
                  if([401,402,403,407,429,451].includes(response.status)){policyStop=true;throw new PublicNetworkError('ACCESS_CONTROL_STOP');}
                  Object.assign(imageRead,{outcome:response.status===200?'OK':'UNRESOLVED',httpStatus:response.status,contentType:response.contentType,accessDecisions:response.accessDecisions});assert(response.status===200&&Buffer.isBuffer(response.bytes),'IMAGE_RESPONSE');page.imageResourceOutcome.acquired++;assetBytes+=response.bytes.length;assert(assetBytes<=imageLimits.totalBytes,'IMAGE_TOTAL_BOUND');
                  const authority=authorities.find(a=>a.hostname===new URL(ref.url).hostname&&a.provider===page.authority.provider);
                  assets.push({version:imageResourceVersion,url:response.url,parentUrl:page.url,parentHash:page.sourceIntegrity.sha256,reference:ref,contentType:response.contentType,sha256:imageHash(response.bytes),byteCount:response.bytes.length,base64:response.bytes.toString('base64'),dimensions:imageDimensions(response.bytes,response.contentType),checkedAt:clock(),bindingRef:attemptId,receipt:clone(binding.receipts().findLast(r=>r.url===response.url)),authority:{...authority,status:'CONFIGURED_REVIEWED'},accessDecisions:response.accessDecisions});
                  if(assetBytes>=imageLimits.totalBytes)break;
                }
              }
              if(bracket){
                const after=await verify('after'),endedAt=clock();timestamp(endedAt);
                if(performance.now()-bracketStartMonotonic>limits.timeoutMs*3||Date.parse(startedAt)<Date.parse(bracketStartedAt)||Date.parse(endedAt)<Date.parse(startedAt)||Date.parse(endedAt)-Date.parse(bracketStartedAt)>limits.timeoutMs*3)throw new PublicNetworkError('BRACKET_TIME_LIMIT');
                const tv=a.transportVerification;
                tv.equality=after.address===exit.address&&after.country===exit.country;
                tv.continuity='NO_OBSERVED_CHANGE';
                const reports=[{reportedCountry:a.reportedExitCountry,reportedAddress:a.reportedExitAddress},...binding.receipts()];
                tv.conflicts=reports.filter(r=>r.reportedCountry&&r.reportedCountry!==exit.country||r.reportedAddress&&r.reportedAddress!==exit.address)
                  .map(r=>({type:'PROVIDER_VS_INDEPENDENT',reportedCountry:r.reportedCountry??null,reportedAddress:r.reportedAddress??null,url:r.url??null}));
                if(tv.conflicts.length)throw new PublicNetworkError('PROVIDER_METADATA_CONFLICT');
                if(!tv.equality)throw new PublicNetworkError('BRACKET_EXIT_CHANGED');
              }
              if(proofVersion===2)a.transportVerification.level=proofPolicy.level;
              if(assets.length)page.imageAssets=assets.map(asset=>({...asset,proof:clone(a.transportVerification)}));
              if(structured.length){
                const parent=clone(page);delete parent.associatedScriptEvidence;
                page.structuredResources=structured.map(({child,reference})=>({...child,costClass:p.costClass,providerId:p.id,exitCountry:exit.country,sourceType:'OFFICIAL_PROVIDER',
                  authority:{status:'DERIVED_EXACT_RESOURCE',provider:page.authority.provider,hostname:new URL(child.url).hostname,sourceType:'OFFICIAL_PROVIDER',sourceUrl:child.url,parentUrl:page.url},
                  transportProof:{version:2,level:'BRACKET_VERIFIED',attemptId,requestedCountry:gap.targetCountry,before:a.transportVerification.before.country,after:a.transportVerification.after.country},
                  structuredRelationship:{version:'ASSOCIATED_STRUCTURED_RESOURCE_V1',parent,scripts:clone(resourceScripts),...(reference.basis==='OBSERVED_RUNTIME_REQUEST'?{runtime:clone(runtimeEvidence)}:{}),reference,bindingRef:attemptId,proof:clone(a.transportVerification),receipts:clone(binding.receipts())}}));
              }
              a.page={...page,costClass:p.costClass,providerId:p.id,exitCountry:exit.country};a.outcome='OBSERVED';
            }else {a.failure=page.outcome==='ACCESS_CONTROL_STOP'?'ACCESS_POLICY_STOP':failureCodes.has(page.failure?.code)?page.failure.code:'TARGET_READ_FAILED';}

          }catch(e){a.failure=policyStop?'ACCESS_POLICY_STOP':code(e);if(a.transportVerification)a.transportVerification.level='UNVERIFIED';}
          finally{
            try{await binding.close();a.cleanup=p.mode==='SESSION'?'RELEASED':'NOT_REQUIRED';}catch{a.cleanup='RELEASE_FAILED';}
            try{a.actualCost=await binding.usage();}catch{a.actualCost=unknownCost();}
            a.receipts=binding.receipts();
            if(experimentalAcquisition){a.latencyMs=Math.round(performance.now()-attemptStarted);
              const statistics=a.transportMetadata?transports[p.transportRef].statistics?.():null;
              if(statistics?.bodyBudget)a.bodyBudget=clone(statistics.bodyBudget);
              if(statistics)a.statistics=Object.fromEntries(['requests','proxyConnectRequests','targetRequests','responseBodyBytes'].map(k=>{assert(Number.isSafeInteger(statistics[k])&&statistics[k]>=0);return [k,statistics[k]];}));
            }
            if(bracket&&a.transportVerification.before){
              const independent=a.transportVerification.before;
              a.transportVerification.conflicts=[{reportedCountry:a.reportedExitCountry,reportedAddress:a.reportedExitAddress},...a.receipts]
                .filter(r=>r.reportedCountry&&r.reportedCountry!==independent.country||r.reportedAddress&&r.reportedAddress!==independent.address)
                .map(r=>({type:'PROVIDER_VS_INDEPENDENT',reportedCountry:r.reportedCountry??null,reportedAddress:r.reportedAddress??null,url:r.url??null}));
            }
            a.reportedExitCountry??=a.receipts.findLast(r=>r.reportedCountry)?.reportedCountry??null;
            if(p.costClass==='PAID'){
              try{a.settlement=await boundedCall(budgetDecision,{operation:'SETTLE',reservationId:a.authorization.reservationId,actualCost:a.actualCost},{timeoutMs:limits.timeoutMs,maxResponseBytes:10000});
                assert(['SETTLED','OVERSPEND','UNKNOWN_COST_RESERVATION_RETAINED','CURRENCY_MISMATCH'].includes(a.settlement?.state));
                a.settlement={state:a.settlement.state,frozen:a.settlement.frozen===true};
              }catch{a.settlement={state:'SETTLEMENT_UNAVAILABLE'};}
            }
          }
          const charged=p.costClass==='FREE'&&a.actualCost.status==='KNOWN'&&money(a.actualCost.amount)>0n;
          const exceeded=p.costClass==='PAID'&&a.actualCost.status==='KNOWN'&&(a.actualCost.currency!==p.cost.ceiling.currency||money(a.actualCost.amount)>money(p.cost.ceiling.amount));
          if(charged||exceeded||['OVERSPEND','CURRENCY_MISMATCH','SETTLEMENT_UNAVAILABLE'].includes(a.settlement?.state)){
            costHalted=true;a.outcome='UNRESOLVED';a.page=null;if(a.transportVerification)a.transportVerification.level='UNVERIFIED';output.reason='COST_POLICY_STOP';break;
          }
          if(policyStop){a.page=null;output.reason='ACCESS_POLICY_STOP';break;}
          const lastStatus=a.reads.at(-1)?.httpStatus;
          if(lastStatus>=400&&lastStatus<500){output.reason='HTTP_RESPONSE_REQUIRES_REVIEW';break;}
          if(a.outcome==='OBSERVED'){output.outcome='OBSERVED';output.reason='GEO_OBSERVATION_REQUIRES_FACT_REVIEW';break;}
        }
        output.reason??='ALL_ELIGIBLE_ROUTES_UNRESOLVED';return done();
      }catch{output.reason='GEO_CONFIGURATION_OR_POLICY_FAILURE';return done();}
      finally{busy=false;}
    }
  };
}
