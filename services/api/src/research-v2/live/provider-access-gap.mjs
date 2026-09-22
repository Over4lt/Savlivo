// A transient provider response failure after an explicit permitted access check.
// Never treats robots uncertainty, 403/challenges, redirects or parser zeros as permission.
export function providerAccessGap(page){
 if(page?.outcome!=='UNRESOLVED'||!page.accessDecisions?.length||page.accessDecisions.some(p=>!['ALLOWED','NO_ROBOTS_POLICY'].includes(p.decision)))return null;
 const f=page.failure;if(!f)return null;
 if(!(['TIMEOUT','NETWORK_FAILED'].includes(f.code)||f.code==='HTTP_STATUS'&&[502,503,504].includes(f.status)))return null;
 return {kind:'PERMITTED_DIRECT_PROVIDER_TRANSIENT_FAILURE',failure:f,accessDecisions:page.accessDecisions};
}

// Semantic diagnoses never grant an alternate transport. The caller must retain
// the original page/failure proof and a materially different authorized route.
export function acquisitionEscalation({page,alternateRoute=true,targetMarket=null}={}){
 const proof=providerAccessGap(page);
 if(!proof)return {eligible:false,primaryFailureReason:'NO_DEMONSTRATED_ACQUISITION_FAILURE',acquisitionFailureEvidence:null,routeBenefit:null};
 if(!alternateRoute)return {eligible:false,primaryFailureReason:'NO_ALTERNATE_ROUTE_BENEFIT',acquisitionFailureEvidence:proof,routeBenefit:null};
 return {eligible:true,primaryFailureReason:'DIRECT_ACCESS_FAILED',acquisitionFailureEvidence:proof,routeBenefit:{kind:'INDEPENDENT_APPROVED_PROXY_TRANSPORT',targetMarket,why:'Permitted original endpoint failed through Direct; alternate transport can change reachability.'}};
}
