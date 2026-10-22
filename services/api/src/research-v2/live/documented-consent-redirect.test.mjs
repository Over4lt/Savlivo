import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {documentedConsentRedirect} from './documented-consent-redirect.mjs';
import {youtubePremiumConsentRoute} from '../../research-v3/provider-consent-route.mjs';
import {openMarketRunStore} from '../../research-v1/market-run-store.mjs';
import {failedDecodoBrowserRoute} from './retained-render-source.mjs';

const url='https://www.youtube.com/premium';
const redirect=market=>`https://consent.youtube.com/m?continue=https%3A%2F%2Fwww.youtube.com%2Fpremium%3Fcbrd%3D1&gl=${market}&pc=yt`;
const target={id:'price-research:youtube-premium:SE',service:'youtube-premium',market:'SE'};
const records=()=>[
 {type:'RESPONSE_CAPTURED',hash:'a'.repeat(64),payload:{target:{taskId:target.id,service:target.service,market:target.market},url,status:302,bytes:0,bodyHash:'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',location:redirect('SE'),bindingRef:'geo-1',proof:{bindingRef:'geo-1',tlsVerified:true,access:'PUBLIC',url}}},
 {type:'V2_ACQUISITION_RESULT',payload:{target:{id:target.id},result:{attempts:[{requestedUrl:url,bindingRef:'geo-1',targetCountry:'SE',failure:'TARGET_READ_FAILED',transportVerification:{before:{status:'MATCH',country:'SE'},after:null},reads:[{url,failure:{code:'AUTHORITY_POLICY_STOP'}}]}]}}}
];

test('one original geo-bound YouTube redirect is routing proof only',()=>{
 assert.deepEqual(documentedConsentRedirect(records(),target,url),{url:redirect('SE'),recordHash:'a'.repeat(64)});
 assert.equal(youtubePremiumConsentRoute({serviceId:'youtube-premium',market:'SE',url,redirectUrl:redirect('SE')}),true);
});

test('consent route rejects wrong market, service, destination and missing acquisition proof',()=>{
 for(const [serviceId,market,redirectUrl] of [['other','SE',redirect('SE')],['youtube-premium','NO',redirect('SE')],['youtube-premium','SE',redirect('SE').replace('consent.youtube.com','consent.evil.example')],['youtube-premium','SE',redirect('SE').replace('www.youtube.com%2Fpremium','evil.example%2Fpremium')],['youtube-premium','SE',redirect('SE')+'&gl=NO'],['youtube-premium','SE',redirect('SE')+'&continue=https%3A%2F%2Fevil.example%2F']])assert.equal(youtubePremiumConsentRoute({serviceId,market,url,redirectUrl}),false);
 for(const change of [rows=>{rows[0].payload.location=redirect('NO');},rows=>{rows[0].payload.proof.tlsVerified=false;},rows=>{rows[1].payload.result.attempts[0].transportVerification.before.country='NO';},rows=>{rows[1].payload.result.attempts[0].reads[0].failure.code='ROBOTS_ACCESS_STOP';},rows=>{rows[0].payload.bindingRef='geo-other';},rows=>{rows.push(structuredClone(rows[0]));}]){
  const rows=records();change(rows);assert.equal(documentedConsentRedirect(rows,target,url),null);
 }
});

test('Browser continuation rechecks the immutable acquisition journal and rejects changed hints',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'youtube-consent-journal-'));
 t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const journal=openMarketRunStore(path.join(directory,'journal'));
 const first=journal.append('RESPONSE_CAPTURED',records()[0].payload);
 journal.append('V2_ACQUISITION_RESULT',records()[1].payload);
 journal.close();
 const link={id:'youtube-global',enabled:true,truthAuthority:'NONE',url,marketScope:'GLOBAL'};
 const current={...target,serviceName:'YouTube Premium',operationsObjective:'PRICE_RESEARCH',capabilities:{browser:true,decodo:true},authorities:[{hostname:'www.youtube.com',provider:'YouTube Premium',checkedAt:'2026-10-01T00:00:00.000Z',sourceType:'OFFICIAL_PROVIDER'}],researchLinks:[link],blockedOrigins:[],acquisitionOutcomes:[{url,channel:'PRICE_RESEARCH_DECODO',researchLinkId:null,classification:'ACQUISITION_FAILED',responseTooLarge:false,sourceClassification:{status:'UNKNOWN_SOURCE',sourceHash:null},countryV3Evaluation:{status:'UNRESOLVED'},runDirectory:directory,consentRedirect:{url:redirect('SE'),recordHash:first.hash}}]};
 const need={kind:'DECODO_BROWSER_REACQUISITION',url,transport:'DECODO',market:'SE',sourceHash:null,researchLinkId:null,consentRedirect:{url:redirect('SE'),recordHash:first.hash}};
 assert.equal(failedDecodoBrowserRoute(current,need),true);
 assert.equal(failedDecodoBrowserRoute(current,{...need,consentRedirect:{...need.consentRedirect,recordHash:'0'.repeat(64)}}),false);
 assert.equal(failedDecodoBrowserRoute({...current,market:'NO'},need),false);
 assert.equal(failedDecodoBrowserRoute({...current,capabilities:{browser:false,decodo:true}},need),false);
});
