// Truth is deterministic; source understanding is not a truth decision.
export const truthContract=Object.freeze({
    version:2,
    monthlyEligibility:"Actual source-supported monthly billing is required; display cadence and commitment are independent. Explicit complete non-monthly choices establish ineligibility; absence remains unresolved.",
    ESTABLISHED:'A sufficient explicit fact in authoritative, source-bound provider evidence, including its required semantic relationships/context; one observation may suffice.',
    UNRESOLVED:'No sufficient explicit supporting or incompatible authoritative fact. Missing, ambiguous, failed or unsupported understanding is not contradiction.',
    CONTRADICTED:'Actual incompatible authoritative facts for the same proposition/offer/context, or an explicit fact incompatible with the proposition semantics.',
    absenceRetracts:false,
    singleObservationMaySuffice:true,
    modelAgreementRequired:false
});
// Country verification is a capability receipt, not a model assertion. The
// receipt contract is transport-independent; Direct is expressly unbound.
export function verifiedCountryContext(o) {
    const country=o.context?.networkGeography,t=o.transport;
    if(o.context?.transport==='DIRECT'||! /^[A-Z]{2}$/.test(country??'')||o.httpStatus!==200||t?.verification!=='BRACKET_VERIFIED'||t.requestedCountry!==country||t.verifiedCountry!==country)return null;
    return country;
}
