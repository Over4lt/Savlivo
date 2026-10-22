// A provider-owned consent page is a navigation stage, never a price source.
// This route is limited to the exact redirect shape observed from YouTube
// Premium; another provider needs its own independently reviewed evidence.
export function youtubePremiumConsentRoute({serviceId,market,url,redirectUrl}={}){
 if(serviceId!=='youtube-premium'||!['SE','NO','US'].includes(market)||url!=='https://www.youtube.com/premium')return false;
 let destination,continued;
 try{destination=new URL(redirectUrl);continued=new URL(destination.searchParams.get('continue')??'');}catch{return false;}
 return destination.origin==='https://consent.youtube.com'&&destination.pathname==='/m'&&!destination.username&&!destination.password&&!destination.port&&!destination.hash
  &&['continue','gl','pc'].every(key=>destination.searchParams.getAll(key).length===1)
  &&destination.searchParams.get('gl')===market&&destination.searchParams.get('pc')==='yt'
  &&continued.origin==='https://www.youtube.com'&&continued.pathname==='/premium'&&!continued.username&&!continued.password&&!continued.port&&!continued.hash
  &&continued.searchParams.get('cbrd')==='1'&&[...continued.searchParams.keys()].length===1;
}
