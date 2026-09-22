// No network at construction/import. The geo engine fetches this URL through its current binding.
import assert from 'node:assert/strict';
import {publicAddress} from './public-network.mjs';
export const independentVerifierDocumentation='https://ipwhois.io/documentation';
export function createIndependentExitVerifier({approved=false}={}){
  return {id:'ipwho-is-public-v1',approved:approved===true,format:'JSON',
    url:'https://ipwho.is/?fields=success,ip,country_code',
    parse({text}){
      assert(typeof text==='string'&&Buffer.byteLength(text)<=10000);
      const v=JSON.parse(text);assert(v&&v.success===true&&publicAddress(v.ip)&&/^[A-Z]{2}$/.test(v.country_code));
      // Requested fields only: reject ambiguous/additional observations instead of guessing.
      assert.deepEqual(Object.keys(v).sort(),['country_code','ip','success']);
      return {address:v.ip,country:v.country_code};
    }};
}
