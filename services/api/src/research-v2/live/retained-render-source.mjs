// Routing permission for a Browser continuation on the exact Decodo source
// already classified as a provider source. This never supplies price Truth.
import {providerSourceDomainFamily} from '../../research-v3/provider-source-family.mjs';

export function retainedProviderRenderingAuthority(target,{url,transport,sourceHash}={}){
 if(transport!=='DECODO'||!/^[a-f0-9]{64}$/.test(sourceHash??'')||!providerSourceDomainFamily(target,url))return false;
 return (target.acquisitionOutcomes??[]).some(row=>row.sourceClassification?.status==='PROVIDER_SOURCE'&&row.sourceClassification.finalUrl===url&&row.sourceClassification.sourceHash===sourceHash&&row.countryV3Evaluation?.status==='EVALUATED'&&row.countryV3Evaluation.receiptStatus==='HASH_VERIFIED'&&row.countryV3Evaluation.geoClass==='G1');
}
