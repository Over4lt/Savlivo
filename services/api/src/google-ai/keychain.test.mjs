import test from 'node:test';
import assert from 'node:assert/strict';
import {geminiChildEnvironment,geminiKeychainAccount,geminiKeychainService} from './keychain.mjs';

test('Gemini Keychain identity is exact and the value exists only in the returned child environment',async()=>{
 const base={PATH:'/usr/bin'},child=await geminiChildEnvironment(base,async()=> 'ephemeral-test-key');
 assert.equal(geminiKeychainService,'GEMINI_API_KEY');assert.equal(geminiKeychainAccount,'GEMINI_API_KEY');assert.equal(base.GEMINI_API_KEY,undefined);assert.equal(child.GEMINI_API_KEY,'ephemeral-test-key');
});

test('an inherited credential is preserved without reading Keychain',async()=>{
 let reads=0;const child=await geminiChildEnvironment({GEMINI_API_KEY:'already-present'},async()=>{reads++;return 'replacement';});assert.equal(child.GEMINI_API_KEY,'already-present');assert.equal(reads,0);
});
