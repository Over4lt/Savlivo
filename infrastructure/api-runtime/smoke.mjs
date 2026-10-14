import assert from 'node:assert/strict';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import {runtimeConfiguration,waitForBrowser,browserPort} from './supervisor.mjs';
import {createLocalContainerBrowserType} from '../../services/api/src/research-v3/local-container-browser.mjs';
import {createPlaywrightRenderedCapability} from '../../services/api/src/research-v3/browser-render.mjs';
import {digest} from '../../services/api/src/research-v3/model.mjs';
import {firefox} from '../playwright-client/node_modules/playwright-core/index.mjs';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function processRows(){
 return fs.readdirSync('/proc').filter(name=>/^\d+$/.test(name)).flatMap(name=>{try{const status=fs.readFileSync('/proc/'+name+'/status','utf8'),field=key=>status.match(new RegExp('^'+key+':\\s+(.+)$','m'))?.[1]?.trim()??null,number=key=>Number(field(key)?.split(/\s+/)[0]),command=fs.readFileSync('/proc/'+name+'/cmdline','utf8').replaceAll('\0',' ').trim();return [{pid:Number(name),ppid:number('PPid'),command,name:field('Name'),uid:number('Uid'),gid:number('Gid'),seccomp:number('Seccomp'),noNewPrivs:number('NoNewPrivs'),capEff:field('CapEff')}];}catch{return [];}});
}
function descendants(root,rows=processRows()){const found=[],pending=[root];while(pending.length){const parent=pending.pop();for(const row of rows)if(row.ppid===parent&&!found.some(item=>item.pid===row.pid)){found.push(row);pending.push(row.pid);}}return found;}
function listeningAddresses(){return ['/proc/net/tcp','/proc/net/tcp6'].flatMap(file=>fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').slice(1).map(line=>line.trim().split(/\s+/)).filter(fields=>fields[3]==='0A'&&parseInt(fields[1].split(':')[1],16)===browserPort).map(fields=>fields[1].split(':')[0]):[]);}
function stopGroup(child,signal='SIGTERM'){if(!child?.pid)return;try{process.kill(-child.pid,signal);}catch(error){if(error.code!=='ESRCH')throw error;}}
async function closeProcess(child){const exited=child.exitCode!==null||child.signalCode!==null?Promise.resolve(true):once(child,'exit').then(()=>true);child.stdin?.end();child.stdin?.destroy();stopGroup(child,'SIGINT');const ended=await Promise.race([exited,pause(20_000).then(()=>false)]);if(!ended){const killed=once(child,'exit');stopGroup(child,'SIGKILL');await killed;}return ended;}
const closeHttp=server=>new Promise(resolve=>server.close(resolve));

const config=runtimeConfiguration(),marker=path.join(config.root,'.savlivo','api-runtime-smoke-'+process.pid),tlsDirectory=fs.mkdtempSync(path.join(os.tmpdir(),'firefox-fixture-'));
const server=spawn(config.browser.command,config.browser.args,{cwd:config.browser.cwd,env:config.browser.env,uid:config.browser.uid,gid:config.browser.gid,detached:true,stdio:['pipe','inherit','inherit']});
const connectedBrowserType=createLocalContainerBrowserType(firefox,{timeoutMs:30_000});
let browser,context,page,fixtureCapability,fixtureServer,cleanShutdown=false;
try{
 await waitForBrowser({stopped:()=>server.exitCode!==null||server.signalCode!==null});
 assert.deepEqual(listeningAddresses(),['0100007F'],'Playwright must listen only on IPv4 loopback');
 fs.mkdirSync(path.dirname(marker),{recursive:true});fs.writeFileSync(marker,'write-ok',{mode:0o600});assert.equal(fs.readFileSync(marker,'utf8'),'write-ok');fs.unlinkSync(marker);

 browser=await connectedBrowserType.launch({headless:true});
 context=await browser.newContext();page=await context.newPage();assert.equal(page.url(),'about:blank');
 await page.setContent('<main id="visible">Firefox local smoke</main>');const initialPng=await page.screenshot({type:'png'});assert(initialPng.length>100);assert.equal(await page.locator('#visible').innerText(),'Firefox local smoke');

 let webContent=[];
 const deadline=Date.now()+10_000;
 while(Date.now()<deadline){webContent=descendants(server.pid).filter(row=>row.name==='Web Content'&&/(?:^|\s)-contentproc(?:\s|$)/.test(row.command));if(webContent.length)break;await pause(100);}
 assert(webContent.length>0,'Firefox Web Content process required');
 assert(webContent.every(row=>row.uid===config.browser.uid&&row.gid===config.browser.gid),'Firefox content must remain pwuser');
 assert(webContent.every(row=>row.seccomp===2&&row.noNewPrivs===1&&/^0+$/.test(row.capEff??'')),'Firefox Web Content sandbox state required');
 const sandbox=webContent.map(({pid,ppid,name,uid,gid,seccomp,noNewPrivs,capEff})=>({pid,ppid,name,uid,gid,seccomp,noNewPrivs,capEff}));
 await page.close();page=null;await context.close();context=null;await browser.close();browser=null;

 const key=path.join(tlsDirectory,'key.pem'),certificate=path.join(tlsDirectory,'certificate.pem');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',certificate,'-days','1','-subj','/CN=provider.example','-addext','subjectAltName=DNS:provider.example'],{stdio:'ignore'});
 fs.appendFileSync('/etc/hosts','\n127.0.0.1 provider.example\n');
 const body='<!doctype html><html><head><title>Firefox Fixture</title></head><body><main><h1>Fixture subscription</h1><p>Monthly membership presentation</p></main></body></html>';
 const local=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(certificate)},(request,response)=>{if(request.url==='/robots.txt'){response.writeHead(200,{'content-type':'text/plain'});response.end('User-agent: *\nAllow: /\n');return;}response.writeHead(200,{'content-type':'text/html'});response.end(body);});
 await new Promise((resolve,reject)=>{local.once('error',reject);local.listen(443,'127.0.0.1',resolve);});fixtureServer=local;const url='https://provider.example/pricing';
 const objective={kind:'PRICE',serviceId:'firefox-fixture',serviceName:'Firefox Fixture',providerHosts:['provider.example'],markets:['DE'],seeds:[url]};
 const parent={id:'firefox-parent',kind:'PROVIDER',url,context:{transport:'DIRECT',networkGeography:'UNBOUND',representation:'PROVIDER_PAGE'},outcome:'OK',body,sha256:digest(body)};
 const action={id:'firefox-action',kind:'RENDER',mode:'OVERVIEW',observation:parent.id,url};
 const fixtureBrowserType={launch:async options=>{const connected=await connectedBrowserType.launch(options);return {version:()=>connected.version(),newContext:options=>connected.newContext({...options,ignoreHTTPSErrors:true}),close:()=>connected.close()};}};
 fixtureCapability=createPlaywrightRenderedCapability({browserType:fixtureBrowserType,launchOptions:{headless:true},hostAllowed:async host=>host==='provider.example',clock:()=>new Date(0).toISOString()});
 const result=await fixtureCapability(action,{parent,objective,maxRenderMs:20_000});
 assert(result.pngBytes.length>100);assert(result.dom.some(row=>row.text.includes('Fixture subscription')));
 assert.equal(result.networkSession.kind,'V3_BROWSER_NETWORK_SESSION_V1');assert.equal(result.networkSession.scope,'PLAYWRIGHT_BROWSER_CONTEXT');assert.equal(result.networkSession.transport,'DIRECT');assert.equal(result.networkSession.requestCount,result.browserLedger.length);assert.equal(result.networkSession.ledgerSha256,digest(result.browserLedger));assert.equal(result.networkSession.proxyApplied,false);assert.equal(result.page.transport.verification,'UNBOUND');assert.equal(result.page.responseMetadata.networkSessionBinding,result.networkSession.sessionBinding);
 await fixtureCapability.close();fixtureCapability=null;await closeHttp(local);fixtureServer=null;
 cleanShutdown=await closeProcess(server);assert.equal(cleanShutdown,true);
 console.log(JSON.stringify({status:'PASS',serverUid:config.browser.uid,loopbackAddresses:['127.0.0.1:3001'],playwright:'1.58.2',browser:'firefox',browserVersion:'146.0.1',sandbox,context:true,aboutBlank:true,screenshot:true,dom:true,fixture:true,browserLedgerEntries:result.browserLedger.length,networkSession:result.networkSession,savlivoWrite:true,cleanShutdown:true}));
}finally{
 await page?.close().catch(()=>{});await context?.close().catch(()=>{});await browser?.close().catch(()=>{});await fixtureCapability?.close().catch(()=>{});if(fixtureServer)await closeHttp(fixtureServer).catch(()=>{});if(!cleanShutdown&&server.exitCode===null&&server.signalCode===null)await closeProcess(server).catch(()=>{});if(fs.existsSync(marker))fs.unlinkSync(marker);fs.rmSync(tlsDirectory,{recursive:true,force:true});
}
