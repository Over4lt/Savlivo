import assert from "node:assert/strict";
import test from "node:test";
import { askAssistant, parseAssistantResponse, type AssistantModel } from "./assistant.js";
import { validateAddSubscriptionIntent, parseAddSubscriptionIntent } from "../../../packages/contracts/src/discovery.js";
import { resolveSavedManagement } from "../../../packages/contracts/src/assistant-actions.js";
import { pool } from "./db.js";

const languages=[
  ["Norwegian","Legg til Spotify Premium."],
  ["English","Please add Spotify Premium."],
  ["Swedish","Lägg till Spotify Premium."],
  ["Danish","Tilføj Spotify Premium."],
  ["German","Füge bitte Spotify Premium hinzu."],
  ["French","Ajoute mon abonnement Spotify Premium."],
  ["Spanish","Añade mi suscripción a Spotify Premium."],
  ["Italian","Aggiungi il mio abbonamento Spotify Premium."],
  ["Portuguese","Adicione minha assinatura do Spotify Premium."],
  ["Dutch","Voeg mijn Spotify Premium-abonnement toe."],
  ["Polish","Dodaj moją subskrypcję Spotify Premium."],
  ["Czech","Přidej moje předplatné Spotify Premium."],
  ["Finnish","Lisää Spotify Premium -tilaukseni."],
  ["Chinese","添加我的 Spotify Premium 订阅。"],
  ["Thai","เพิ่มการสมัคร Spotify Premium ของฉัน"],
  ["Malay","Tambahkan langganan Spotify Premium saya."],
  ["Hindi","मेरा Spotify Premium सब्सक्रिप्शन जोड़ें।"],
  ["Traditional Chinese","幫我新增 Spotify Premium 訂閱。"]
];
const context={countryCode:"NO",currency:"NOK"};
const response=(actionCandidate:unknown,extra={})=>JSON.stringify({answer:"Model response in the user's language",language:"fixture",intent:"GENERAL",action:null,serviceNames:[],navigationTarget:null,needsExternalResearch:false,actionCandidate,...extra});
const modelFor=(message:string,candidate:unknown):AssistantModel=>async(messages,schema)=>{
  assert.ok(messages.at(-1)?.content.includes(message));
  assert.ok(messages[0].content.includes("general-purpose"));
  assert.ok(messages[0].content.includes("Shared Savlivo help"));
  assert.ok(messages[0].content.includes("Canonical catalog"));
  assert.ok(schema.properties.actionCandidate);
  return response(candidate);
};

for(const [language,message]of languages)test(`${language} structured add boundary is independent of English/Norwegian patterns`,async(t)=>{
  t.mock.method(pool,"query",(()=>{throw Error("AI cannot create a subscription");}) as any);
  const result=await askAssistant({message,context,languageHint:"en"},modelFor(message,{type:"ADD",serviceQuery:"spotify",planQuery:"Premium",billingProviderSlug:null}));
  assert.equal(result.catalogAction?.countryCode,"NO");assert.equal(result.catalogAction?.currency,"NOK");
  const candidate=validateAddSubscriptionIntent(result.assistantAction,"NO","NOK",[]);
  assert.equal(candidate?.kind,"service");if(candidate?.kind==="service"){assert.equal(candidate.serviceSlug,"spotify");assert.deepEqual(candidate.prefill,{});}
  assert.equal(candidate?.requiresConfirmation,true);
});

const saved=[{id:"no",serviceSlug:"netflix",serviceName:"Netflix",billingProviderSlug:"apple",countryCode:"NO",currency:"NOK"},{id:"br",serviceSlug:"netflix",serviceName:"Netflix",billingProviderSlug:"direct",countryCode:"BR",currency:"BRL"}];
for(const [message,managementAction]of [["Jeg vil avslutte Netflix","CANCEL"],["Pausiere Netflix","PAUSE"],["Renouvelle mon abonnement Netflix","REACTIVATE"],["Cambia mi plan de Netflix","CHANGE_PLAN"],["Onde altero o pagamento da Netflix?","BILLING"],["管理我的 Netflix 訂閱","MANAGE"]])test(`${managementAction} multilingual management boundary retains saved billing and market`,async()=>{
  const result=await askAssistant({message,context:{...context,subscriptions:saved}},modelFor(message,{type:"MANAGEMENT",serviceQuery:"Netflix",managementAction,billingProviderSlug:"direct",url:"https://evil.invalid"}));
  const resolved=resolveSavedManagement(result.assistantAction,saved,"NO","NOK");
  assert.equal(resolved.kind,"subscription");if(resolved.kind==="subscription"){assert.equal(resolved.subscription.id,"no");assert.equal(resolved.subscription.billingProviderSlug,"apple");assert.equal(resolved.action,managementAction);}
  assert.equal(JSON.stringify(result.assistantAction).includes("evil.invalid"),false);
});

