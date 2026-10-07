// Inert, source-visible schema records only. Never execute script or infer
// semantic propositions from keys. Original escaped bytes remain the citations.
export const structuredMaterialCapacity=Object.freeze({scripts:32,scriptBytes:262144,records:256,recordBytes:4096,tokens:131072});
export function structuredMaterial(body){
 const regions=[];let limited=false,scripts=0,tokens=0;
 for(const script of body.matchAll(/<script\b[^>]*>([^]*?)<\/script\s*>/gi)){
  const raw=script[1],base=script.index+script[0].indexOf('>')+1;
  if(!raw.includes('@type'))continue;
  if(++scripts>structuredMaterialCapacity.scripts){limited=true;break;}
  if(Buffer.byteLength(raw)>structuredMaterialCapacity.scriptBytes){limited=true;continue;}
  // Both ordinary JSON and JSON strings in inert transport scripts can expose
  // schema records. Braces are only located here; JSON.parse validates each.
  const stack=[];
  for(let i=0;i<raw.length;i++){
   if(++tokens>structuredMaterialCapacity.tokens){limited=true;break;}
   if(raw[i]==='{')stack.push(i);
   if(raw[i]!=='}'||!stack.length)continue;
   const start=stack.pop(),slice=raw.slice(start,i+1);if(Buffer.byteLength(slice)>structuredMaterialCapacity.recordBytes)continue;
   let value;try{value=JSON.parse(slice);}catch{try{value=JSON.parse(JSON.parse('"'+slice+'"'));}catch{continue;}}
   const types=Array.isArray(value?.['@type'])?value['@type']:[value?.['@type']];
   const type=types.find(t=>['Product','Service','Offer','AggregateOffer','UnitPriceSpecification'].includes(t));if(!type)continue;
   regions.push({start:base+start,end:base+i+1,type});if(regions.length>=structuredMaterialCapacity.records){limited=true;break;}
  }
  if(regions.length>=structuredMaterialCapacity.records||tokens>structuredMaterialCapacity.tokens)break;
 }
 // A complete bounded parent preserves price/benefit/billing relationships.
 // No overlapping duplicate segments or reconstructed strings are introduced.
 const selected=regions.sort((a,b)=>(b.end-b.start)-(a.end-a.start)).filter((r,i,all)=>!all.slice(0,i).some(p=>r.start>=p.start&&r.end<=p.end));
 return {regions:selected.sort((a,b)=>a.start-b.start),limited};
}
