// Bounded binary resource primitives. No pricing, model, or runtime dependency.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {providerPriceStructure} from './provider-price-structure.mjs';
export const imageResourceVersion='OFFICIAL_IMAGE_RESOURCE_V1';
export const imageLimits=Object.freeze({count:3,bytes:1000000,totalBytes:2000000,pixels:4000000});
export const imageHash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
export function imageDimensions(b,type){
 assert(Buffer.isBuffer(b)&&b.length>=24&&b.length<=imageLimits.bytes,'IMAGE_BYTE_BOUND');let w,h;
 if(type==='image/png'){assert(b.subarray(0,8).toString('hex')==='89504e470d0a1a0a'&&b.subarray(12,16).toString()==='IHDR');assert(!b.includes(Buffer.from('acTL')),'ANIMATED_IMAGE_UNSUPPORTED');w=b.readUInt32BE(16);h=b.readUInt32BE(20);}
 else if(type==='image/jpeg'){assert(b[0]===255&&b[1]===216);for(let i=2;i+9<b.length;){assert(b[i]===255);const m=b[i+1];if(m===217||m===218)break;const n=b.readUInt16BE(i+2);assert(n>=2&&i+2+n<=b.length);if([192,193,194].includes(m)){h=b.readUInt16BE(i+5);w=b.readUInt16BE(i+7);break;}i+=n+2;}}
 else if(type==='image/webp'){assert(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP');const kind=b.toString('ascii',12,16);if(kind==='VP8X'){assert(b.length>=30&&!(b[20]&2),'ANIMATED_IMAGE_UNSUPPORTED');w=1+b.readUIntLE(24,3);h=1+b.readUIntLE(27,3);}else if(kind==='VP8L'){assert(b[20]===47&&b.length>=25);const n=b.readUInt32LE(21);w=(n&16383)+1;h=((n>>>14)&16383)+1;}else if(kind==='VP8 '){assert(b.length>=30&&b.subarray(23,26).toString('hex')==='9d012a');w=b.readUInt16LE(26)&16383;h=b.readUInt16LE(28)&16383;}}
 assert(w>0&&h>0&&w*h<=imageLimits.pixels,'IMAGE_DIMENSION_BOUND');return {width:w,height:h};
}
export function associatedImages(page,authorities){
 const raw=page.rawSource?.text??'';assert(raw.length<=8000000);const out=[];
 const structure=providerPriceStructure(raw);
 for(const n of structure.nodes){if(n.tag!=='img'||n.hidden)continue;
  let excluded=false;for(let parent=n.parent;parent;parent=parent.parent)if(['header','nav','footer'].includes(parent.tag))excluded=true;if(excluded)continue;
  const a=n.attrs;if(!a.src)continue;let u;try{u=new URL(a.src,page.url);}catch{continue;}
  if(/\.(?:svg|gif|ico)(?:$)/i.test(u.pathname))continue;
  if(u.protocol!=='https:'||u.username||u.password||u.port||!authorities.some(v=>v.hostname===u.hostname&&v.provider===page.authority?.provider&&v.sourceType==='OFFICIAL_PROVIDER'))continue;
  if(out.some(v=>v.url===u.href))continue;const fragment=raw.slice(n.start,n.openEnd);out.push({url:u.href,offset:n.start,length:fragment.length,sha256:imageHash(fragment),parentHash:page.sourceIntegrity.sha256});if(out.length===imageLimits.count)break;
 }return out;
}
