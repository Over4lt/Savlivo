export const simplifiedRecoveryLimits=Object.freeze({requests:1,plans:32,sources:64,textBytes:65_536,contextLength:500});
const clean=(value,max=300)=>typeof value==='string'&&value.trim()&&value.length<=max?value.trim().replace(/\s+/g,' '):null;
const safeUrl=value=>{if(typeof value!=='string')return null;try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&url.href.length<=2048?url.href:null;}catch{return null;}};
const currency=value=>typeof value==='string'&&/^[a-z]{3}$/i.test(value.trim())?value.trim().toUpperCase():null;
const amount=value=>{const number=typeof value==='number'?value:typeof value==='string'&&/^[0-9]{1,6}(?:\.[0-9]{1,2})?$/.test(value.trim())?Number(value.trim()):null;return number!==null&&Number.isFinite(number)&&number>0&&number<=1_000_000?number:null;};
const monthly=/(?:\bmonthly\b|\bper month\b|\/\s*(?:month|mo)\b|\bevery month\b|\beach month\b)/i;
const explicitMonthly=/(?:\bbilled monthly\b|\bcharged monthly\b|\bpaid monthly\b|\bpayable monthly\b|\bcharged (?:each|every) month\b|\bpaid (?:each|every) month\b)/i;
const annualPayment=/(?:\b(?:billed|charged|paid|payable)\s+(?:annually|yearly)\b|\bannual(?:ly)?\s+(?:billing|payment|prepay|upfront)\b|\byearly\s+(?:billing|payment|prepay|upfront)\b|\b(?:per|a|each|every)\s+(?:year|annum)\b|\/\s*(?:year|yr|annum|12\s*months?)\b|\b(?:for|each|every)\s+12\s+months?\b|\bannual\s+(?:equivalent|price)\b|\bdivid(?:e|ed|ing)\b.{0,50}\b12\b)/i;
const annualMention=/\b(?:annual|annually|yearly|annum|equivalent)\b|\/\s*(?:year|yr)\b/i;
const nonMonthly=/\b(?:bi[- ]?monthly|semi[- ]?monthly|quarterly|weekly|one[- ]?time)\b|\bevery (?:other|two|2|three|3) months?\b/i;
const outputText=response=>Array.isArray(response?.candidates)?response.candidates.flatMap(candidate=>candidate?.content?.parts??[]).map(part=>part?.text).filter(value=>typeof value==='string').join(''):null;
const citations=response=>Array.isArray(response?.candidates)?response.candidates.flatMap(candidate=>candidate?.groundingMetadata?.groundingChunks??[]).map(chunk=>({title:clean(chunk?.web?.title,300)??'',url:safeUrl(chunk?.web?.uri)})).filter(row=>row.url).slice(0,simplifiedRecoveryLimits.sources):[];
const uniqueSources=rows=>[...new Map(rows.map(row=>[row.url,row])).values()].slice(0,simplifiedRecoveryLimits.sources);
const diagnostic=(reason,details={})=>({reason,...details});

export function simplifiedRecoveryEligibility(strict,{maxTotalRequests=3}={}){
 const requests=strict?.audit?.request?.requestCount,status=strict?.audit?.request?.status;
 const malformed=strict?.status==='GOOGLE_AI_MALFORMED_RESPONSE'&&strict.aiResult==null;
 const acquisition=strict?.status==='GOOGLE_AI_ACCESS_FAILURE'&&strict.aiResult==null&&(status==='TRANSPORT_FAILURE'||/^HTTP_5\d\d$/.test(status??''));
 if(!malformed&&!acquisition)return {eligible:false,reason:['CREDENTIAL_UNAVAILABLE','HTTP_403','HTTP_429','POLICY_BLOCK'].includes(status)?'STRICT_POLICY_OR_CREDENTIAL_BLOCK':'STRICT_RESULT_NOT_RECOVERABLE'};
 if(!Number.isSafeInteger(requests)||requests<0||!Number.isSafeInteger(maxTotalRequests)||maxTotalRequests<1||requests>=Math.min(maxTotalRequests,3))return {eligible:false,reason:'RECOVERY_BUDGET_UNAVAILABLE'};
 return {eligible:true,reason:malformed?(status==='NORMALIZATION_FAILED'?'STRICT_NORMALIZATION_FAILED':'STRICT_STRUCTURED_RESPONSE_INVALID'):'STRICT_ACQUISITION_FAILURE'};
}

export function simplifiedRecoveryPrompt(providerName,targetMarket){
 return `${providerName} ${targetMarket} monthly subscription prices and official prices page. Find current consumer plans actually charged each month in ${targetMarket}. Exclude annual prepayment, annual prices shown per month, and annual totals divided by 12. Return concise JSON: {"plans":[{"planName":"...","amount":9.99,"currency":"USD","billingCadence":"monthly","actualMonthlyBilling":true,"sourceUrl":"https://...","supportingContext":"short billing quote"}],"sources":[{"url":"https://..."}]}. Use null or omit unknown fields; include useful official pricing URLs even when a price is uncertain. Do not invent prices.`;
}

