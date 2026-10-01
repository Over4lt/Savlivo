// Complete bounded wire representation -> complete bounded decoded source.
import {createGunzip,createBrotliDecompress,createInflate} from 'node:zlib';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {fault,acquisitionCapacity} from './acquisition-contract.mjs';
export async function decodeResponse(response,{maxDecodedBytes=acquisitionCapacity.decodedResponseBytes,maxObservationBytes=acquisitionCapacity.observationBytes,signal,onDecodedBytes=()=>{},onPhase=()=>{}}={}) {
 if(!Buffer.isBuffer(response.body))throw fault('INCOMPLETE_RESPONSE');
 const headers=response.headers??{},encoding=String(headers['content-encoding']??'identity').trim().toLowerCase();
 const factories={gzip:createGunzip,'x-gzip':createGunzip,br:createBrotliDecompress,deflate:createInflate};
 if(encoding!=='identity'&&!factories[encoding])throw fault('UNSUPPORTED_ENCODING');
 onPhase('DECOMPRESS');let decoded=0,buffer=response.body;
 if(encoding==='identity'){
  if(buffer.length>maxDecodedBytes)throw fault('DECODED_BYTE_BOUND','CAPACITY');
  decoded=buffer.length;onDecodedBytes(decoded);
 }else {
  const input=Readable.from((function*(){for(let p=0;p<buffer.length;p+=16384)yield buffer.subarray(p,p+16384);})()),decoder=factories[encoding]({chunkSize:16384}),chunks=[];
  const abort=()=>{input.destroy();decoder.destroy(fault('ABORTED'));};
  signal?.addEventListener('abort',abort,{once:true});
  try{
   if(signal?.aborted)throw fault('ABORTED');
   input.pipe(decoder);
   for await(const chunk of decoder){decoded+=chunk.length;onDecodedBytes(chunk.length);if(decoded>maxDecodedBytes)throw fault('DECOMPRESSION_BOUND','CAPACITY');chunks.push(chunk);}
   buffer=Buffer.concat(chunks,decoded);
  }catch(e){if(e.code==='ABORTED'||e.kind==='CAPACITY')throw e;throw fault('DECOMPRESSION_FAILED');}
  finally{signal?.removeEventListener('abort',abort);input.destroy();decoder.destroy();}
 }
 onPhase('DECODE');
 let charset=String(headers['content-type']??'').match(/charset\s*=\s*["']?([a-zA-Z0-9._-]{1,80})/i)?.[1];
 if(!charset&&buffer[0]===0xff&&buffer[1]===0xfe)charset='utf-16le';
 if(!charset&&buffer[0]===0xfe&&buffer[1]===0xff)charset='utf-16be';
 if(!charset&&/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(headers['content-type']??'')) {
  const head=buffer.subarray(0,4096).toString('latin1');
  charset=head.match(/<meta\b[^>]*\bcharset\s*=\s*["']?([a-zA-Z0-9._-]{1,80})/i)?.[1];
 }
 let text;try{text=new TextDecoder(charset??'utf-8',{fatal:true}).decode(buffer);}catch{throw fault('UNSUPPORTED_OR_INVALID_CHARSET');}
 const observationBytes=Buffer.byteLength(text);
 if(observationBytes>maxObservationBytes)throw fault('OBSERVATION_BYTE_BOUND','CAPACITY');
 if(signal?.aborted)throw fault('ABORTED');
 return {text,wireBytes:response.body.length,wireSha256:createHash('sha256').update(response.body).digest('hex'),decodedBytes:decoded,observationBytes,charset:charset??'utf-8',encoding};
}
