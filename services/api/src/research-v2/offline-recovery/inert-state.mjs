// Data-only observations of literal initializers. Never executes or resolves JS.
// Partial wrappers are not runtime state: activation/offer ownership stays unknown.
export const inertBounds=Object.freeze({scriptBytes:262144,tokens:60000,depth:48,values:30000,scripts:256,observations:512});
const forbidden=new Set(['__proto__','prototype','constructor']);
const pointer=x=>String(x).replaceAll('~','~0').replaceAll('/','~1');
const pathOf=n=>n.parent?pathOf(n.parent)+'/'+n.tag+'['+n.index+']':'$';
function tokenize(raw,b){
 const tokens=[];let i=0;
 while(i<raw.length){
  if(/\s/.test(raw[i])){i++;continue;}
  if(raw.startsWith('//',i)){const e=raw.indexOf('\n',i+2);i=e<0?raw.length:e+1;continue;}
  if(raw.startsWith('/*',i)){const e=raw.indexOf('*/',i+2);if(e<0)throw Error('COMMENT');i=e+2;continue;}
  const start=i,c=raw[i];let value,type;
  if(c==='"'||c==="'"){
   i++;let escaped=false;for(;i<raw.length;i++){if(!escaped&&raw[i]===c)break;if(!escaped&&/[\r\n]/.test(raw[i]))throw Error('STRING');if(!escaped&&raw[i]==='\\')escaped=true;else escaped=false;}
   if(i===raw.length)throw Error('STRING');i++;
   // JSON strings only as data. Single-quoted strings can be skipped, never decoded.
   type=c==='"'?'string':'unsupported';if(type==='string')value=JSON.parse(raw.slice(start,i));
  }else{
   const id=/^[A-Za-z_$][\w$]*/.exec(raw.slice(i));const num=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(raw.slice(i));
   if(id){i+=id[0].length;value=id[0];type='id';}
   else if(num){i+=num[0].length;value=Number(num[0]);if(!Number.isFinite(value))throw Error('NUMBER');type='number';}
   else{if(c==='`'||c==='/')throw Error('UNSUPPORTED_LEXICAL_FORM');i++;value=c;type='punct';}
  }
  if(tokens.length>=b.tokens)throw Error('TOKEN_BOUND');tokens.push({type,value,start,end:i});
 }
 const stack=[];for(let j=0;j<tokens.length;j++){const v=tokens[j].value;if(tokens[j].type!=='punct')continue;if(['{','[','('].includes(v)){stack.push(j);if(stack.length>b.depth)throw Error('DEPTH_BOUND');}else if(['}',']',')'].includes(v)){const k=stack.pop();if(k===undefined||tokens[k].value!==({'}':'{',']':'[',')':'('})[v])throw Error('DELIMITER');tokens[k].close=j;}}
 if(stack.length)throw Error('DELIMITER');return tokens;
}
export function parseInertAssignments(raw,limits={}){
 const b={...inertBounds,...limits};if(Buffer.byteLength(raw)>b.scriptBytes)return {roots:[],reason:'SCRIPT_SIZE_BOUND'};
 try{
  const t=tokenize(raw,b);let values=0;
  function data(a,z,path){
   if(++values>b.values)throw Error('VALUE_BOUND');if(a>=z)return null;
   const x=t[a],last=t[z-1];
   if(z===a+1){if(x.type==='string'||x.type==='number')return {value:x.value,path,span:[x.start,x.end],complete:true,children:[]};if(x.type==='id'&&['true','false','null'].includes(x.value))return {value:JSON.parse(x.value),path,span:[x.start,x.end],complete:true,children:[]};return null;}
   if(!['{','['].includes(x.value)||x.close!==z-1)return null;
   const object=x.value==='{',children=[],value=object?Object.create(null):[];let complete=true,j=a+1,index=0;const keys=new Set();
   while(j<z-1){let k=index++,begin=j;
    if(object){if(!['string','id'].includes(t[j]?.type)||t[j+1]?.value!==':')return null;k=t[j].value;if(forbidden.has(k)||keys.has(k))return null;keys.add(k);begin=j+2;}
    let end=begin;while(end<z-1&&!(t[end].type==='punct'&&t[end].value===',')){end=t[end].close!==undefined?t[end].close+1:end+1;}
    if(end===begin)return null;const child=data(begin,end,path+'/'+pointer(k));
    if(child){children.push(child);if(child.complete)value[k]=child.value;else complete=false;}else complete=false;
    j=end<z-1?end+1:end;
   }
   return {value,path,span:[x.start,last.end],complete,children};
  }
  const roots=[];let a=0;
  while(a<t.length){let z=a;while(z<t.length&&!(t[z].type==='punct'&&t[z].value===';'))z=t[z].close!==undefined?t[z].close+1:z+1;
   let j=a;if(['const','let','var'].includes(t[j]?.value))j++;
   const names=[];if(t[j]?.type==='id'){names.push(t[j++].value);while(t[j]?.value==='.'&&t[j+1]?.type==='id'){names.push(t[j+1].value);j+=2;}}
   if(names.length&&!names.some(n=>forbidden.has(n))&&t[j]?.value==='='&&t[j+1]?.value!=='='){
    const root=data(j+1,z,names.join('.'));if(root&&typeof root.value==='object'&&root.value!==null)roots.push(root);
   }
   a=z+1;
  }
  return {roots,values,tokens:t.length};
 }catch(error){return {roots:[],reason:error.message};}
}
const moneyRoles={totalAmountWithTaxes:'TAX_INCLUSIVE_TOTAL',totalAmount:'TOTAL',priceAmount:'PRODUCT_PRICE',originalAmount:'REFERENCE',originalAmountWithTaxes:'REFERENCE_TAX_INCLUSIVE',discountAmount:'DISCOUNT',discountAmountWithTaxes:'DISCOUNT',creditAmount:'CREDIT',creditAmountWithTaxes:'CREDIT',taxAmount:'TAX',trialPrice:'TRIAL'};
const units={months:'MONTH',month:'MONTH',years:'YEAR',year:'YEAR',weeks:'WEEK',week:'WEEK',days:'DAY',day:'DAY'};
export function recoverInertMoney(tree,bodyHash,limits={}){
 const b={...inertBounds,...limits},diagnostics=[],roots=[],observations=[],exponents=new Map();let visitedScripts=0,totalValues=0;
 for(const n of tree.nodes){if(n.tag!=='script'||n.attrs.src)continue;if(++visitedScripts>b.scripts)return {observations:[],diagnostics:[{reason:'SCRIPT_COUNT_BOUND'}]};
  const parsed=parseInertAssignments(n.raw??'',b);if(parsed.reason){diagnostics.push({path:pathOf(n),reason:parsed.reason});continue;}
  totalValues+=parsed.values??0;if(totalValues>b.values)return {observations:[],diagnostics:[{reason:'TOTAL_VALUE_BOUND'}]};
  for(const root of parsed.roots)roots.push({root,scriptPath:pathOf(n),offset:n.openEnd});
 }
 function visit(n,fn){fn(n);for(const c of n.children)visit(c,fn);}
 const proof=(n,r)=>({bodyHash,scriptPath:r.scriptPath,path:r.scriptPath+'/initializer/'+n.path,span:n.span.map(v=>v+r.offset),method:'INERT_LITERAL_INITIALIZER',completeLiteral:n.complete});
 for(const r of roots)visit(r.root,n=>{if(n.complete&&/\/(?:currenciesSubunit|currencyExponents)$/.test(n.path))for(const [currency,exponent]of Object.entries(n.value??{})){if(/^[A-Z]{3}$/.test(currency)&&Number.isInteger(exponent)&&exponent>=0&&exponent<=6){const items=exponents.get(currency)??[];items.push({exponent,source:proof(n,r)});exponents.set(currency,items);}}});
 function normalized(raw,exponent){if(typeof raw!=='string'||!/^\d{1,18}$/.test(raw)||exponent===null)return null;const s=raw.padStart(exponent+1,'0'),v=exponent?s.slice(0,-exponent)+'.'+s.slice(-exponent):s;return v.replace(/^0+(?=\d)/,'').replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');}
 for(const r of roots)visit(r.root,n=>{
  if(!n.complete||!n.value||Array.isArray(n.value)||typeof n.value!=='object')return;
  const v=n.value,p=v.product??v,plan=typeof p.name==='string'?p.name:null,subscription=p.subscription;
  for(const [key,role]of Object.entries(moneyRoles)){
   const m=v[key];if(!m||typeof m!=='object'||Array.isArray(m))continue;
   const currency=m.currencyCode??m.currency;if(!/^[A-Z]{3}$/.test(currency??'')||typeof m.amount!=='string')continue;
   const refs=exponents.get(currency)??[],distinct=new Set(refs.map(x=>x.exponent)),exponent=distinct.size===1?refs[0].exponent:null;
   const moneyNode=n.children.find(c=>c.path===n.path+'/'+key);if(!moneyNode)continue;
   const unit=units[subscription?.unit],length=subscription?.length;
   const cadence=unit&&Number.isInteger(length)&&length>0&&length<=120?{value:length,unit,normalized:'P'+length+unit[0]}:null;
   if(observations.length>b.observations)return;observations.push({plan,sku:typeof p.sku==='string'?p.sku:null,role,rawAmount:m.amount,currency,amount:normalized(m.amount,exponent),exponent,cadence,source:proof(moneyNode,r),owner:proof(n,r),exponentSources:refs,trialOrIncentivePresent:Object.hasOwn(v,'incentive')||Object.hasOwn(v,'trialPrice'),activation:'UNRESOLVED'});
  }
 });
 if(observations.length>b.observations)return {observations:[],diagnostics:[...diagnostics,{reason:'OBSERVATION_BOUND'}]};
 return {observations,diagnostics,bounds:b};
}
