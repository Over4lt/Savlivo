// Routing evidence from an already completed Browser acquisition. This never
// grants price Truth: every later target must acquire and verify its own body.
import fs from 'node:fs';
import path from 'node:path';
import {canonical,digest,normalizeUrl} from '../../research-v3/model.mjs';
import {validateProviderSelectedMarketReceipt} from '../../research-v3/provider-market-evidence.mjs';
import {providerRoutingAuthority} from './provider-routing-authority.mjs';
import {retainedProviderSelectorAuthority} from './retained-render-source.mjs';

const hex=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const fail=()=>{throw Error('BROWSER_PRICING_ROUTE_PROOF_INVALID');};
function regular(file,max,root){
 const resolved=fs.realpathSync(file),boundary=fs.realpathSync(root);
 if(!resolved.startsWith(boundary+path.sep))fail();
 const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max)fail();
 return fs.readFileSync(file);
}
function artifact(root,reference,max){
 if(!reference||!hex(reference.sha256)||!Number.isSafeInteger(reference.bytes)||reference.bytes<1||typeof reference.file!=='string'||path.basename(reference.file)!==reference.file)fail();
 const bytes=regular(path.join(root,reference.file),max,root);
 if(bytes.length!==reference.bytes||digest(bytes.toString('utf8'))!==reference.sha256)fail();
 return bytes;
}

export function readBrowserPricingRouteEvidence({directory,target,interpretation}){
 const observation=interpretation?.v3Observation,url=normalizeUrl(observation?.url),hash=observation?.sha256;
 if(!directory||!target?.service||!target?.serviceName||!/^([A-Z]{2})$/.test(target.market??'')||interpretation?.renderedAcquisition!==true||interpretation?.v3Truth?.established!==true||observation?.kind!=='PROVIDER'||!url||!hex(hash))fail();
 const outcome=(target.renderingOutcomes??[]).find(row=>row.outcome==='OBSERVED'&&row.url===interpretation.url&&row.artifacts?.refs?.['page.html']?.sha256===hash);
 if(!outcome||typeof outcome.actionId!=='string')fail();
 const browserRoot=path.resolve(directory,'hybrid-rendered'),artifactRoot=path.resolve(browserRoot,'artifacts');
 const campaignRoot=fs.realpathSync(directory);
 if(fs.realpathSync(browserRoot)!==path.join(campaignRoot,'hybrid-rendered')||fs.realpathSync(artifactRoot)!==path.join(campaignRoot,'hybrid-rendered','artifacts'))fail();
 if(path.resolve(outcome.artifacts.root)!==artifactRoot)fail();
 const events=regular(path.join(browserRoot,'journal.jsonl'),2_000_000,browserRoot).toString('utf8').trim().split('\n').map(line=>JSON.parse(line));
 const matching=events.filter(row=>row.type==='ACTION_RESULT'&&row.outcome==='OBSERVED'&&row.actionId===outcome.actionId);
 if(matching.length!==1)fail();
 const checkpoint=matching[0].checkpoint,reference=checkpoint?.artifacts?.refs?.['page.html'];
 if(checkpoint?.actionId!==outcome.actionId||checkpoint.url!==url||checkpoint.bodySha256!==hash||!reference||canonical(reference)!==canonical(outcome.artifacts.refs['page.html'])||path.resolve(checkpoint.artifacts.root)!==artifactRoot||checkpoint.artifacts.observation?.id!==observation.id||checkpoint.artifacts.observation?.sha256!==hash)fail();
 const body=artifact(artifactRoot,reference,8_000_000).toString('utf8');
 if(digest(body)!==hash||checkpoint.sourceHashes?.renderedDom!==hash)fail();
 if(checkpoint.acquisition?.route==='PROVIDER_SELECTED_MARKET'){
  if(canonical(checkpoint.marketSelection)!==canonical(checkpoint.acquisition.marketReceipt)||checkpoint.networkSession?.transport!=='DIRECT'||checkpoint.networkSession?.requestedCountry!==null)fail();
  validateProviderSelectedMarketReceipt(checkpoint.marketSelection,{observationId:observation.id,url,body,sourceHash:hash,targetMarket:target.market});
 }else if(checkpoint.acquisition?.route==='DECODO'){
  const receipt=checkpoint.acquisition.countryReceipt,session=checkpoint.networkSession;
  if(checkpoint.marketSelection!==null||receipt?.kind!=='V3_VERIFIED_COUNTRY_RECEIPT'||receipt.verification!=='BRACKET_VERIFIED'||receipt.requestedCountry!==target.market||receipt.verifiedCountry!==target.market||session?.transport!=='DECODO'||session.requestedCountry!==target.market||session.proxyApplied!==true||observation.context?.transport!=='DECODO'||observation.context?.networkGeography!==target.market)fail();
 }else fail();
 const ledger=checkpoint.artifacts.refs?.['request-ledger.json'];
 if(!ledger||canonical(ledger)!==canonical(checkpoint.networkSession.ledgerRef))fail();
 const requests=JSON.parse(artifact(artifactRoot,ledger,2_000_000).toString('utf8')),session=checkpoint.networkSession;
 if(!Array.isArray(requests)||requests.length!==session.requestCount||session.ledgerSha256!==digest(requests)||!requests.every(row=>row.sessionBinding===session.sessionBinding&&row.transport===session.transport&&row.requestedCountry===session.requestedCountry))fail();
 if(checkpoint.acquisition.route==='DECODO'&&requests.filter(row=>row.resourceType==='geography').length<2)fail();
 if(!Number.isFinite(Date.parse(checkpoint.freshAt))||Date.parse(checkpoint.freshAt)>Date.now())fail();
 const decision=(target.decisions??[]).find(row=>row.eligible===true&&row.route==='BROWSER'&&normalizeUrl(row.url)===normalizeUrl(interpretation.url));
 if(!decision)fail();
 const authority=providerRoutingAuthority(target,url),selectorAuthority=!authority&&retainedProviderSelectorAuthority(target,{url,sourceHash:outcome.sourceHash});
 if(!authority&&!selectorAuthority)fail();
 if(selectorAuthority){
  if(!hex(outcome.sourceHash))fail();
  const bodyRoot=path.join(directory,'bodies');
  if(fs.realpathSync(bodyRoot)!==path.join(campaignRoot,'bodies'))fail();
  const retained=regular(path.join(bodyRoot,outcome.sourceHash+'.txt'),8_000_000,bodyRoot);
  if(digest(retained.toString('utf8'))!==outcome.sourceHash)fail();
 }
 return {body,url,sha256:hash,acquiredAt:checkpoint.freshAt,method:'BROWSER',marketEvidence:checkpoint.acquisition.route==='DECODO'?{kind:'G1_BRACKET_VERIFIED',sourceHash:hash,targetMarket:target.market}:{kind:'PROVIDER_SELECTED_MARKET',sourceHash:hash,targetMarket:target.market}};
}
