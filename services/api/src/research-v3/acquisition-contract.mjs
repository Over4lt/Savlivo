// Resource ceilings, never evidence/truth predicates. Binary byte units.
const MiB=1024*1024,KiB=1024;
export const acquisitionCapacity=Object.freeze({
 version:1,wireResponseBytes:8*MiB,decodedResponseBytes:16*MiB,
 observationBytes:16*MiB,robotsBytes:512*KiB,geographyBytes:10000,
 headerBytes:64*KiB,redirects:8,robotsRedirects:5,
 dnsMs:10000,connectMs:15000,headersMs:30000,bodyMs:60000,
 providerRequestMs:90000,robotsRequestMs:30000,geographyRequestMs:20000,
 processingMs:10000,acquisitionMs:240000,
 objectiveWireBytes:64*MiB,objectiveDecodedBytes:128*MiB,objectiveAcquisitionMs:900000
});
export const presentationCapacity=Object.freeze({tokens:131072,depth:128,segments:32768,presentations:8192,textBytes:32*MiB});
export const httpRedirects=new Set([301,302,303,307,308]);
export const fault=(code,kind='ACQUISITION',diagnostics)=>Object.assign(Error(code),{code,kind,...(diagnostics?{diagnostics}:{})});
const classes={HTTP_PROTOCOL_FAILED:'HTTP_PROTOCOL',INVALID_REQUEST:'REQUEST_CONFIGURATION',UNSUPPORTED_CONTENT:'CONTENT_TYPE',SECRET_IN_RESPONSE:'SECRET_REDACTION',INVALID_BYTE_ACCOUNTING:'ACCOUNTING',DNS_FAILED:'DNS',UNSAFE_DNS:'DNS',UNSAFE_HOST:'DESTINATION',PROVIDER_BOUNDARY:'DESTINATION',SECRET_QUERY_REJECTED:'DESTINATION',NETWORK_FAILED:'TRANSPORT',CONNECTION_FAILED:'CONNECTION',PROXY_CONNECT_FAILED:'PROXY',PROXY_ACCESS_DENIED:'PROXY',TARGET_TLS_FAILED:'TLS',HEADERS_TOO_LARGE:'HEADER_CAPACITY',BODY_READ_FAILED:'BODY_READ',INCOMPLETE_RESPONSE:'BODY_READ',RESPONSE_TOO_LARGE:'BODY_CAPACITY',WIRE_BYTE_BOUND:'BODY_CAPACITY',DECOMPRESSION_BOUND:'DECOMPRESSION_CAPACITY',DECODED_BYTE_BOUND:'DECODED_CAPACITY',OBSERVATION_BYTE_BOUND:'OBSERVATION_CAPACITY',UNSUPPORTED_ENCODING:'ENCODING',DECOMPRESSION_FAILED:'DECOMPRESSION',UNSUPPORTED_OR_INVALID_CHARSET:'DECODING',ROBOTS_PARSE_FAILED:'ROBOTS_PARSE',ROBOTS_UNSUPPORTED_CONTENT:'ROBOTS_RESPONSE',ROBOTS_HTTP_UNAVAILABLE:'ROBOTS_HTTP',ROBOTS_DISALLOWED:'ROBOTS_POLICY',ROBOTS_REVIEW_REQUIRED:'ROBOTS_POLICY',REDIRECT_LIMIT:'REDIRECT_CAPACITY',REDIRECT_LOOP:'REDIRECT',REDIRECT_LOCATION_MISSING:'REDIRECT',REDIRECT_LOCATION_INVALID:'REDIRECT',REDIRECT_UNSAFE_DESTINATION:'REDIRECT',ACQUISITION_PROCESSING_FAILED:'PROCESSING',GEO_VERIFICATION_FAILED:'GEOGRAPHY',GEO_COUNTRY_MISMATCH:'GEOGRAPHY',GEO_BINDING_CHANGED:'GEOGRAPHY',EXPLICIT_CANCELLATION:'CANCELLATION',ABORTED:'CANCELLATION',ACQUISITION_DEADLINE_EXCEEDED:'DEADLINE',NETWORK_REQUEST_BOUND:'REQUEST_CAPACITY'};
export function failureClass(code){return classes[code]??(/_TIMEOUT$/.test(code)?'DEADLINE':code?.startsWith('GEO_')?'GEOGRAPHY':code?.endsWith('_BOUND')?'CAPACITY':'PROCESSING');}
export function normalizedFailure(error,fallback='ACQUISITION_PROCESSING_FAILED') {
 const code=typeof error?.code==='string'&&error.code.length<=128&&(classes[error.code]||/^(?:GEO_|ROBOTS_|PROVIDER_|SECRET_|DECODO_)[A-Z_]+$/.test(error.code)||/^[A-Z_]+_(?:TIMEOUT|BOUND)$/.test(error.code))?error.code:fallback;
 return {code,classification:failureClass(code)};
}
export function safeMetadata(headers={}) {
 const token=(v,n=128)=>typeof v==='string'&&v.length<=n&&/^[a-zA-Z0-9.+_\/-]+$/.test(v)?v.toLowerCase():null;
 const length=Number(headers['content-length']);
 return {contentType:token(String(headers['content-type']??'').split(';')[0].trim()),contentEncoding:token(String(headers['content-encoding']??'identity').trim()),declaredBytes:Number.isSafeInteger(length)&&length>=0&&headers['content-length']!==undefined?length:null};
}
