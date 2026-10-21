// Read-only compatibility links for legacy hash-named V3 rows. Each offer ID
// was checked against the original completed acquisition journal, complete
// retained body, SHA-256, NL G1 receipt and source-bound V3 name reference.
// These links do not reclassify evidence or authorize a database repair.
const maxNlSource={serviceSlug:'max',countryCode:'NL',billingProviderSlug:'direct',currency:'EUR',
 sourceUrl:'https://www.hbomax.com/nl/en',sourceHash:'e7667c6e1aa08ee9a09d8671474650e540cb6502b9ad76ee76c8d534f97b0afc',
 jobId:'c50b560d-dc8d-d08e-99a1-306ddcbf4593'};

export const documentedV3IdentityLinks=Object.freeze([
 {...maxNlSource,exactOfferId:'54c576f7d7721e8f5a26c1c66ccd4d3a0e379888c8ae59aeff753a0d0772580d',planSlug:'basic-with-ads',planName:'Basic With Ads',amountMinor:599},
 {...maxNlSource,exactOfferId:'41227e6fdf91d631115a5f99b52cf76f96f01ba7ee992412d771452c46cbc6b5',planSlug:'standard',planName:'Standard',amountMinor:1199},
 {...maxNlSource,exactOfferId:'e02a30f15b3a511a3531b036eec16137ccc07ae55c5c8da7231fbba1eddbac98',planSlug:'premium',planName:'Premium',amountMinor:1699}
].map(Object.freeze));

export function documentedV3Successor(row,rows){
 if(row.source!=='v3-truth'||!/^[a-f0-9]{64}$/u.test(row.planSlug??'')||row.planName!==row.planSlug)return false;
 const proof=documentedV3IdentityLinks.find(link=>link.exactOfferId===row.planSlug&&
  ['serviceSlug','countryCode','billingProviderSlug','currency','sourceUrl'].every(field=>link[field]===row[field])&&
  link.amountMinor===row.monthlyPriceMinor);
 if(!proof)return false;
 return rows.filter(candidate=>candidate!==row&&candidate.source==='v3-truth'&&
  ['serviceSlug','countryCode','billingProviderSlug','currency','sourceUrl'].every(field=>candidate[field]===proof[field])&&
  candidate.planSlug===proof.planSlug&&candidate.planName===proof.planName&&
  candidate.monthlyPriceMinor===proof.amountMinor).length===1;
}
