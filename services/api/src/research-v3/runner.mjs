// A separate single-objective host. Never imported by V2/Operations.
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runResearch} from './engine.mjs';
import {evaluate} from './truth.mjs';
import {interpretWeb} from './source.mjs';
import {createCapabilities} from './capabilities.mjs';
import {createReasoner} from './reasoner.mjs';
import {candidateRouted,navigationOwned} from './discovery-authority.mjs';
import {restore,checkpoint,createKnowledge,addDestination,pricePropositions,servicePropositions,canonical,digest,normalizeUrl} from './model.mjs';
import {reviewCandidateAuthority} from './provider-authority-review.mjs';
import {createLiveSemanticInterpreter,isLiveSemanticInterpreter} from './live-semantic.mjs';
import {createLiveVisualInterpreter} from './live-visual.mjs';
import {createLiveNavigationAdvisor} from './live-navigation-advice.mjs';
import {createPlaywrightRenderedCapability} from './browser-render.mjs';

function validResearchScope(input) {
    const {objective,provider}=input??{};
    if(!objective||objective.markets?.length!==1||!Array.isArray(objective.providerHosts))return false;
    if(provider?.reviewed===true)return objective.providerHosts.length>0&&provider.serviceId===objective.serviceId&&Array.isArray(provider.hosts)&&JSON.stringify([...provider.hosts].sort())===JSON.stringify([...objective.providerHosts].sort());
    return objective.providerHosts.length===0&&Array.isArray(objective.candidateHosts)&&objective.candidateHosts.length>0&&(!provider||provider.reviewed===false&&provider.serviceId===objective.serviceId&&(!provider.hosts||provider.hosts.length===0));
}

