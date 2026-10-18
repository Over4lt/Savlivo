// Provider-owned selector state is market context only. Price, currency and
// cadence still require independent evidence from this exact retained source.
import {countryCurrencyData} from '../../../../packages/contracts/src/markets.ts';
import {digest,normalizeUrl} from './model.mjs';

const names=new Map(countryCurrencyData.map(([code,name])=>[code,name]));
// Country selectors can use a former official English name for a canonical
// market. These aliases identify the country only; they confer no price truth.
const alternateNames=new Map([['CZ',['Czech Republic']],['TR',['Turkey']]]);
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
 return [name,...(alternateNames.get(target)??[])].some(candidate=>normalized(text)===normalized(candidate)||normalized(text).startsWith(normalized(candidate)+' (')&&text.endsWith(')'));
}
const optionLanguage=label=>/\(([^()]*)\)\s*$/u.exec(String(label??''))?.[1]?.trim()||null;
const localeLanguage=value=>{try{const code=new Intl.Locale(value).language.toLowerCase();return /^[a-z]{2,3}$/.test(code)?code:null;}catch{return null;}};
function languageKey(value,documentLang){
 const text=normalized(value),code=localeLanguage(documentLang);
 if(!text)return null;
 if(code){
  const english=new Intl.DisplayNames(['en'],{type:'language'}).of(code),native=new Intl.DisplayNames([code],{type:'language'}).of(code);
  if([code,english,native].some(alias=>normalized(alias)===text))return 'locale:'+code;
 }
 return 'label:'+text;
}

// Language only resolves a tie after every candidate has the exact target
// country identity. The selected provider option outranks document language.
export function chooseProviderMarketOption({target,currentCode,candidates,selectedOptions=[],documentLang=null}){
 if(!Array.isArray(candidates)||candidates.length<1||candidates.length>256||candidates.some(label=>!exactMarketOption(target,label)))return null;
 if(candidates.length===1)return {index:0,basis:'UNIQUE_COUNTRY'};
 const currentMarkets=[...names.keys()].filter(code=>marketCodeMatches(code,currentCode));
 if(currentMarkets.length!==1||!Array.isArray(selectedOptions)||selectedOptions.length>1)return null;
 if(selectedOptions.length===1&&!exactMarketOption(currentMarkets[0],selectedOptions[0]))return null;
 const selectedLanguage=selectedOptions.length===1?optionLanguage(selectedOptions[0]):null;
 const documentCode=localeLanguage(documentLang),preference=selectedLanguage??documentCode;
 if(!preference)return null;
 const key=languageKey(preference,documentLang),matches=candidates.flatMap((label,index)=>{
  const language=optionLanguage(label);
  return language&&languageKey(language,documentLang)===key?[index]:[];
 });
 return matches.length===1?{index:matches[0],basis:selectedLanguage?'SELECTED_OPTION_LANGUAGE':'DOCUMENT_LANGUAGE'}:null;
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
 const alreadySelected=receipt.selectionMode==='ALREADY_SELECTED';
 if(alreadySelected){
  if(receipt.selectedOption!==null||!marketCodeMatches(targetMarket,receipt.preSelectedCode)||receipt.preSelectedCode!==receipt.selectedCode)throw Error('PROVIDER_SELECTED_MARKET_STATE_INVALID');
 }else if(receipt.selectionMode&&receipt.selectionMode!=='SELECTED_OPTION'||!exactMarketOption(targetMarket,receipt.selectedOption)||marketCodeMatches(targetMarket,receipt.preSelectedCode)||receipt.preSelectedCode===receipt.selectedCode||receipt.preSourceSha256===sourceHash)throw Error('PROVIDER_SELECTED_MARKET_STATE_INVALID');
 if(!marketCodeMatches(targetMarket,receipt.selectedCode))throw Error('PROVIDER_SELECTED_MARKET_STATE_INVALID');
 const control=selectedMarketControl(body);
 if(!control||control.code!==receipt.selectedCode||control.label!==receipt.selectorLabel)throw Error('PROVIDER_SELECTED_MARKET_SOURCE_INVALID');
 return {kind:'PROVIDER_SELECTED_MARKET',targetMarket,selectedCode:control.code,selectedOption:receipt.selectedOption,selectorLabel:control.label,observationId,sourceHash,finalUrl,providerHost:receipt.providerHost};
}
export function providerSelectedMarketContext(observation){
 const receipt=observation?.marketSelection;
 if(!receipt)return null;
 try{return validateProviderSelectedMarketReceipt(receipt,{observationId:observation.id,url:observation.url,body:observation.body,sourceHash:observation.sha256,targetMarket:receipt.targetMarket}).targetMarket;}catch{return null;}
}
