import fs from 'node:fs';
import path from 'node:path';

export function writeProviderPriceIntelligence(output,document){
 fs.writeFileSync(path.join(output,'provider-price-intelligence.json'),JSON.stringify(document)+'\n',{flag:'wx'});
}
