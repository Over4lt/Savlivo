// Static page-linked option-renderer evidence. Never executes provider JavaScript.
const pathOf=n=>n.parent?pathOf(n.parent)+'/'+n.tag+'['+n.index+']':'$';
const norm=s=>s.normalize('NFKC').replace(/[\u200b\u2060]/g,'').replace(/\s+/g,' ').trim();
const runs=v=>Array.isArray(v?.runs)&&v.runs.length>0&&v.runs.length<=16&&v.runs.every(r=>typeof r.text==='string')?norm(v.runs.map(r=>r.text).join('')):null;
const plainTitle=v=>v?.runs?.length===1&&Object.keys(v.runs[0]).every(k=>k==='text')?runs(v):null;
const unsafe=/\b(?:annual\w*|year\w*|equivalent|prepaid|one.time|non.?renew\w*|from|starting|bundle|add.on|upgrade|limited|discount\w*|promo\w*|former|crossed|fixed|one.off|entitlement)\b/i;
const hidden=v=>v&&typeof v==='object'&&(v.hidden===true||v.isHidden===true||v.disabled===true||v.isDisabled===true||v.visible===false||v.selected===false||v.recurring===false||v.autoRenew===false);
const unwrap=(x)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===1&&/Renderer$/.test(Object.keys(x)[0])?{key:Object.keys(x)[0],value:Object.values(x)[0]}:null;
const same=(a,b)=>{try{return new URL(a).href===new URL(b).href&&new URL(a).protocol==='https:';}catch{return false;}};
export function bindNestedOptions(tree,{monetary},bodyHash){
 const found=[];let nodes=0;const bounds={nodes:100000,depth:72,bindings:128,payloadBytes:524288};
 const links=tree.nodes.filter(n=>n.tag==='link'&&n.attrs.rel==='canonical');if(links.length!==1)return {bindings:[],diagnostics:[]};const documentURL=links[0].attrs.href;
 try{for(const script of tree.nodes.filter(n=>n.tag==='script'&&!n.attrs.src)){
  const raw=script.raw??'';if(!raw.includes('optionItems')||!raw.includes('urlCanonical')||Buffer.byteLength(raw)>bounds.payloadBytes)continue;
  const assignment=/^\s*(?:(?:var|let|const)\s+[A-Za-z_$][\w$]*\s*=\s*)?(\{[\s\S]*\})\s*;?\s*$/.exec(raw);if(!assignment)continue;let root;try{root=JSON.parse(assignment[1]);}catch{continue;}
  // Independent page metadata pins the UI payload to this exact document. It
  // does not turn an embedded global product catalog into a local offer.
  const metadata=unwrap(root.microformat);if(!metadata||!same(documentURL,metadata.value?.urlCanonical))continue;
  const scriptPath=pathOf(script),payloadPath=scriptPath+'/literal',metadataPath=payloadPath+'/microformat/'+metadata.key+'/urlCanonical';
  function walk(v,p,anc=[],depth=0){if(++nodes>bounds.nodes||depth>bounds.depth)throw Error('NESTED_OPTION_BOUND');if(!v||typeof v!=='object'||hidden(v)||/\/(?:annual|yearly)(?:\/|$)/i.test(p)||['billingPeriod','billingInterval'].some(k=>v[k]!==undefined&&!/^(?:MONTH|MONTHLY|P1M)$/i.test(String(v[k]))))return;
   if(Array.isArray(v.optionItems)&&v.optionItems.length<=16&&plainTitle(v.title)&&p.includes('/onTap/')&&anc.some(a=>Array.isArray(a.value.steps)&&a.value.steps.length===1)){
    const group=plainTitle(v.title);if(!Object.keys(v).some(k=>/currency|amount|price$|billingPeriod/i.test(k))&&group.length<=80&&!unsafe.test(group)&&!monetary(group).length){
     for(let i=0;i<v.optionItems.length;i++){const wrapper=unwrap(v.optionItems[i]),item=wrapper?.value,name=plainTitle(item?.title),subtitle=runs(item?.subtitle);if(!item||hidden(item)||!name||name.length>80||!subtitle||subtitle.length>300||unsafe.test(name)||monetary(name).length)continue;
      const description=runs(item.description)??'';
      // Annual eligibility verification is a product condition, not annual billing.
      const context=[group,name,subtitle,description.replace(/\bAnnual verification required\./gi,'')].join(' ');if(unsafe.test(context)||/does not auto.?renew|no auto(?:matic)?[ -]?renew|not recurring|without renewal|pay once|requires? (?:an? )?(?:active )?(?:base|existing) (?:plan|subscription)/i.test(context)||monetary(description).length)continue;
      // Closed grammar: a selectable named monthly offer, optionally an explicit
      // trial -> Then transition. No annual arithmetic or inferred currency.
      const transition=/^(\d+[- ](?:day|month)s? trial for [A-Z]{3}\s+[\d.,]+)\s*[•·]\s*Then\s+(.+)$/i.exec(subtitle);
      const regular=transition?transition[2]:subtitle;if(!/^[A-Z]{3}\s+[\d.,]+\s*\/\s*month$/.test(regular))continue;
      const price=monetary(regular);if(price.length!==1||!/^[A-Z]{3}$/.test(price[0].currencyRaw)||!(Number(price[0].amount)>0))continue;
      const trial=transition?monetary(transition[1]):[];if(transition&&(trial.length!==1||trial[0].currencyRaw!==price[0].currencyRaw))continue;
      if(Object.keys(item).some(k=>/salePrice|originalPrice|oldPrice|crossed|currency|amount|price$|billingPeriod/i.test(k)))continue;
      const itemPath=p+'/optionItems/'+i+'/'+wrapper.key,plan=group+' '+name,proof={bodyHash,relationship:'PAGE_LINKED_SELECTABLE_GROUP_ITEM_TEXT_RUNS',scriptPath,scriptSpan:[script.openEnd,script.end],objectPath:itemPath,groupPath:p+'/title/runs/0/text',namePath:itemPath+'/title/runs/0/text',pricePath:itemPath+'/subtitle/runs',rawSubtitle:item.subtitle,rawDescription:item.description??null,documentPath:pathOf(links[0])+'/@href',metadataPath,documentURL,selectionPath:anc.findLast(a=>Array.isArray(a.value.steps))?.path};
      for(const [role,m]of [...trial.map(m=>['TRIAL',m]),['POST_INTRO_REGULAR',price[0]]]){if(found.length>=bounds.bindings)throw Error('NESTED_OPTION_BOUND');const matches=item.subtitle.runs.map((r,index)=>({index,values:monetary(norm(r.text))})).filter(r=>r.values.some(v=>v.amount===m.amount&&v.currencyRaw===m.currencyRaw));const pricePath=itemPath+'/subtitle/runs'+(matches.length===1?'/'+matches[0].index+'/text':'');found.push({name:plan,monetary:m,local:role==='TRIAL'?transition[1]:(transition?'Then ':'')+regular,role:role==='POST_INTRO_REGULAR'&&!transition?'REGULAR_BASE':role,path:pricePath,proof:{...proof,monetaryPath:pricePath,explicitPriceRole:role==='POST_INTRO_REGULAR'&&!transition?'REGULAR_BASE':role},materialization:{version:1,kind:'PAGE_LINKED_OPTION_RENDERER',bodyHash,documentURL,offerURL:metadata.value.urlCanonical,pageBound:true,documentPath:proof.documentPath,offerURLPath:metadataPath,relationship:proof.relationship}});}
     }
    }
   }
   for(const[k,x]of Object.entries(v))walk(x,p+'/'+k.replaceAll('~','~0').replaceAll('/','~1'),[...anc,{path:p,value:v}],depth+1);
  }
  walk(root,payloadPath);
 }}catch(e){return {bindings:[],diagnostics:[e.message]};}
 const conflicts=new Set(found.filter(a=>a.role!=='TRIAL'&&found.some(b=>b.role!=='TRIAL'&&b.name===a.name&&(b.monetary.amount!==a.monetary.amount||b.monetary.currencyRaw!==a.monetary.currencyRaw))).map(a=>a.name));
 return {bindings:found.filter(b=>!conflicts.has(b.name)),diagnostics:[...conflicts].map(n=>'CONFLICTING_NESTED_PLAN:'+n)};
}
