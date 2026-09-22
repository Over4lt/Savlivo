// Pure offline market interpretation, isolated because the existing parser installs its offline guard.
import fs from 'node:fs';
import path from 'node:path';
import {inspectProviderMarket} from '../offline-recovery/provider-market.mjs';
import {createHash} from 'node:crypto';
const directory=path.resolve(process.argv[2]),pages=JSON.parse(fs.readFileSync(directory+'/pages.json'));
const facts=[];
for(const p of pages){if(!p.bodyFile)continue;if(!/^bodies\/[a-f0-9]{64}\.txt$/.test(p.bodyFile))throw Error('UNSAFE_BODY_PATH');
 const body=fs.readFileSync(directory+'/'+p.bodyFile,'utf8');if(createHash('sha256').update(body).digest('hex')!==p.bodyHash)throw Error('BODY_HASH_MISMATCH');
 facts.push({url:p.url,bodyHash:p.bodyHash,authorityEstablished:p.authority?.status==='CONFIGURED_REVIEWED',result:inspectProviderMarket(body,{bodyHash:p.bodyHash,sourceOccurrences:[{id:p.bodyHash,url:p.url}]})});
}
fs.writeFileSync(directory+'/market-analysis.json',JSON.stringify(facts,null,2)+'\n');
