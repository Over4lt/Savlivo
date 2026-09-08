import {createHash, randomBytes} from "node:crypto";
import type {RegistrationResponseJSON, AuthenticationResponseJSON} from "@simplewebauthn/server";
import {privateDataPool as pool} from "./private-data-db.js";
import type {PoolClient} from "pg";
export type PasskeyConfig = {days:number; origin:string; rpID:string};
export const hashSession = (token:string) => createHash("sha256").update(token).digest("hex");
const deny = ():never => {throw new Error("PASSKEY_DENIED");};
function tokenHash(authorization:string|undefined) {
  return authorization && /^Bearer adm_[A-Za-z0-9_-]{43}$/.test(authorization) ? hashSession(authorization.slice(7)) : null;
}
export async function authenticatedAdmin(authorization:string|undefined):Promise<string|null> {
  const hash=tokenHash(authorization);if(!hash)return null;
  const result=await pool.query(`SELECT s.user_id FROM admin_sessions s
    JOIN admin_roles r ON r.user_id=s.user_id JOIN users u ON u.id=s.user_id
    JOIN admin_passkeys p ON p.id=s.credential_id AND p.user_id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND NOT s.enrollment_only
      AND r.role='analytics_reader' AND u.deletion_scheduled_for IS NULL AND p.rp_id=$2`,[hash,process.env.ADMIN_RP_ID]);
  return result.rows[0]?.user_id ?? null;
}
async function transaction<T>(work:(client:PoolClient)=>Promise<T>):Promise<T> {
  const client=await pool.connect();try {await client.query("BEGIN");const value=await work(client);await client.query("COMMIT");return value;}
  catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
async function owner(client:PoolClient,id:string) {
  const result=await client.query(`SELECT r.webauthn_user_id,r.enrollment_version FROM admin_roles r JOIN users u ON u.id=r.user_id
    WHERE r.user_id=$1 AND r.role='analytics_reader' AND u.deletion_scheduled_for IS NULL FOR UPDATE OF r,u`,[id]);
  return result.rows[0] ?? deny();
}
async function audit(client:PoolClient,userId:string,action:string,days:number) {
  await client.query("INSERT INTO admin_audit(user_id,action,expires_at) VALUES($1,$2,now()+$3*interval '1 day')",[userId,action,days]);
}
// Only an operator invokes this from the CLI. It does not grant a role or a dashboard session.
export async function issueEnrollmentGrant(userId:string,config:PasskeyConfig) {
  return transaction(async client=>{
    await owner(client,userId);
    await client.query("UPDATE admin_roles SET enrollment_version=gen_random_uuid() WHERE user_id=$1",[userId]);
    await client.query("DELETE FROM admin_passkey_challenges WHERE user_id=$1",[userId]);
    await client.query("DELETE FROM admin_sessions WHERE user_id=$1 AND enrollment_only",[userId]);
    const token=`adm_${randomBytes(32).toString("base64url")}`;
    await client.query("INSERT INTO admin_sessions(token_hash,user_id,expires_at,enrollment_only,enrollment_origin) VALUES($1,$2,now()+interval '5 minutes',true,$3)",[hashSession(token),userId,config.origin]);
    await audit(client,userId,"bootstrap_issued",config.days);return token;
  });
}
async function challenge(purpose:string,config:PasskeyConfig,value:string,userId:string|null=null,sessionHash:string|null=null) {
  const result=await pool.query(`INSERT INTO admin_passkey_challenges(challenge,purpose,user_id,authorizing_session_hash,rp_id,origin,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,now()+interval '5 minutes') RETURNING id`,[value,purpose,userId,sessionHash,config.rpID,config.origin]);
  return result.rows[0].id as string;
}
async function consume(id:string,purpose:string,config:PasskeyConfig) {
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return deny();
  // Autocommitted deletion: failed verification must not roll back single-use consumption.
  const result=await pool.query(`DELETE FROM admin_passkey_challenges WHERE id=$1 RETURNING *,expires_at>now() AS fresh`,[id]);
  const row=result.rows[0];
  if(!row || !row.fresh || row.purpose!==purpose || row.rp_id!==config.rpID || row.origin!==config.origin)return deny();
  return row;
}
export async function beginRegistration(authorization:string|undefined,config:PasskeyConfig) {
  const hash=tokenHash(authorization);if(!hash)return deny();
  const {generateRegistrationOptions}=await import("@simplewebauthn/server");
  return transaction(async client=>{
    const initial=await client.query("SELECT user_id FROM admin_sessions WHERE token_hash=$1",[hash]);
    if(!initial.rows[0])return deny();
    const user=await owner(client,initial.rows[0].user_id);
    const result=await client.query(`SELECT s.* FROM admin_sessions s
      LEFT JOIN admin_passkeys p ON p.id=s.credential_id AND p.user_id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now()
      AND ((s.enrollment_only AND s.credential_id IS NULL AND s.enrollment_origin=$3)
        OR (NOT s.enrollment_only AND p.rp_id=$2)) FOR UPDATE OF s`,[hash,config.rpID,config.origin]);
    const grant=result.rows[0] ?? deny();
    const existing=await client.query("SELECT id FROM admin_passkeys WHERE user_id=$1 AND rp_id=$2 ORDER BY id LIMIT 20",[grant.user_id,config.rpID]);
    if(existing.rows.length>=20)deny(); // Bound enrollment options; operator can remove obsolete credentials.
    const options=await generateRegistrationOptions({excludeCredentials:existing.rows.map(row=>({id:row.id})),rpName:"Savlivo Admin",rpID:config.rpID,
      userName:"Savlivo Admin",userDisplayName:"Savlivo Admin",userID:new Uint8Array(Buffer.from(user.webauthn_user_id)),
      attestationType:"none",authenticatorSelection:{residentKey:"required",userVerification:"required"},
      supportedAlgorithmIDs:[-7,-257],timeout:60000});
    const saved=await client.query(`INSERT INTO admin_passkey_challenges(challenge,purpose,user_id,authorizing_session_hash,rp_id,origin,expires_at,enrollment_version)
      VALUES($1,'registration',$2,$3,$4,$5,now()+interval '5 minutes',$6) RETURNING id`,
      [options.challenge,grant.user_id,grant.enrollment_only?null:hash,config.rpID,config.origin,user.enrollment_version]);
    if(grant.enrollment_only)await client.query("DELETE FROM admin_sessions WHERE token_hash=$1",[hash]);
    return {options,challengeId:saved.rows[0].id as string};
  });
}

function clientContext(response:RegistrationResponseJSON|AuthenticationResponseJSON) {
  try {
    const data=JSON.parse(Buffer.from(response.response.clientDataJSON,"base64url").toString("utf8"));
    if(data.crossOrigin===true || data.topOrigin!==undefined)deny();
    if(response.type!=="public-key" || typeof response.id!=="string" || !/^[A-Za-z0-9_-]{1,2048}$/.test(response.id) || response.rawId!==response.id)deny();
  }catch{deny();}
}
export async function finishRegistration(id:string,response:RegistrationResponseJSON,config:PasskeyConfig) {
  const saved=await consume(id,"registration",config);clientContext(response);
  const {verifyRegistrationResponse}=await import("@simplewebauthn/server");
  let verified;
  try {verified=await verifyRegistrationResponse({response,expectedChallenge:saved.challenge,expectedOrigin:config.origin,
    expectedRPID:config.rpID,requireUserVerification:true,requireUserPresence:true,supportedAlgorithmIDs:[-7,-257]});}catch{return deny();}
  if(!verified.verified || !verified.registrationInfo)return deny();
  const credential=verified.registrationInfo.credential;
  if(credential.id!==response.id)deny();
  await transaction(async client=>{
    const user=await owner(client,saved.user_id);
    if(user.enrollment_version!==saved.enrollment_version)deny();
    if(saved.authorizing_session_hash) {
      const active=await client.query(`SELECT 1 FROM admin_sessions s JOIN admin_passkeys p ON p.id=s.credential_id AND p.user_id=s.user_id
        WHERE s.token_hash=$1 AND s.user_id=$2 AND s.expires_at>now() AND NOT s.enrollment_only AND p.rp_id=$3 FOR UPDATE OF s`,[saved.authorizing_session_hash,saved.user_id,config.rpID]);
      if(!active.rowCount)deny();
    }
    try {await client.query("INSERT INTO admin_passkeys(id,user_id,rp_id,public_key,counter) VALUES($1,$2,$3,$4,$5)",
      [credential.id,saved.user_id,config.rpID,Buffer.from(credential.publicKey),credential.counter]);}
    catch(error){if((error as {code?:string}).code==="23505")deny();throw error;}
    // New enrollment is security-sensitive: existing sessions and pending session-authorized enrollments expire.
    await client.query("UPDATE admin_roles SET enrollment_version=gen_random_uuid() WHERE user_id=$1",[saved.user_id]);
    await client.query("DELETE FROM admin_sessions WHERE user_id=$1",[saved.user_id]);
    await client.query("DELETE FROM admin_passkey_challenges WHERE user_id=$1",[saved.user_id]);
    await audit(client,saved.user_id,"passkey_registered",config.days);
  });
  return {ok:true};
}
export async function beginAuthentication(config:PasskeyConfig) {
  const {generateAuthenticationOptions}=await import("@simplewebauthn/server");
  const options=await generateAuthenticationOptions({rpID:config.rpID,userVerification:"required",timeout:60000});
  return {options,challengeId:await challenge("authentication",config,options.challenge)};
}
export async function finishAuthentication(id:string,response:AuthenticationResponseJSON,config:PasskeyConfig) {
  const saved=await consume(id,"authentication",config);clientContext(response);
  const found=await pool.query("SELECT user_id FROM admin_passkeys WHERE id=$1 AND rp_id=$2",[response.id,config.rpID]);
  const userId=found.rows[0]?.user_id;if(!userId)return deny();
  return transaction(async client=>{
    const user=await owner(client,userId);
    const result=await client.query("SELECT * FROM admin_passkeys WHERE id=$1 AND user_id=$2 AND rp_id=$3 FOR UPDATE",[response.id,userId,config.rpID]);
    const credential=result.rows[0] ?? deny();
    if(response.response.userHandle!==Buffer.from(user.webauthn_user_id).toString("base64url"))deny();
    const {verifyAuthenticationResponse}=await import("@simplewebauthn/server");
    let verified;
    try {verified=await verifyAuthenticationResponse({response,expectedChallenge:saved.challenge,expectedOrigin:config.origin,
      expectedRPID:config.rpID,requireUserVerification:true,
      credential:{id:credential.id,publicKey:new Uint8Array(credential.public_key),counter:Number(credential.counter)}});}catch{return deny();}
    if(!verified.verified)return deny();
    await client.query("UPDATE admin_passkeys SET counter=$2 WHERE id=$1",[credential.id,verified.authenticationInfo.newCounter]);
    const token=`adm_${randomBytes(32).toString("base64url")}`;
    await client.query("INSERT INTO admin_sessions(token_hash,user_id,credential_id,expires_at) VALUES($1,$2,$3,now()+interval '15 minutes')",[hashSession(token),userId,credential.id]);
    await audit(client,userId,"session_created",config.days);
    return {token,expiresInSeconds:900};
  });
}

export async function revokeAdminSessions(userId:string) {
  // Serialize with credential verification/session issuance; commit revocation before audit.
  await transaction(async client=>{
    await owner(client,userId);
    await client.query("UPDATE admin_roles SET enrollment_version=gen_random_uuid() WHERE user_id=$1",[userId]);
    await client.query("DELETE FROM admin_sessions WHERE user_id=$1",[userId]);
    await client.query("DELETE FROM admin_passkey_challenges WHERE user_id=$1",[userId]);
  });
}