export async function runTarget({input,capabilities,reasoner,navigate,interpret,interpretVisual,save,snapshot,env=process.env}={}) {
    const {objective,provider,permissions={},bounds={}}=input??{};
    if(!validResearchScope(input))throw Error('REVIEWED_SINGLE_TARGET_REQUIRED');
    interpret=await configuredInterpreter(input,interpret,env);
    if(input.rendered?.mode==='LIVE'&&input.permissions?.RENDERED)interpretVisual??=createLiveVisualInterpreter({env,timeoutMs:input.rendered.timeoutMs??90000,maxOutputTokens:input.rendered.maxOutputTokens??12000});
    const knowledge=snapshot?restore(snapshot):undefined;
    if(knowledge) {
        const restoredObjective=structuredClone(knowledge.objective);
        const autonomous=(knowledge.authorityBindings??[]).filter(b=>b.kind==='AUTONOMOUS_FIRST_PARTY_PRESENTATION');
        const hosts=new Set();
        for(const binding of autonomous){
            const observation=knowledge.observations.find(o=>o.id===binding.observation);
            const reviewed=reviewCandidateAuthority(observation,objective);
            if(!reviewed||canonical(reviewed)!==canonical(binding)||hosts.has(binding.host)||!knowledge.attempts.some(a=>a.id===observation.id&&a.action.kind==='ACQUIRE'&&a.action.context?.representation==='CANDIDATE_PAGE'&&new URL(a.action.url).hostname===binding.host&&a.status==='COMPLETED'))throw Error('RESUME_AUTHORITY_MISMATCH');
            hosts.add(binding.host);
        }
        if(restoredObjective.providerHosts.some(h=>!navigationOwned(objective,'https://'+h+'/')&&!hosts.has(h))||[...hosts].some(h=>!restoredObjective.providerHosts.includes(h)))throw Error('RESUME_OBJECTIVE_MISMATCH');
        const sourceBoundHosts=new Set();
        for(const route of knowledge.sourceBoundCandidateRoutes??[]){
            const url=normalizeUrl(route.url),observation=knowledge.observations.find(row=>row.id===route.parentObservation),source=route.source,destination=knowledge.destinations.find(row=>row.url===url&&row.grounding?.candidate===route.candidate&&row.grounding?.observation===observation?.id);
            if(route.truthAuthority!=='NONE'||!url||new URL(url).hostname!==route.host||route.parentUrl!==observation?.url||route.parentSha256!==observation?.sha256||observation?.outcome!=='OK'||observation.truncated||observation.completeness==='INCOMPLETE'||observation.sha256!==digest(observation.body)||source?.observation!==observation.id||source.bodySha256!==observation.sha256||!Number.isSafeInteger(source.start)||!Number.isSafeInteger(source.end)||source.start<0||source.end>observation.body.length||source.start>=source.end||source.sha256!==digest(observation.body.slice(source.start,source.end))||!destination)throw Error('RESUME_OBJECTIVE_MISMATCH');
            sourceBoundHosts.add(route.host);
        }
        const expectedCandidates=[...new Set([...(objective.candidateHosts??[]),...sourceBoundHosts])].filter(h=>!hosts.has(h)).sort();
        if(canonical([...(restoredObjective.candidateHosts??[])].sort())!==canonical(expectedCandidates))throw Error('RESUME_OBJECTIVE_MISMATCH');
        restoredObjective.providerHosts=[...objective.providerHosts];
        if(objective.candidateHosts)restoredObjective.candidateHosts=[...objective.candidateHosts];else delete restoredObjective.candidateHosts;
        if(JSON.stringify(restoredObjective)!==JSON.stringify({...objective,seeds:objective.seeds??[]}))throw Error('RESUME_OBJECTIVE_MISMATCH');
    }
    if(knowledge&&knowledge.semanticAdapter&&JSON.stringify(knowledge.semanticAdapter)!==JSON.stringify(interpret.semanticAdapter??{mode:'LEGACY_STATIC'}))throw Error('RESUME_SEMANTIC_ADAPTER_MISMATCH');
    if(knowledge&&input.semantic?.mode==='LIVE'&&(!knowledge.semanticAdapter||!Number.isSafeInteger(knowledge.usage.modelCalls)||!Number.isSafeInteger(knowledge.bounds.modelCalls)||knowledge.observations.some(o=>o.semantic)))throw Error('RESUME_SEMANTIC_ADAPTER_MISMATCH');
    const initial=knowledge??createKnowledge({objective,permissions,bounds});
    if(!snapshot&&(input.discovery?.bootstrapRoots===true||(input.discovery?.bootstrapRoots!==false&&!permissions.TAVILY))&&!objective.seeds?.length) {
        for(const host of [...objective.providerHosts,...(objective.candidateHosts??[])])addDestination(initial,{url:'https://'+host+'/',depth:0,needs:objective.kind==='PRICE'?pricePropositions:servicePropositions,grounding:{kind:candidateRouted(objective,'https://'+host+'/')?'CANDIDATE_ROOT':'PROVIDER_ROOT',host}});
    }
    initial.semanticAdapter=interpret.semanticAdapter??{mode:'LEGACY_STATIC'};
    let k;
    try{k=await runResearch({knowledge:initial,objective,permissions,bounds,capabilities,reasoner:reasoner??createReasoner(input.planning),interpret,interpretVisual,navigate,save});}
    finally{await capabilities?.RENDERED?.close?.();}
    return {knowledge:k,result:{objective:k.objective,truth:evaluate(k),catalog:k.catalog??null,stop:k.stop,usage:k.usage,trace:k.trace,decisions:k.decisions}};
}

/** Offline fixture transport goes through the same robots, DNS validation, geo
 * verification, acquisition, interpretation and truth code as real adapters. */
