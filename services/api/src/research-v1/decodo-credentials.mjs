// Pure credential contract. No environment reads, Keychain, network or logging.
export const credentialNames=Object.freeze(['DECODO_USERNAME','DECODO_PASSWORD']);
export const legacyCredentialNames=Object.freeze(['SAVLIVO_DECODO_USERNAME','SAVLIVO_DECODO_PASSWORD']);
export function resolveDecodoCredentials(env={}){
 const canonical=credentialNames.some(k=>Object.hasOwn(env,k)),legacy=legacyCredentialNames.some(k=>Object.hasOwn(env,k));
 const names=canonical?credentialNames:legacyCredentialNames;
 const username=Object.hasOwn(env,names[0])&&typeof env[names[0]]==='string'?env[names[0]]:'',password=Object.hasOwn(env,names[1])&&typeof env[names[1]]==='string'?env[names[1]]:'';
 const configured=!!username.trim()&&!!password.trim()&&username.length<=1024&&password.length<=4096&&!/[\r\n:]/.test(username)&&!/[\r\n]/.test(password);
 // Safe to serialize the resolution metadata; the selected values stay private.
 return Object.freeze(Object.defineProperties({configured,source:canonical?'CANONICAL':legacy?'LEGACY':'ABSENT'}, {
  username:{value:username,enumerable:false},password:{value:password,enumerable:false}
 }));
}
