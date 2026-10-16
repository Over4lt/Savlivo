import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {researchLinksRequest,validateResearchLink,loadApplicableResearchLinks,recordResearchLinkResult} from './research-links.mjs';
import {researchLinkSnapshot} from './research-link-snapshot.mjs';
import {operationsRequest} from './http.mjs';

const id='11111111-1111-4111-8111-111111111111';
const input=(url='https://streamco.example/pricing')=>({url,kind:'DIRECT_SOURCE',marketScope:'GLOBAL',marketCode:null,enabled:true});
function fixture(serviceId='streamco'){
 const rows=[],calls=[],ops={config:{read:true,control:true},priceResearchTargeting:async()=>({services:[{serviceId,selectable:true}],markets:[{id:'NO'},{id:'SE'}]})};
 const client={async query(sql,args=[]){calls.push({sql,args});
  if(sql.startsWith('WITH evidence'))return {rows:[]};
  if(sql.startsWith('SELECT count'))return {rows:[{count:rows.length}]};
  if(sql.startsWith('INSERT')){if(rows.some(row=>row.service_id===args[1]&&row.url===args[2]&&row.market_scope===args[4]&&row.market_code===args[5]))throw Object.assign(Error('duplicate'),{code:'23505'});const row={id:args[0],service_id:args[1],url:args[2],kind:args[3],market_scope:args[4],market_code:args[5],enabled:args[6],created_at:new Date(),updated_at:new Date(),last_used_at:null,last_result:null};rows.push(row);return {rows:[row]};}
  if(sql.startsWith('UPDATE price_research_links SET last_used_at')){const row=rows.find(item=>item.id===args[0]);if(row){row.last_used_at=args[1];row.last_result=args[2];}return {rows:[]};}
  if(sql.startsWith('UPDATE')){const row=rows.find(item=>item.id===args[0]);Object.assign(row,{url:args[1],kind:args[2],market_scope:args[3],market_code:args[4],enabled:args[5],updated_at:new Date()});return {rows:[row]};}
  if(sql.startsWith('DELETE')){rows.splice(rows.findIndex(row=>row.id===args[0]),1);return {rows:[]};}
  if(sql.includes('WHERE id=$1'))return {rows:rows.filter(row=>row.id===args[0])};
  if(sql.includes('enabled=true'))return {rows:rows.filter(row=>row.service_id===args[0]&&row.enabled&&(row.market_scope==='GLOBAL'||row.market_code===args[1])).sort((a,b)=>Number(a.market_scope!=='MARKET_SPECIFIC')-Number(b.market_scope!=='MARKET_SPECIFIC'))};
  return {rows:rows.filter(row=>row.service_id===args[0])};
 }};ops.config.client=client;return {rows,calls,ops,client};
}

test('Research link CRUD is service scoped, bounded and duplicate safe',async()=>{
 const {rows,ops}=fixture(),call=(method,body,linkId)=>researchLinksRequest({method,serviceId:'streamco',body,linkId,ops,actor:'admin'});
 const added=await call('POST',input());assert.equal(added.row.serviceId,'streamco');assert.equal(rows.length,1);
 await assert.rejects(call('POST',input()),error=>error.status===409&&error.message==='RESEARCH_LINK_DUPLICATE');
 assert.equal((await call('GET')).rows.length,1);
 const edited=await call('PATCH',{...input('https://streamco.example/signup'),kind:'INTERACTIVE_ROUTE',marketScope:'MARKET_SPECIFIC',marketCode:'NO',enabled:false},added.row.id);
 assert.equal(edited.row.kind,'INTERACTIVE_ROUTE');assert.equal(edited.row.marketCode,'NO');assert.equal(edited.row.enabled,false);
 assert.equal((await call('PATCH',{...input('https://streamco.example/signup'),kind:'INTERACTIVE_ROUTE',marketScope:'MARKET_SPECIFIC',marketCode:'NO',enabled:true},added.row.id)).row.enabled,true);
 assert.equal((await call('DELETE',undefined,added.row.id)).deleted,true);assert.equal(rows.length,0);
});

test('Research link validation rejects unsafe URLs, malformed scope and authority-bearing fields',()=>{
 for(const url of ['http://streamco.example/pricing','https://localhost/pricing','https://127.0.0.1/pricing','https://10.0.0.1/pricing','https://user:pass@streamco.example/pricing','file:///etc/passwd','https://streamco.internal/pricing'])assert.throws(()=>validateResearchLink(input(url)));
 assert.throws(()=>validateResearchLink({...input(),marketScope:'MARKET_SPECIFIC',marketCode:'ZZ'}));
 assert.throws(()=>validateResearchLink({...input(),price:'9.99'}));
 assert.equal(validateResearchLink(input()).url,'https://streamco.example/pricing');
});

