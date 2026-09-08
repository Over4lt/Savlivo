// Synthetic authenticator for deterministic tests only. Never used by the HTTP implementation.
import {createHash,generateKeyPairSync,randomBytes,sign} from "node:crypto";
import {isoCBOR} from "@simplewebauthn/server/helpers";
import type {RegistrationResponseJSON,AuthenticationResponseJSON} from "@simplewebauthn/server";
const digest=(value:string|Buffer)=>createHash("sha256").update(value).digest();
export function authenticator(algorithm:"EC"|"RSA"="EC") {
  const keys=algorithm==="EC"?generateKeyPairSync("ec",{namedCurve:"prime256v1"}):generateKeyPairSync("rsa",{modulusLength:2048});
  const jwk=keys.publicKey.export({format:"jwk"});
  const key=isoCBOR.encode(algorithm==="RSA"?new Map<any,any>([[1,3],[3,-257],[-1,new Uint8Array(Buffer.from(jwk.n!,"base64url"))],[-2,new Uint8Array(Buffer.from(jwk.e!,"base64url"))]]):new Map<any,any>([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x!,"base64url"))],[-3,new Uint8Array(Buffer.from(jwk.y!,"base64url"))]]));
  const id=randomBytes(32), credentialId=id.toString("base64url");
  function authData(rp:string,counter:number,flags:number) {const count=Buffer.alloc(4);count.writeUInt32BE(counter);return Buffer.concat([digest(rp),Buffer.from([flags]),count]);}
  function clientData(type:string,challenge:string,origin:string,crossOrigin=false) {return Buffer.from(JSON.stringify({type,challenge,origin,crossOrigin}));}
  return {id:credentialId,publicKey:Buffer.from(key),
    register(challenge:string,origin:string,rp:string,flags=0x45):RegistrationResponseJSON {
      const size=Buffer.alloc(2);size.writeUInt16BE(id.length);
      const data=Buffer.concat([authData(rp,0,flags),Buffer.alloc(16),size,id,Buffer.from(key)]);
      const attestation=isoCBOR.encode(new Map<any,any>([["fmt","none"],["attStmt",new Map()],["authData",new Uint8Array(data)]]));
      return {id:credentialId,rawId:credentialId,type:"public-key",clientExtensionResults:{},response:{
        clientDataJSON:clientData("webauthn.create",challenge,origin).toString("base64url"),attestationObject:Buffer.from(attestation).toString("base64url")}};
    },
    assert(challenge:string,origin:string,rp:string,userHandle:string,counter=1,flags=5,crossOrigin=false):AuthenticationResponseJSON {
      const data=authData(rp,counter,flags),json=clientData("webauthn.get",challenge,origin,crossOrigin);
      return {id:credentialId,rawId:credentialId,type:"public-key",clientExtensionResults:{},response:{authenticatorData:data.toString("base64url"),clientDataJSON:json.toString("base64url"),userHandle,
        signature:sign("sha256",Buffer.concat([data,digest(json)]),keys.privateKey).toString("base64url")}};
    }};
}
