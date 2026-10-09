// Explicit autonomous live entrypoint. Input file contains only service and market.
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {discoverCandidateHosts,createLiveBootstrap,researchInputFromCandidates} from './provider-bootstrap.mjs';
import {prepareLive,runTarget} from './runner.mjs';
import {checkpoint} from './model.mjs';

export async function runAutonomous({service,market,bootstrap,prepare=prepareLive,run=runTarget,env=process.env,save}={}) {
    const discovery=await discoverCandidateHosts({service,market,search:bootstrap?.search,bounds:bootstrap?.bounds});
    if(discovery.status!=='CANDIDATE_HOSTS_FOUND')return {bootstrap:discovery,result:null};
    const input=researchInputFromCandidates(discovery,{permissions:{DIRECT:true,TAVILY:!!env.TAVILY_API_KEY?.trim(),DECODO:!!(env.DECODO_USERNAME&&env.DECODO_PASSWORD)}});
    const capabilities=await prepare(input,{env});
    const {knowledge,result}=await run({input,...capabilities,save,env});
    return {bootstrap:discovery,result,knowledge};
}

async function main() {
    const [mode,file,...flags]=process.argv.slice(2);
    const option=name=>flags.includes(name)?flags[flags.indexOf(name)+1]:undefined;
    const output=option('--output-dir');
    if(mode!=='--live'||!file||!output||!flags.includes('--allow-network')||!flags.includes('--allow-model'))throw Error('V3_BOOTSTRAP_LIVE_USAGE');
    if(resolve(output).split('/').includes('.savlivo'))throw Error('V3_RUNTIME_DIRECTORY_FORBIDDEN');
    const target=JSON.parse(await readFile(file,'utf8'));
    if(!target||Object.keys(target).sort().join(',')!=='market,service')throw Error('V3_BOOTSTRAP_SERVICE_MARKET_ONLY');
    const bootstrap=await createLiveBootstrap();
    await mkdir(output,{recursive:true});
    const write=async(name,data)=>{const path=join(output,name);await writeFile(path+'.tmp',JSON.stringify(data,null,2)+'\n');await rename(path+'.tmp',path);};
    const save=async snapshot=>write('checkpoint.json',snapshot);
    const outcome=await runAutonomous({...target,bootstrap,save});
    if(outcome.knowledge)await save(checkpoint(outcome.knowledge));
    await write('result.json',{bootstrap:outcome.bootstrap,result:outcome.result});
    process.stdout.write(JSON.stringify({bootstrap:outcome.bootstrap,result:outcome.result},null,2)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{process.stderr.write(['V3_BOOTSTRAP_LIVE_USAGE','V3_RUNTIME_DIRECTORY_FORBIDDEN','V3_BOOTSTRAP_SERVICE_MARKET_ONLY','INVALID_BOOTSTRAP_TARGET','TAVILY_CREDENTIAL_UNAVAILABLE'].includes(error?.message)?error.message:'V3_BOOTSTRAP_RUN_FAILED: inspect configuration or output; credentials are not printed');process.stderr.write('\n');process.exitCode=1;});
