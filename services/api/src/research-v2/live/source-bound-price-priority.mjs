// Routing priority only. The candidate must already be a source-bound link on
// this target's complete G1 provider page. A sibling's successful Research
// Link can identify a likely article path, but grants no market or price Truth.
const priceTitle=/\b(?:plans?|pricing|prices?|tariffs?|preise?|tarife?|precios?|planes|priser|prezzi|piani|fiyatlar?|ceny|cenik)\b|料金|価格|プラン|요금|가격|ราคา/iu;
const managementTitle=/\b(?:change|manage|cancel|refund|update|switch|troubleshoot|billing|payment|account|gift|annual|yearly|discount|promotion|bundle|add-?on)\b/iu;
const countrySegment=segment=>/^[a-z]{2}$/u.test(segment);

function sourceBoundG1(target,lead){
 const from=lead?.from,source=lead?.source;
 if(target?.operationsObjective!=='PRICE_RESEARCH'||lead?.sourceBoundCandidate!==true||from?.mechanism!=='V3_SOURCE_BOUND_CONTINUATION'||source?.bodySha256!==from.bodyHash||source?.observation!==from.observation||source?.sha256!==from.locator?.sha256||source?.start!==from.locator?.start||source?.end!==from.locator?.end||!Number.isSafeInteger(source?.start)||!Number.isSafeInteger(source?.end)||source.start<0||source.start>=source.end||!/^[a-f0-9]{64}$/u.test(from.bodyHash??''))return false;
 const parent=(target.sourceBoundContinuationParents??[]).some(row=>row.accepted===true&&row.id===from.observation&&row.sha256===from.bodyHash&&row.context?.transport==='DECODO'&&row.context?.networkGeography===target.market);
 return parent&&(target.acquisitionOutcomes??[]).some(row=>row.sourceClassification?.status==='PROVIDER_SOURCE'&&row.sourceClassification.sourceHash===from.bodyHash&&row.countryV3Evaluation?.status==='EVALUATED'&&row.countryV3Evaluation.receiptStatus==='HASH_VERIFIED'&&row.countryV3Evaluation.geoClass==='G1');
}

function successfulSiblingPath(target,lead){
 let destination;try{destination=new URL(lead.url);}catch{return false;}
 const parts=destination.pathname.split('/');if(destination.protocol!=='https:'||!countrySegment(parts[1])||parts[1].toUpperCase()!==target.market||parts.length<4)return false;
 return (target.successfulResearchLinkHints??[]).some(hint=>{
  if(hint.serviceId!==target.service||hint.enabled!==true||hint.truthAuthority!=='NONE'||hint.marketScope!=='MARKET_SPECIFIC'||hint.lastResult!=='VERIFIED'||hint.marketCode===target.market)return false;
  let source;try{source=new URL(hint.url);}catch{return false;}
  const sibling=source.pathname.split('/');return source.protocol==='https:'&&source.hostname===destination.hostname&&countrySegment(sibling[1])&&sibling[1].toUpperCase()===hint.marketCode&&sibling.length===parts.length&&sibling.slice(2).every((part,index)=>part===parts[index+2]);
 });
}

export function sourceBoundPriceRoutingBonus(target,lead){
 if(!sourceBoundG1(target,lead))return 0;
 let destination,parent;try{destination=new URL(lead.url);parent=new URL(lead.from.url);}catch{return 0;}
 const country=destination.pathname.split('/')[1];
 if(destination.protocol!=='https:'||destination.hostname!==parent.hostname||countrySegment(country)&&country.toUpperCase()!==target.market)return 0;
 const title=String(lead.title??'').trim();if(managementTitle.test(title))return 0;
 if(successfulSiblingPath(target,lead))return -30;
 return priceTitle.test(title)?-10:0;
}
