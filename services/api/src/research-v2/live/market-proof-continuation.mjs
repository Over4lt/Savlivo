import fs from 'node:fs';
// Planning only. Sources carried to the next interpreter are re-opened there;
// this controller cannot establish market applicability or pricing eligibility.
export const pendingMarketProof=t=>(t.marketProof?.objectives??[]).filter(o=>o.status==='MARKET_NOT_VERIFIED');
export const marketProofContradicted=t=>!!t.marketProof?.objectives?.length&&!pendingMarketProof(t).length&&t.marketProof.objectives.every(o=>o.status==='MARKET_CONTRADICTED');
export function acceptMarketResearch(t,outcome,add){
 const dir=outcome?.runDirectory;if(!dir||!fs.existsSync(dir))return;
 const latest=fs.readdirSync(dir).filter(n=>/^interpretation-\d+$/.test(n)).sort().at(-1),file=latest&&dir+'/'+latest+'/market-proof-research.json';
 if(!file||!fs.existsSync(file)||fs.statSync(file).size>2097152)return;
 const next=JSON.parse(fs.readFileSync(file)).targets?.[t.id];if(!next||next.version!==1||next.sources?.length>8||next.objectives?.length>16||next.leads?.length>16)return;
 // A failed/empty interpretation cannot erase an existing unresolved objective.
 if(!next.objectives?.length)return;
 t.marketProof=next;
 for(const l of next.leads??[])add({...l,title:l.label,rank:0,marketProofHint:true,from:{sourceHash:l.sourceHash,path:l.path},navigationOnly:true});
}