export function offlineCapabilities(input) {
    const rows=input.fixtures??[];
    const reply=(url,transport,country)=>{
        const row=rows.find(r=>r.url===url&&r.transport===transport&&(r.country??'UNBOUND')===country);
        if(!row)throw Error('OFFLINE_FIXTURE_MISSING');
        return {status:row.status??200,headers:{'content-type':row.contentType??'text/html',...(row.location?{location:row.location}:{})},body:Buffer.from(row.body??''),tlsVerified:true};
    };
    return createCapabilities({objective:input.objective,permissions:input.permissions,clock:()=> '2026-01-01T00:00:00.000Z',network:{resolveHost:async()=>[{address:'93.184.216.34',family:4}],requestOnce:async r=>reply(r.url.href,'DIRECT','UNBOUND')},decodo:{username:'offline-user',password:'offline-secret',requestHop:async r=>{
        const country=r.username.match(/-country-([a-z]{2})-session-/)[1].toUpperCase();
        if(r.url.href==='https://ipwho.is/?fields=success,ip,country_code')return {status:200,headers:{'content-type':'application/json'},body:Buffer.from(JSON.stringify({success:true,ip:'93.184.216.34',country_code:country})),tlsVerified:true};
        return reply(r.url.href,'DECODO',country);
    }},tavily:{apiKey:'offline-discovery-key',fetchImpl:async()=>new Response(JSON.stringify({results:input.discoveries??[]}),{headers:{'content-type':'application/json'}})}});
}

export async function configuredInterpreter(input,interpret,env=process.env) {
    const mode=input?.semantic?.mode??'LEGACY_STATIC';
    if(!['LIVE','LEGACY_STATIC'].includes(mode))throw Error('V3_SEMANTIC_MODE_INVALID');
    if(mode==='LIVE') {
        if(interpret&&!isLiveSemanticInterpreter(interpret))throw Error('V3_LIVE_SEMANTIC_ADAPTER_REQUIRED');
        return interpret??createLiveSemanticInterpreter({env,timeoutMs:input.semantic.timeoutMs??30000,maxOutputTokens:input.semantic.maxOutputTokens??8192});
    }
    return interpret??interpretWeb;
}

