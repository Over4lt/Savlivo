import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
export const geminiKeychainService='GEMINI_API_KEY';
export const geminiKeychainAccount='GEMINI_API_KEY';

export async function readGeminiKeychain(){
  if(process.platform!=='darwin')return null;
  try{
    const {stdout}=await execute('/usr/bin/security',['find-generic-password','-s',geminiKeychainService,'-a',geminiKeychainAccount,'-w'],{encoding:'utf8',timeout:15_000,maxBuffer:8192});
    const value=stdout.replace(/\r?\n$/,'');return value&&value.length<=8192&&!/[\r\n]/.test(value)?value:null;
  }catch{return null;}
}

export async function geminiChildEnvironment(base=process.env,readKeychain=readGeminiKeychain){
  const env={...base};
  if(!env.GEMINI_API_KEY){const key=await readKeychain();if(key)env.GEMINI_API_KEY=key;}
  return env;
}
