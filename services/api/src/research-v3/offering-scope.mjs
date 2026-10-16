// Keep a combined-service presentation separate from the target service's
// standalone subscription, regardless of whether it came from HTML or data.
export function bundledPresentation(name,serviceName){
 if(typeof name!=='string')return false;
 if(/\bbundle\b/iu.test(name)&&!/\bbundle\b/iu.test(serviceName??''))return true;
 if(typeof serviceName!=='string'||!serviceName)return false;
 const escaped=serviceName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 return new RegExp('(?:^|[^\\p{L}\\p{N}])'+escaped+'(?=$|[^\\p{L}\\p{N}])','iu').test(name)&&/\s\+\s/u.test(name);
}
