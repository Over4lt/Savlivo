// Research permissions, not evidence or market proof. No registrable-domain guessing.
export function validateNamespaces(objective) {
    const scopes=objective.providerNamespaces??[];
    if(!Array.isArray(scopes)||scopes.length>16)throw Error('INVALID_PROVIDER_NAMESPACE');
    for(const s of scopes) {
        let u;try{u=new URL('https://'+s.domain+'/');}catch{throw Error('INVALID_PROVIDER_NAMESPACE');}
        if(s.reviewed!==true||s.scope!=='OWNED_DNS_NAMESPACE'||typeof s.reference!=='string'||!s.reference.trim()||s.reference.length>256||u.hostname!==s.domain||u.host!==s.domain||u.pathname!=='/'||!s.domain.includes('.')||!objective.providerHosts.some(h=>h===s.domain||h.endsWith('.'+s.domain)))throw Error('INVALID_PROVIDER_NAMESPACE');
    }
}
export function navigationOwned(objective,url) {
    let h;try{h=new URL(url).hostname;}catch{return false;}
    return objective.providerHosts.includes(h)||(objective.providerNamespaces??[]).some(s=>s.reviewed===true&&s.scope==='OWNED_DNS_NAMESPACE'&&(h===s.domain||h.endsWith('.'+s.domain)));
}
// Exact-host permission to investigate a lead; it never grants provider authority.
export function candidateRouted(objective,url) {
    let u;try{u=new URL(url);}catch{return false;}
    return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(objective.candidateHosts??[]).includes(u.hostname);
}
export const researchRouted=(objective,url)=>navigationOwned(objective,url)||candidateRouted(objective,url);
export function authorityBinding(objective,url) {
    const host=new URL(url).hostname;
    if(objective.providerHosts.includes(host))return {host,kind:'REVIEWED_HOST'};
    const s=(objective.providerNamespaces??[]).find(s=>s.reviewed===true&&s.scope==='OWNED_DNS_NAMESPACE'&&(host===s.domain||host.endsWith('.'+s.domain)));
    return s?{host,kind:'REVIEWED_NAMESPACE',domain:s.domain,reference:s.reference}:null;
}

export function navigationParametersSafe(url) {
    try {return ![...new URL(url).searchParams.keys()].some(k=>/^(?:access_token|api[_-]?key|password|authorization|secret|session_token)$/i.test(k));}
    catch {return false;}
}
