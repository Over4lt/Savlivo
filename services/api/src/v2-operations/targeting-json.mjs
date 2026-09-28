// Read-only JSON projection for targeting. Validate every token and hash every byte,
// but never construct skipped evidence/checkpoint subtrees.
import fs from 'node:fs';
import {StringDecoder} from 'node:string_decoder';
import {createHash} from 'node:crypto';
import {statFile} from '../research-v2/storage/core.mjs';

export const lengthOnly=Symbol('lengthOnly');
export function targetingJson(file,selection){
 const before=statFile(file),fd=fs.openSync(file,'r'),buffer=Buffer.allocUnsafe(65536),decoder=new StringDecoder('utf8'),hash=createHash('sha256');
 let text='',offset=0,ended=false;
 const invalid=()=>{throw Error('TARGETING_INVALID_JSON');};
 const peek=()=>{
  while(offset===text.length&&!ended){const n=fs.readSync(fd,buffer,0,buffer.length,null);offset=0;if(n){hash.update(buffer.subarray(0,n));text=decoder.write(buffer.subarray(0,n));}else{ended=true;text=decoder.end();}}
  return text[offset]??'';
 };
 const take=()=>{const c=peek();if(c)offset++;return c;};
 const expect=c=>{if(take()!==c)invalid();};
 const ws=()=>{while([' ','\t','\r','\n'].includes(peek()))offset++;};
 function string(keep){
  expect('"');let result='',length=0;
  for(;;){const c=take();if(!c||c.charCodeAt(0)<32)invalid();if(c==='"')break;
   if(c==='\\'){const e=take();if(e==='u'){let hex='';for(let i=0;i<4;i++){const h=take();if(!/^[0-9a-f]$/i.test(h))invalid();hex+=h;}if(keep===true)result+=String.fromCharCode(parseInt(hex,16));}
    else {const escapes={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'};if(!Object.hasOwn(escapes,e))invalid();if(keep===true)result+=escapes[e];}
   }else if(keep===true)result+=c;
   length++;
  }
  return keep===lengthOnly?{length}:result;
 }
 function number(keep){
  let token='';const eat=()=>{const c=take();if(keep)token+=c;};const digit=()=>/^[0-9]$/.test(peek());
  if(peek()==='-')eat();
  if(peek()==='0')eat();else {if(!/^[1-9]$/.test(peek()))invalid();while(digit())eat();}
  if(peek()==='.'){eat();if(!digit())invalid();while(digit())eat();}
  if(peek()==='e'||peek()==='E'){eat();if(peek()==='+'||peek()==='-')eat();if(!digit())invalid();while(digit())eat();}
  return keep?Number(token):undefined;
 }
 const child=(spec,key)=>spec===true?true:spec===lengthOnly?(key==='length'?true:null):spec&&Object.hasOwn(spec,key)?spec[key]:spec?.['*']??null;
 function value(spec){
  ws();const c=peek();
  if(c==='"')return string(spec===true?true:spec===lengthOnly?lengthOnly:false);
  if(c==='{'){
   take();const result=spec?{}:undefined;ws();if(peek()==='}'){take();return result;}
   for(;;){ws();const key=string(!!spec);ws();expect(':');const keep=child(spec,key),v=value(keep);
    // defineProperty preserves JSON.parse's own __proto__ and last-key-wins behavior.
    if(keep)Object.defineProperty(result,key,{value:v,writable:true,enumerable:true,configurable:true});
    ws();const end=take();if(end==='}')return result;if(end!==',')invalid();
   }
  }
  if(c==='['){
   take();const result=spec&&spec!==lengthOnly?[]:undefined;let count=0;ws();if(peek()===']'){take();return spec===lengthOnly?{length:0}:result;}
   for(;;){const v=value(spec===lengthOnly?null:child(spec,String(count)));if(result)result.push(v);count++;ws();const end=take();if(end===']')return spec===lengthOnly?{length:count}:result;if(end!==',')invalid();}
  }
  for(const [literal,v]of [['true',true],['false',false],['null',null]])if(c===literal[0]){for(const ch of literal)expect(ch);return spec?v:undefined;}
  return number(!!spec);
 }
 try{const projected=value(selection);ws();if(peek())invalid();if(before.identity!==statFile(file).identity)throw Error('STORAGE_PUBLICATION_RACE');return {value:projected,sha256:hash.digest('hex')};}
 finally{fs.closeSync(fd);}
}