export function parseSimplifiedRecovery(response,{providerName,targetMarket,requestCount=1,timestamp}={}){
 const raw=outputText(response),bytes=typeof raw==='string'?Buffer.byteLength(raw):0;
 if(!raw?.trim()||bytes>simplifiedRecoveryLimits.textBytes)return {aiResult:null,outcome:'RECOVERY_OUTPUT_INVALID',diagnostics:[diagnostic('EMPTY_OR_OVERSIZED_OUTPUT')]};
 let parsed;
 try{const text=raw.trim(),fenced=/^```json[\t ]*\r?\n([\s\S]*?)\r?\n```$/i.exec(text);parsed=JSON.parse(fenced?fenced[1].trim():text);}catch{return {aiResult:null,outcome:'RECOVERY_OUTPUT_INVALID',diagnostics:[diagnostic('PARSER_FAILURE')]};}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||parsed.plans==null&&parsed.sources==null||parsed.plans!=null&&(!Array.isArray(parsed.plans)||parsed.plans.length>simplifiedRecoveryLimits.plans)||parsed.sources!=null&&(!Array.isArray(parsed.sources)||parsed.sources.length>simplifiedRecoveryLimits.sources))return {aiResult:null,outcome:'RECOVERY_OUTPUT_INVALID',diagnostics:[diagnostic('RECOVERY_SHAPE_INVALID')]};
 if(parsed.provider!==undefined&&clean(parsed.provider,120)?.toLowerCase()!==providerName.toLowerCase()||parsed.market!==undefined&&String(parsed.market).toUpperCase()!==targetMarket)return {aiResult:null,outcome:'RECOVERY_OUTPUT_INVALID',diagnostics:[diagnostic('TARGET_ASSOCIATION_MISMATCH')]};
 const plans=[],diagnostics=[],sourceRows=[];
 for(const [index,row] of (parsed.plans??[]).entries()){
  if(!row||typeof row!=='object'||Array.isArray(row)){diagnostics.push(diagnostic('INVALID_PLAN_SHAPE',{index}));continue;}
  const sourceUrl=safeUrl(row.sourceUrl);if(sourceUrl)sourceRows.push({title:'',url:sourceUrl});
  if(row.provider!==undefined&&clean(row.provider,120)?.toLowerCase()!==providerName.toLowerCase()||row.market!==undefined&&String(row.market).toUpperCase()!==targetMarket){diagnostics.push(diagnostic('TARGET_ASSOCIATION_MISMATCH',{index}));continue;}
  const planName=clean(row.planName,300),value=amount(row.amount),unit=currency(row.currency),cadence=clean(row.billingCadence??row.paymentCadence,100)??'',context=clean(row.supportingContext??row.sourceEvidence??row.summary, simplifiedRecoveryLimits.contextLength)??'',basis=clean(row.billingBasis,200)??'',combined=[cadence,context,basis].join(' ');
  if(!planName||value===null||!unit){diagnostics.push(diagnostic('PLAN_FIELDS_INVALID',{index}));continue;}
  if(row.actualMonthlyBilling===false||String(row.actualMonthlyBilling).toLowerCase()==='false'||row.annualOnly===true||row.freeTier===true||annualPayment.test(combined)||nonMonthly.test(combined)||annualMention.test(combined)&&!explicitMonthly.test(combined)){
   diagnostics.push(diagnostic('ANNUAL_OR_NONMONTHLY_BILLING',{index}));continue;
  }
  if(!monthly.test(combined)){
   diagnostics.push(diagnostic('MONTHLY_BILLING_UNCONFIRMED',{index}));continue;
  }
  plans.push({planName,amount:value,currency:unit,paymentCadence:'MONTHLY_RECURRING',commitment:null,ordinaryRecurringPrice:value,introPrice:null,introDuration:null,sourceUrl,sourceEvidence:null,marketEvidence:null,billingBasis:'charged monthly',annualOnly:false,freeTier:false,summary:context||null,warnings:[],market:targetMarket,sourceReferences:sourceUrl?[sourceUrl]:[]});
 }
 for(const row of parsed.sources??[]){const url=safeUrl(typeof row==='string'?row:row?.url);if(url)sourceRows.push({title:clean(row?.title,300)??'',url});}
 sourceRows.push(...citations(response));
 const sources=uniqueSources(sourceRows),aiResult={provider:providerName,market:targetMarket,plans,sources,warnings:[],timestamp,requestCount};
 return {aiResult,outcome:plans.length?'RECOVERY_CANDIDATES':sources.length?'RECOVERY_URLS_ONLY':'RECOVERY_NO_USABLE_RESULT',diagnostics:diagnostics.slice(0,simplifiedRecoveryLimits.plans)};
}