export async function prepareLive(input,{env=process.env,client,fetchImpl}={}) {
    if(input?.semantic?.mode!=='LIVE'&&!(input?.rendered?.mode==='LIVE'&&input?.semantic?.mode==='LEGACY_STATIC'))throw Error('V3_LIVE_SEMANTIC_MODE_REQUIRED');
    if(input.permissions?.TAVILY&&!env.TAVILY_API_KEY?.trim())throw Error('V3_TAVILY_CONFIGURATION_REQUIRED');
    if(input.permissions?.DECODO&&(!env.DECODO_USERNAME?.trim()||!env.DECODO_PASSWORD?.trim()||/[:\r\n]|^user-|-country-|-session-/i.test(env.DECODO_USERNAME)||/[\r\n]/.test(env.DECODO_PASSWORD)))throw Error('V3_DECODO_CONFIGURATION_REQUIRED');
    if(!validResearchScope(input))throw Error('REVIEWED_SINGLE_TARGET_REQUIRED');
    createKnowledge({objective:input.objective,permissions:input.permissions,bounds:input.bounds});
    const interpret=input.semantic.mode==='LIVE'?await createLiveSemanticInterpreter({env,client,fetchImpl,timeoutMs:input.semantic.timeoutMs??30000,maxOutputTokens:input.semantic.maxOutputTokens??8192}):interpretWeb;
    const capabilities=createCapabilities({objective:input.objective,permissions:input.permissions,tavily:{apiKey:env.TAVILY_API_KEY},decodo:{username:env.DECODO_USERNAME,password:env.DECODO_PASSWORD}});
    let interpretVisual;
    if(input.rendered?.mode==='LIVE'&&input.permissions?.RENDERED){
        if(!env.V3_PLAYWRIGHT_MODULE?.trim())throw Error('V3_RENDERED_BROWSER_CONFIGURATION_REQUIRED');
        let browserModule;try{browserModule=await import(env.V3_PLAYWRIGHT_MODULE);}catch{throw Error('V3_RENDERED_BROWSER_CONFIGURATION_REQUIRED');}
        const chromium=browserModule.chromium??browserModule.default?.chromium;
        if(!chromium)throw Error('V3_RENDERED_BROWSER_CONFIGURATION_REQUIRED');
        capabilities.RENDERED=createPlaywrightRenderedCapability({chromium,proxyFor:context=>({server:'http://gate.decodo.com:7000',username:'user-'+env.DECODO_USERNAME+'-country-'+context.networkGeography.toLowerCase()+'-session-'+randomBytes(16).toString('hex'),password:env.DECODO_PASSWORD})});
        interpretVisual=createLiveVisualInterpreter({env,timeoutMs:input.rendered.timeoutMs??90000,maxOutputTokens:input.rendered.maxOutputTokens??12000});
    }
    const navigate=createLiveNavigationAdvisor({env,fetchImpl,timeoutMs:1000,maxOutputTokens:1024});
    return {interpret,interpretVisual,navigate,capabilities};
}
async function main() {
    const [mode,file,...flags]=process.argv.slice(2);
    if(!['--offline','--live','--preflight'].includes(mode)||!file)throw Error('V3_RUNNER_USAGE');
    const input=JSON.parse(await readFile(file,'utf8'));
    if(mode==='--offline'&&(input.semantic?.mode==='LIVE'||input.rendered?.mode==='LIVE'))throw Error('V3_OFFLINE_LIVE_SEMANTIC_FORBIDDEN');
    if(mode==='--live'&&(!flags.includes('--allow-network')||!flags.includes('--allow-model')))throw Error('V3_LIVE_AUTHORIZATION_REQUIRED');
    const dependencies=mode==='--offline'?{capabilities:offlineCapabilities(input)}:await prepareLive(input);
    if(mode==='--preflight') {
        process.stdout.write(JSON.stringify({preflight:'CONFIGURED_NO_IO',semanticAdapter:dependencies.interpret.semanticAdapter,permissions:input.permissions,bounds:input.bounds})+'\n');return;
    }
    const option=name=>flags.includes(name)?flags[flags.indexOf(name)+1]:undefined;
    const output=option('--output-dir'),resume=option('--resume');
    if(mode==='--live'&&!output)throw Error('V3_LIVE_TRACE_DIRECTORY_REQUIRED');
    if(output&&resolve(output).split('/').includes('.savlivo'))throw Error('V3_RUNTIME_DIRECTORY_FORBIDDEN');
    if(output)await mkdir(output,{recursive:true});
    const save=output?async snapshot=>{
        const path=join(output,'checkpoint.json');await writeFile(path+'.tmp',JSON.stringify(snapshot,null,2)+'\n');await rename(path+'.tmp',path);
    }:undefined;
    const snapshot=resume?JSON.parse(await readFile(resume,'utf8')):undefined;
    const {knowledge,result}=await runTarget({input,...dependencies,save,snapshot});
    if(output){await save(checkpoint(knowledge));await writeFile(join(output,'result.json'),JSON.stringify(result,null,2)+'\n');}
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
const safeErrors=new Set(['V3_LIVE_SEMANTIC_CONFIGURATION_REQUIRED','V3_LIVE_SEMANTIC_CREDENTIAL_REQUIRED','V3_LIVE_SEMANTIC_MODE_REQUIRED','V3_LIVE_SEMANTIC_ADAPTER_REQUIRED','V3_VISUAL_CREDENTIAL_REQUIRED','V3_RENDERED_BROWSER_CONFIGURATION_REQUIRED','V3_SEMANTIC_MODE_INVALID','V3_TAVILY_CONFIGURATION_REQUIRED','V3_DECODO_CONFIGURATION_REQUIRED','REVIEWED_SINGLE_TARGET_REQUIRED','V3_OFFLINE_LIVE_SEMANTIC_FORBIDDEN','V3_LIVE_AUTHORIZATION_REQUIRED','V3_LIVE_TRACE_DIRECTORY_REQUIRED','RESUME_SEMANTIC_ADAPTER_MISMATCH']);
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{process.stderr.write((safeErrors.has(error?.message)?error.message:'V3_RUNNER_FAILED: inspect input/capability configuration; no credentials printed')+'\n');process.exitCode=1;});
