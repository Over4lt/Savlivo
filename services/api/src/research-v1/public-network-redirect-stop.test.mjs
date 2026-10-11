import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublicReader,PublicNetworkError} from './public-network.mjs';

const address=async()=>[{address:'93.184.216.34',family:4}];
const response=(status,body='',headers={})=>({status,headers:{'content-type':'text/html',...headers},body:Buffer.from(body)});

function fixture(routes){
 const calls=[];
 const reader=createPublicReader({resolveHost:address,maxRedirects:4,requestOnce:async({url})=>{calls.push(url.href);const row=routes[url.href];assert(row,'unexpected request '+url.href);return row;}});
 return {reader,calls};
}

test('default reader still follows a cross-host redirect to its complete body',async()=>{
 const a='https://provider-a.example/start',b='https://regional.example/root',f=fixture({[a]:response(302,'',{location:b}),[b]:response(200,'regional body')});
 const result=await f.reader(a);
 assert.deepEqual(f.calls,[a,b]);assert.equal(result.url,b);assert.equal(result.text,'regional body');assert.equal(result.redirectStop,undefined);
});

test('provider-seed redirect mode follows same-host redirects normally',async()=>{
 const a='https://provider-a.example/start',a2='https://provider-a.example/home',f=fixture({[a]:response(301,'',{location:'/home'}),[a2]:response(200,'complete same-host body')});
 const result=await f.reader(a,{stopOnCrossHostRedirect:true});
 assert.deepEqual(f.calls,[a,a2]);assert.equal(result.url,a2);assert.equal(result.text,'complete same-host body');assert.equal(result.redirectStop,undefined);
});

test('provider-seed redirect mode stops a same-host to cross-host chain before destination dispatch',async()=>{
 const a='https://provider-a.example/start',a2='https://provider-a.example/home',b='https://regional.example/root',f=fixture({[a]:response(302,'',{location:a2}),[a2]:response(307,'',{location:b}),[b]:response(200,'must not be requested')});
 const result=await f.reader(a,{stopOnCrossHostRedirect:true});
 assert.deepEqual(f.calls,[a,a2]);assert.equal(result.outcome,undefined);assert.equal(result.url,b);assert.equal(Object.hasOwn(result,'text'),false);assert.equal(result.bodyOmitted,true);assert.deepEqual(result.redirects,[a2,b]);
 assert.deepEqual(result.redirectStop,{kind:'CROSS_HOST_REDIRECT_STOP',requestedUrl:a,requestedHost:'provider-a.example',sourceUrl:a2,sourceHost:'provider-a.example',destinationUrl:b,destinationHost:'regional.example',redirectChain:[a,a2,b],navigationDepth:2,httpStatus:307});
 assert.equal(Object.hasOwn(result,'body'),false);assert.equal(Object.hasOwn(result,'bodyHash'),false);assert.equal(Object.hasOwn(result,'sourceIntegrity'),false);
});

test('redirect stop preserves malformed location loop and depth failures',async()=>{
 const a='https://provider-a.example/start',a2='https://provider-a.example/home',b='https://regional.example/root';
 await assert.rejects(fixture({[a]:response(302,'',{location:'https://[bad'})}).reader(a,{stopOnCrossHostRedirect:true}),{code:'INVALID_REDIRECT'});
 await assert.rejects(fixture({[a]:response(302,'',{location:a2}),[a2]:response(302,'',{location:a})}).reader(a,{stopOnCrossHostRedirect:true}),{code:'REDIRECT_LOOP'});
 const limited=fixture({[a]:response(302,'',{location:a2}),[a2]:response(302,'',{location:b})});
 await assert.rejects(limited.reader(a,{stopOnCrossHostRedirect:true,maxRedirects:1}),error=>error instanceof PublicNetworkError&&error.code==='REDIRECT_LIMIT');
 assert.deepEqual(limited.calls,[a,a2]);
});
