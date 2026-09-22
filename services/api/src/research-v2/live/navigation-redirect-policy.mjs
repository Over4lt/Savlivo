// Early routing guard only. Never grants authority or replaces per-hop transport checks.
export function unreviewedRedirectParameter(url,reviewedOrigins=[]){
 let source;try{source=new URL(url);}catch{return true;}
 for(const [key,raw] of source.searchParams){
 if(!/(?:^|[._-])(?:url|target|next|nextpage|continue|redirect|redirect_uri|return|return_to|returnurl)$/i.test(key))continue;
 let value=raw;for(let i=0;i<2;i++){try{const decoded=decodeURIComponent(value);if(decoded===value)break;value=decoded;}catch{return true;}}
 value=value.trim();if(!/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value))continue;
 let target;try{target=new URL(value,source);}catch{return true;}
 if(target.protocol!=='https:'||target.username||target.password||target.port||![source.origin,...reviewedOrigins].includes(target.origin))return true;
 }
 return false;
}
