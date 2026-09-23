// Evidence of presentation, never authority, purchase completion or global availability.
export const presentationVersion='OFFER_PRESENTATION_V1';
const pathOf=n=>n.parent?pathOf(n.parent)+'/'+n.tag+'['+n.index+']':'$';
const hidden=n=>{for(let p=n;p;p=p.parent)if(Object.keys(p.attrs??{}).some(k=>/^on/i.test(k))||Object.hasOwn(p.attrs??{},'hidden')||p.attrs?.['aria-hidden']==='true'||p.attrs?.disabled!==undefined||p.attrs?.inert!==undefined||p.attrs?.['aria-disabled']==='true'||/display\s*:\s*none|visibility\s*:\s*hidden/i.test(p.attrs?.style??''))return true;return false;};
// A same-card form explicitly submits this exact plan ID. Merely naming a
// collection "offers", or placing a generic CTA near it, is insufficient.
export function presentedPlanAction(tree,card,id){
 if(/\b(?:credit|benefit|gift|tax|fee|deposit|saving|discount|trial|intro|per seat|per user)\b/i.test(card.text))return null;
 if(tree.nodes.length>100000||String(id).length>200)return null;
 const inside=n=>n.start>=card.start&&n.end<=card.end;
 const forms=tree.nodes.filter(n=>n.tag==='form'&&inside(n)&&!hidden(n));
 if(forms.length>16)return null;
 const matches=[];
 for(const form of forms){
  if(form.attrs.method&&!['get','post'].includes(form.attrs.method.toLowerCase())||form.attrs.id&&tree.nodes.some(n=>n.attrs?.form===form.attrs.id))continue;
  const nodes=tree.nodes.filter(n=>n.start>=form.start&&n.end<=form.end);
  if(nodes.length>256)continue;
  const inputs=nodes.filter(n=>n.tag==='input'&&['sku','planId','productId'].includes(n.attrs?.name));
  if(inputs.length!==1||inputs[0].attrs.type!=='hidden'||nodes.some(n=>['input','select','textarea'].includes(n.tag)&&n!==inputs[0])||inputs[0].attrs.value!==String(id)||inputs[0].attrs.disabled!==undefined)continue;
  const action=form.attrs?.action;
  if(!action||!(/^(?:https:\/\/|\/(?!\/))/.test(action))||/[\\\s]/.test(action))continue;
  const buttons=nodes.filter(n=>n.tag==='button'&&(!n.attrs.type||n.attrs.type==='submit')&&!hidden(n)&&/^(?:buy|subscribe|purchase|select plan|choose plan)(?: now)?$/i.test(n.text.trim()));
  if(buttons.length!==1||buttons.some(n=>n.attrs.name!==undefined||n.attrs.value!==undefined)||nodes.some(n=>['formaction','form','formmethod'].some(k=>Object.hasOwn(n.attrs??{},k)))||nodes.some(n=>Object.keys(n.attrs??{}).some(k=>/^on/i.test(k))))continue;
  matches.push({relationship:'EXACT_PLAN_FORM_SUBMISSION',surfacePath:pathOf(card),formPath:pathOf(form),actionPath:pathOf(form)+'/@action',action,identityPath:pathOf(inputs[0])+'/@value',actionLabelPath:pathOf(buttons[0]),span:[form.start,form.end]});
 }
 return matches.length===1?matches[0]:null;
}
export function presentationProof(binding){
 const p=binding.proof;
 const sku=p.relationship==='PAGE_PRODUCT_PREFERRED_SKU_RECURRING_AVAILABILITY';
 if(!sku&&!p.presentationAction)return null;
 return {version:presentationVersion,status:'ESTABLISHED',meaning:'OFFER_PRESENTED_FOR_SELECTION_OR_PURCHASE_IN_OBSERVED_CONTEXT',bodyHash:p.bodyHash,rule:sku?p.relationship:'RENDERED_PLAN_PRICE_AND_EXACT_FORM',productId:p.productId??p.planId,skuId:p.skuId??null,plan:binding.name,amount:binding.value??binding.monetary?.amount,currency:binding.currency??binding.monetary?.currencyRaw,moneyRole:p.explicitPriceRole??'REGULAR_BASE',identityPath:p.namePath??binding.namePath,pricePath:p.pricePath??p.amountPath,currencyPath:p.currencyPath,cadencePath:p.cadencePath??p.periodPath,surfacePath:p.headingPath??p.cardPath,purchase:p.presentationAction??{relationship:p.relationship,availabilityPath:p.availabilityPath,availabilityId:p.availabilityId,actions:['Purchase'],eligibility:'None',trial:false},sourceSpan:p.cardSpan??null,authorityGranted:false,purchaseCompleted:false,globalAvailability:false};
}
