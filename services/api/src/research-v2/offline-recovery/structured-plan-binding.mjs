// Bounded, non-executing binding of rendered plan IDs to contained price objects.
// A JSON claim must match one visible card; hidden/config-only offers stay research.
const pathOf=n=>n.parent?pathOf(n.parent)+'/'+n.tag+'['+n.index+']':'$';
const norm=x=>String(x??'').normalize('NFKC').replace(/\s+/g,' ').trim();
const text=x=>typeof x==='string'?x:typeof x?.plainText==='string'?x.plainText:null;
const unsafe=/\b(?:intro|trial|promo|discount|sale|crossed|former|bundle|add.on|upgrade|from|one.time|prepaid|annual|yearly|equivalent)\b/i;
const hidden=n=>{for(let x=n;x;x=x.parent)if(x.attrs?.hidden!==undefined||x.attrs?.['aria-hidden']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(x.attrs?.style??''))return true;return false;};
export function bindStructuredPlans(tree,{amount,monetary},bodyHash){
 const found=[],diagnostics=[];let steps=0;const bounds={nodes:100000,depth:48,bindings:128,cardCharacters:2000,scopeCharacters:6000};
 function walk(v,p,depth=0){if(++steps>bounds.nodes||depth>bounds.depth)throw Error('STRUCTURED_PLAN_BINDING_BOUND');if(!v||typeof v!=='object')return;
  if(!Array.isArray(v)){
   const keys=['productName','planName','name'].filter(k=>text(v[k]));const names=[...new Set(keys.map(k=>norm(text(v[k]))))];const price=v.price,id=v.pricePlan?.id??v.planId??v.id;
   if(names.length===1&&price&&typeof price==='object'&&!Array.isArray(price)&&id!==undefined){
    const name=names[0],raw=text(price.amount),cur=price.currencyCode??price.priceCurrency,period=text(price.period);const value=raw===null?null:amount(raw);
    const cards=tree.nodes.filter(n=>n.attrs?.id===String(id)&&!hidden(n));
    const context=JSON.stringify(Object.fromEntries(Object.entries(v).filter(([k])=>!['features','images','ctas'].includes(k))));
    if(!/\/(?:yearly|annual)(?:\/|$)/i.test(p)&&![v.recurring,v.autoRenew,price.recurring,price.autoRenew].includes(false)&&value!==null&&typeof cur==='string'&&/^[A-Z]{3}$/.test(cur)&&/^month$/i.test(period??'')&&cards.length===1&&!unsafe.test(context)&&!Object.keys(v).some(k=>/sale|old|original|intro|discount|hidden|selected/i.test(k))&&!Object.keys(price).some(k=>/sale|old|original|intro|discount|duration/i.test(k))){
     const card=cards[0],desc=tree.nodes.filter(n=>n.start>=card.start&&n.end<=card.end&&!hidden(n));
     const headings=desc.filter(n=>/^h[1-6]$/.test(n.tag)||n.attrs?.role==='heading');const labels=[...new Set(headings.map(n=>norm(n.text)))];
     const monies=monetary(card.text);const amounts=[...new Set(monies.map(m=>m.amount))];
     const renderedCurrency=text(price.currency);const tokenOK=monies.every(m=>m.currencyRaw===cur||renderedCurrency&&norm(m.currencyRaw)===norm(renderedCurrency));
     let scope=card,renewal=null;for(let i=0;scope&&i<3;i++,scope=scope.parent){if(scope.text.length>bounds.scopeCharacters)break;const m=/\b(?:plans?|subscriptions?)\s+auto[- ]renew monthly unless cancel(?:led|ed)\b/i.exec(scope.text);if(m){if(!/\b(?:intro|trial|promotion|limited.time|discount|special.offer|prepaid)\b/i.test(scope.text))renewal={path:pathOf(scope),raw:m[0]};break;}}
     if(card.text.length<=bounds.cardCharacters&&labels.length===1&&labels[0]===name&&amounts.length===1&&amounts[0]===value&&tokenOK&&/\/\s*month\b|per month\b/i.test(card.text)&&!unsafe.test(card.text)&&!desc.some(n=>['del','s'].includes(n.tag))&&renewal){
      if(found.length>=bounds.bindings)throw Error('STRUCTURED_PLAN_BINDING_BOUND');
      found.push({name,raw,value,currency:cur,period:'MONTH',path:p+'/price/amount'+(typeof price.amount==='object'?'/plainText':''),namePath:p+'/'+keys[0]+(typeof v[keys[0]]==='object'?'/plainText':''),proof:{bodyHash,objectPath:p,amountPath:p+'/price/amount'+(typeof price.amount==='object'?'/plainText':''),cardPath:pathOf(card),cardSpan:[card.start,card.end],planId:String(id),currencyPath:p+'/price/'+(price.currencyCode?'currencyCode':'priceCurrency'),periodPath:p+'/price/period',renewal,relationship:'CONTAINED_PRICE_AND_EXACT_RENDERED_PLAN_ID'},rawObject:JSON.stringify(v)});
     }
    }
   }
  }
  for(const[k,x]of Object.entries(v))walk(x,p+'/'+k.replaceAll('~','~0').replaceAll('/','~1'),depth+1);
 }
 try{for(const n of tree.nodes.filter(n=>n.tag==='script'&&!n.attrs?.src)){let v;try{v=JSON.parse(n.raw);}catch{continue;}walk(v,pathOf(n));}}catch(e){return {bindings:[],diagnostics:[e.message],bounds,steps};}
 // Distinct disagreeing objects for the same rendered plan are never chosen by order.
 const conflicts=new Set(found.filter(a=>found.some(b=>a.name===b.name&&(a.value!==b.value||a.currency!==b.currency))).map(a=>a.name));
 return {bindings:found.filter(a=>!conflicts.has(a.name)),diagnostics:[...diagnostics,...[...conflicts].map(name=>'CONFLICTING_PLAN:'+name)],bounds,steps};
}