test("verified Viaplay plan can prefill but model prices country and route overrides cannot",()=>{
  const price={serviceSlug:"viaplay",planName:"Viaplay Film & Serier",billingProviderSlug:"direct",countryCode:"NO",currency:"NOK",monthlyPriceMinor:16900,verification:"registry"};
  const result=parseAssistantResponse(response({type:"ADD",serviceQuery:"Viaplay",planQuery:"Film & Serier",billingProviderSlug:"direct",countryCode:"US",currency:"USD",monthlyPriceMinor:1}),context);
  const candidate=validateAddSubscriptionIntent(result.assistantAction,"NO","NOK",[price]);
  if(candidate?.kind!=="service")assert.fail();
  assert.deepEqual(candidate.prefill,{planName:price.planName,billingProviderSlug:"direct",monthlyPriceMinor:16900});
  const apple=parseAssistantResponse(response({type:"ADD",serviceQuery:"Viaplay",planQuery:"Film & Serier",billingProviderSlug:"apple"}),context);
  const mismatch=validateAddSubscriptionIntent(apple.assistantAction,"NO","NOK",[price]);
  if(mismatch?.kind!=="service")assert.fail();assert.deepEqual(mismatch.prefill,{});
  const invented=parseAssistantResponse(response({type:"ADD",serviceQuery:"Viaplay",planQuery:"Invented Premium",billingProviderSlug:"carrier"}),context);
  const unverified=validateAddSubscriptionIntent(invented.assistantAction,"NO","NOK",[price]);
  if(unverified?.kind!=="service")assert.fail();assert.deepEqual(unverified.prefill,{});
});

test("unknown and unsupported route model candidates remain manual or unresolved",()=>{
  const unknown=parseAssistantResponse(response({type:"ADD",serviceQuery:"LokalTV",planQuery:"Premium",billingProviderSlug:"apple"}),context);
  const candidate=validateAddSubscriptionIntent(unknown.assistantAction,"NO","NOK",[]);
  assert.equal(candidate?.kind,"manual");assert.ok(candidate && !("prefill" in candidate));
  const badRoute=parseAssistantResponse(response({type:"ADD",serviceQuery:"Viaplay",billingProviderSlug:"unresolved"}),context);
  const route=validateAddSubscriptionIntent(badRoute.assistantAction,"NO","NOK",[]);
  if(route?.kind!=="service")assert.fail();assert.equal(route.billingProviderSlug,"");
});

test("ordinary conversations, writing and quoted or negated actions remain model responses without navigation",async()=>{
  for(const message of ["Why is the sky blue?","Écris une lettre de remerciement.","I have a cold","Translate the phrase cancel Netflix into French","Do not add Spotify"]){
    const result=await askAssistant({message,context},modelFor(message,null));
    assert.equal(result.assistantAction,undefined);assert.equal(result.catalogAction,undefined);assert.ok(result.answer);
  }
  assert.equal(parseAddSubscriptionIntent("I have a cold","NO","NOK"),null);
  assert.equal(parseAddSubscriptionIntent("Jeg har vondt i hodet","NO","NOK"),null);
});

test("shared help exposes manual catalog reports preferences and multi-country behavior to model",async()=>{
  await askAssistant({message:"Comment utiliser le catalogue Savlivo ?",context},async(messages)=>{
    const system=messages[0].content;
    for(const topic of ["manual-service","catalog","reports","ai-preferences","billing-route","privacy-data","notifications","market"])assert.ok(system.includes(topic),topic);
    assert.ok(system.includes("does not delete subscriptions"));
    return response(null,{intent:"APP_HELP"});
  });
});

test("malformed actions do not suppress valid general conversation; invalid navigation targets are removed",()=>{
  const parsed=parseAssistantResponse(response({type:"DELETE_ALL",serviceQuery:"Netflix"},{navigationTarget:"https://evil.invalid",intent:"invented"}),context);
  assert.equal(parsed.assistantAction,undefined);assert.equal(parsed.navigationTarget,null);assert.equal(parsed.intent,"GENERAL");assert.ok(parsed.answer);
  assert.throws(()=>parseAssistantResponse("[]",context),/INVALID_ASSISTANT_RESPONSE/);
});
