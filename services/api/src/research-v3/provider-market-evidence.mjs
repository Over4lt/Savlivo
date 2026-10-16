// Provider-owned selector state is market context only. Price, currency and
// cadence still require independent evidence from this exact retained source.
import {countryCurrencyData} from '../../../../packages/contracts/src/markets.ts';
import {digest,normalizeUrl} from './model.mjs';

const names=new Map(countryCurrencyData.map(([code,name])=>[code,name]));
const regions=new Intl.DisplayNames(['en'],{type:'region'});
const normalized=value=>String(value??'').normalize('NFKC').replace(/\s+/gu,' ').trim().toLocaleLowerCase('en');
const attr=(tag,name)=>new RegExp('\\b'+name+'\\s*=\\s*(["\'])(.*?)\\1','iu').exec(tag)?.[2]??null;
export function marketName(code){return names.get(code)??null;}
export function marketCodeMatches(target,observed){
 if(!names.has(target)||!/^[A-Z]{2}$/.test(observed??''))return false;
 return observed===target||normalized(regions.of(observed))===normalized(names.get(target));
}
export function exactMarketOption(target,label){
 const name=names.get(target),text=String(label??'').normalize('NFKC').replace(/\s+/gu,' ').trim();
 if(!name||!text)return false;
 return normalized(text)===normalized(name)||normalized(text).startsWith(normalized(name)+' (')&&text.endsWith(')');
}
export function selectedMarketControl(body){
 if(typeof body!=='string'||body.length>8_000_000)return null;
 const rows=[];
 for(const tag of body.match(/<button\b(?:[^>"']|"[^"]*"|'[^']*')*>/giu)??[]){
  if(attr(tag,'aria-haspopup')!=='listbox')continue;
  const label=attr(tag,'aria-label');
  if(!label||!/(?:country|region)/iu.test(label))continue;
  const match=/\bcurrent\s+(?:country|region)\s+([A-Z]{2})\b/iu.exec(label);
  if(match)rows.push({label,code:match[1]});
 }
 return rows.length===1?rows[0]:null;
}
export function validateProviderSelectedMarketReceipt(receipt,{observationId,url,body,sourceHash,targetMarket}){
 if(!receipt||receipt.kind!=='PROVIDER_SELECTED_MARKET'||receipt.observationId!==observationId||receipt.targetMarket!==targetMarket||!names.has(targetMarket)||receipt.transport!=='DIRECT_BROWSER')throw Error('PROVIDER_SELECTED_MARKET_RECEIPT_INVALID');
 const finalUrl=normalizeUrl(url),initialUrl=normalizeUrl(receipt.initialUrl);
 if(!finalUrl||!initialUrl||receipt.finalUrl!==finalUrl||new URL(finalUrl).origin!==new URL(initialUrl).origin||receipt.providerHost!==new URL(finalUrl).hostname||receipt.finalSourceSha256!==sourceHash||digest(body)!==sourceHash||!/^([a-f0-9]{64})$/.test(receipt.preSourceSha256??''))throw Error('PROVIDER_SELECTED_MARKET_SOURCE_INVALID');
 if(!exactMarketOption(targetMarket,receipt.selectedOption)||!marketCodeMatches(targetMarket,receipt.selectedCode)||marketCodeMatches(targetMarket,receipt.preSelectedCode)||receipt.preSelectedCode===receipt.selectedCode||receipt.preSourceSha256===sourceHash)throw Error('PROVIDER_SELECTED_MARKET_STATE_INVALID');
 const control=selectedMarketControl(body);
 if(!control||control.code!==receipt.selectedCode||control.label!==receipt.selectorLabel)throw Error('PROVIDER_SELECTED_MARKET_SOURCE_INVALID');
 return {kind:'PROVIDER_SELECTED_MARKET',targetMarket,selectedCode:control.code,selectedOption:receipt.selectedOption,selectorLabel:control.label,observationId,sourceHash,finalUrl,providerHost:receipt.providerHost};
}
export function providerSelectedMarketContext(observation){
 const receipt=observation?.marketSelection;
 if(!receipt)return null;
 try{return validateProviderSelectedMarketReceipt(receipt,{observationId:observation.id,url:observation.url,body:observation.body,sourceHash:observation.sha256,targetMarket:receipt.targetMarket}).targetMarket;}catch{return null;}
}