test('GLOBAL applies independently per market, specific outranks global, and historical Verified does not suppress an explicit investigation link',async()=>{
 const {rows,client}=fixture(),now=new Date();rows.push({id,service_id:'streamco',url:'https://streamco.example/global',kind:'DIRECT_SOURCE',market_scope:'GLOBAL',market_code:null,enabled:true,created_at:now,updated_at:now,last_result:null},{id:'22222222-2222-4222-8222-222222222222',service_id:'streamco',url:'https://streamco.example/no',kind:'INTERACTIVE_ROUTE',market_scope:'MARKET_SPECIFIC',market_code:'NO',enabled:true,created_at:now,updated_at:now,last_result:null});
 const no=await loadApplicableResearchLinks({serviceId:'streamco',canonicalSlug:'streamco',market:'NO',client}),se=await loadApplicableResearchLinks({serviceId:'streamco',canonicalSlug:'streamco',market:'SE',client});
 assert.deepEqual(no.links.map(row=>row.marketScope),['MARKET_SPECIFIC','GLOBAL']);assert.deepEqual(se.links.map(row=>row.url),['https://streamco.example/global']);assert(no.links.every(row=>row.truthAuthority==='NONE'));
 const verifiedClient={query:async sql=>sql.startsWith('WITH evidence')?{rows:[{service_slug:'streamco',country_code:'NO',verified_count:3}]}:client.query(sql,['streamco','NO'])};
 const verified=await loadApplicableResearchLinks({serviceId:'streamco',canonicalSlug:'streamco',market:'NO',client:verifiedClient});assert.equal(verified.persistedVerifiedCount,3);assert.deepEqual(verified.links.map(row=>row.marketScope),['MARKET_SPECIFIC','GLOBAL']);
});

test('last result metadata records bounded operational outcome without price truth',async()=>{
 const {rows,client}=fixture();rows.push({id,service_id:'streamco',url:'https://streamco.example/pricing',kind:'DIRECT_SOURCE',market_scope:'GLOBAL',market_code:null,enabled:true,created_at:new Date(),updated_at:new Date(),last_used_at:null,last_result:null});
 await recordResearchLinkResult({id,attemptedAt:'2026-10-16T12:00:00.000Z',result:'PROVIDER_SOURCE_NO_VERIFIED',client});assert.equal(rows[0].last_result,'PROVIDER_SOURCE_NO_VERIFIED');assert.equal(rows[0].last_used_at,'2026-10-16T12:00:00.000Z');assert.equal(Object.hasOwn(rows[0],'price'),false);
 await recordResearchLinkResult({id,attemptedAt:'2026-10-16T12:01:00.000Z',result:'INTERPRETATION_FAILED',client});assert.equal(rows[0].last_result,'INTERPRETATION_FAILED');
});

test('authenticated Operations routes POST, GET, PATCH and DELETE through the bounded Admin API',async()=>{
 const {ops}=fixture(),url=route=>new URL('https://admin.example/v1/admin/v2-operations/price-research/research-links'+route),call=(method,route,body,actor='admin')=>operationsRequest({method,url:url(route),body,actor},ops);
 await assert.rejects(call('GET','?serviceId=streamco',undefined,null),error=>error.status===401);
 const added=await call('POST','',{serviceId:'streamco',...input()});assert.equal(added.row.serviceId,'streamco');
 assert.equal((await call('GET','?serviceId=streamco')).rows.length,1);
 assert.equal((await call('PATCH','/'+added.row.id,{...input(),enabled:false})).row.enabled,false);
 assert.equal((await call('DELETE','/'+added.row.id)).deleted,true);
});

test('Disney+ GLOBAL Direct source URL edit survives validation, storage and refreshed list locally',async()=>{
 const {rows,calls,ops}=fixture('disney-plus'),oldUrl='https://help.disneyplus.com/en-GB/article/disneyplus-price?redirect=true',newUrl='https://www.disneyplus.com/';
 rows.push({id,service_id:'disney-plus',url:oldUrl,kind:'DIRECT_SOURCE',market_scope:'GLOBAL',market_code:null,enabled:true,created_at:new Date(),updated_at:new Date(),last_used_at:null,last_result:null});
 const base='https://admin.example/v1/admin/v2-operations/price-research/research-links',call=(method,suffix,body)=>operationsRequest({method,url:new URL(base+suffix),body,actor:'admin'},ops);
 assert.equal((await call('GET','?serviceId=disney-plus')).rows[0].url,oldUrl);
 await assert.rejects(call('PATCH','/'+id,{...input('http://localhost/private')}),error=>error.status===400&&error.message==='UNSAFE_RESEARCH_LINK_URL');
 assert.equal(rows[0].url,oldUrl);
 const updated=await call('PATCH','/'+id,{url:newUrl,kind:'DIRECT_SOURCE',marketScope:'GLOBAL',marketCode:null,enabled:true});
 assert.deepEqual({url:updated.row.url,kind:updated.row.kind,scope:updated.row.marketScope,enabled:updated.row.enabled},{url:newUrl,kind:'DIRECT_SOURCE',scope:'GLOBAL',enabled:true});
 assert.deepEqual(calls.findLast(row=>row.sql.startsWith('UPDATE price_research_links SET url')).args.slice(1),[newUrl,'DIRECT_SOURCE','GLOBAL',null,true]);
 assert.equal((await call('GET','?serviceId=disney-plus')).rows[0].url,newUrl);
});

test('target snapshot keeps link order stable on resume and fails closed on tampering',async t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'research-link-snapshot-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const {rows,client,calls}=fixture(),now=new Date();rows.push({id,service_id:'streamco',url:'https://streamco.example/pricing',kind:'DIRECT_SOURCE',market_scope:'GLOBAL',market_code:null,enabled:true,created_at:now,updated_at:now,last_result:null});
 const args={directory,serviceId:'streamco',canonicalSlug:'streamco',market:'NO',client},first=await researchLinkSnapshot(args),queries=calls.length;assert.equal(first.links.length,1);
 rows.length=0;assert.deepEqual(await researchLinkSnapshot(args),first);assert.equal(calls.length,queries);
 const file=path.join(directory,'research-links-snapshot.json'),saved=JSON.parse(fs.readFileSync(file,'utf8'));saved.links[0].url='https://other.example/pricing';fs.writeFileSync(file,JSON.stringify(saved));await assert.rejects(researchLinkSnapshot(args),/RESEARCH_LINK_SNAPSHOT_INVALID/);
});
