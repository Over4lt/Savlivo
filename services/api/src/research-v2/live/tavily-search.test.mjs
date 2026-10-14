import test from 'node:test';
import assert from 'node:assert/strict';
import {createTavilySearch,resolveTavilyCredential} from './tavily-search.mjs';
import {createTavilyDiscovery} from './tavily-discovery.mjs';

const response=()=>new Response(JSON.stringify({results:[{url:'https://provider.example/pricing',title:'Pricing'}],usage:{credits:1}}),{status:200,headers:{'content-type':'application/json'}});
const target={service:'fixture',market:'DE'};

test('Tavily works with the Linux/Render environment and never calls Keychain when configured',async()=>{
 let reads=0;const key='env-private-sentinel',resolved=await resolveTavilyCredential({env:{TAVILY_API_KEY:key},readKeychain:async()=>{reads++;return 'keychain-private-sentinel';}});assert.equal(resolved,key);assert.equal(reads,0);
 let authorization;const search=await createTavilySearch({env:{TAVILY_API_KEY:key},readKeychain:async()=>assert.fail('environment must win'),maxCalls:1,fetchImpl:async(_url,init)=>{authorization=init.headers.Authorization;return response();}}),result=await search({query:'fixture pricing',target});assert.equal(authorization,'Bearer '+key);assert.equal(result.results.length,1);assert.equal(JSON.stringify(result).includes(key),false);
});

test('Tavily discovery uses the same env-first credential contract without a network call',async()=>{
 const discovery=await createTavilyDiscovery({inventory:[],env:{TAVILY_API_KEY:'env-private-sentinel'},readKeychain:async()=>assert.fail('discovery must use environment first'),bounds:{searches:2}});assert.equal(typeof discovery.search,'function');assert.equal(discovery.bounds.searches,2);
});

test('Tavily retains macOS Keychain-compatible fallback and exact missing code',async()=>{
 const key='keychain-private-sentinel',search=await createTavilySearch({env:{},readKeychain:async()=>key,maxCalls:1,fetchImpl:async(_url,init)=>{assert.equal(init.headers.Authorization,'Bearer '+key);return response();}});assert.equal((await search({query:'fixture pricing',target})).results.length,1);
 await assert.rejects(resolveTavilyCredential({env:{},readKeychain:async()=>null}),error=>error.message==='TAVILY_CREDENTIAL_UNAVAILABLE');
});

test('central credential resolution does not change Tavily call bounds',async()=>{
 const search=await createTavilySearch({env:{TAVILY_API_KEY:'fixture-private'},maxCalls:1,fetchImpl:async()=>response()});await search({query:'one',target});assert.equal((await search({query:'two',target})).failure.code,'TAVILY_SEARCH_BOUND');
});
