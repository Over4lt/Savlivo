// Keep a combined-service presentation separate from the target service's
// standalone subscription, regardless of whether it came from HTML or data.
export function bundledPresentation(name,serviceName){
 if(typeof name!=='string')return false;
 if(/\bbundle\b/iu.test(name)&&!/\bbundle\b/iu.test(serviceName??''))return true;
 if(typeof serviceName!=='string'||!serviceName)return false;
 const escaped=serviceName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return new RegExp('(?:^|[^\\p{L}\\p{N}])'+escaped+'(?=$|[^\\p{L}\\p{N}])','iu').test(name)&&/\s\+\s/u.test(name);
}

// Ancillary charges can recur monthly but do not buy the base standalone
// subscription. Apply this to both row labels and enclosing price sections.
export function nonStandalonePresentation(name,serviceName){
 return bundledPresentation(name,serviceName)||typeof name==='string'&&/\b(?:extra\s+members?|add[- ]ons?|upgrades?)\b/iu.test(name);
}
