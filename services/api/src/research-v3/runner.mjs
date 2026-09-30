// A separate single-objective host. Never imported by V2/Operations.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {runResearch} from './engine.mjs';
import {evaluate} from './truth.mjs';
import {interpretWeb} from './source.mjs';
import {createCapabilities} from './capabilities.mjs';
import {createReasoner} from './reasoner.mjs';
import {restore} from './model.mjs';

export async function runTarget({input,capabilities,reasoner,navigate,interpret=interpretWeb,save,snapshot}={}) {
    const {objective,provider,permissions={},bounds={}}=input??{};
    if(!objective||objective.markets?.length!==1||!provider?.reviewed||provider.serviceId!==objective.serviceId||JSON.stringify([...provider.hosts].sort())!==JSON.stringify([...objective.providerHosts].sort()))throw Error('REVIEWED_SINGLE_TARGET_REQUIRED');
    const knowledge=snapshot?restore(snapshot):undefined;
    if(knowledge&&JSON.stringify(knowledge.objective)!==JSON.stringify({...objective,seeds:objective.seeds??[]}))throw Error('RESUME_OBJECTIVE_MISMATCH');
    const k=await runResearch({knowledge,objective,permissions,bounds,capabilities,reasoner:reasoner??createReasoner(input.planning),interpret,navigate,save});
    return {knowledge:k,result:{objective:k.objective,truth:evaluate(k),stop:k.stop,usage:k.usage,trace:k.trace,decisions:k.decisions}};
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

async function main() {
    const [mode,file,approval]=process.argv.slice(2);
    if(!['--offline','--live'].includes(mode)||!file||mode==='--live'&&approval!=='--allow-network')throw Error('Usage: runner.mjs --offline input.json OR --live input.json --allow-network');
    const input=JSON.parse(await readFile(file,'utf8'));
    // Live invocation is explicit and separate. Merely importing this module or
    // supplying credentials never enables live requests.
    const capabilities=mode==='--offline'?offlineCapabilities(input):createCapabilities({objective:input.objective,permissions:input.permissions,tavily:{apiKey:process.env.TAVILY_API_KEY},decodo:{username:process.env.DECODO_USERNAME,password:process.env.DECODO_PASSWORD}});
    const {result}=await runTarget({input,capabilities});
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{process.stderr.write('V3_RUNNER_FAILED: inspect input/capability configuration; no credentials printed\n');process.exitCode=1;});
