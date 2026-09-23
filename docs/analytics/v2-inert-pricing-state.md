# Inert pricing-state observations

The extractor can retain candidate money relationships from literal initializers
without executing JavaScript. This is separate from active-offer, authority,
market and price verification. There is no provider/domain dispatch.

## Syntax and bounds

The existing standalone JSON and Flight materializers remain unchanged. The new
path recognizes top-level identifier or dotted-member assignments, optionally
introduced by `var`, `let` or `const`. Data supports object/array literals,
identifier or JSON-string property names, JSON strings, finite JSON numbers,
booleans and null. Comments and trailing commas are supported. Source spans use
UTF-16 offsets in the retained body, consistent with the existing extractor.

Executable values are not evaluated. An object property whose value is a call,
identifier, arithmetic or other unsupported expression remains unavailable.
Independent complete literal properties can still be observed, but the enclosing
object is explicitly incomplete. Literals inside function bodies, calls,
conditions or parenthesized expressions are not lifted into state. Computed keys,
spreads, getters/methods, duplicate keys and prototype-related keys reject their
object. Single-quoted values are skipped, not decoded. Template literals and
non-comment slash syntax reject the script. No runtime variable resolution,
assignment merging, mutation simulation or last-assignment-wins inference occurs.

Bounds: 4 MB source (existing), 256 inline scripts, 256 KiB per script, 60,000
tokens per script, 48 bracket levels, 30,000 parsed values across scripts and 512
money observations. Bound failures discard the affected script or complete new
observation set as applicable. Existing extractors remain independent. No new
package dependency, browser, network or filesystem acquisition is introduced.

## Money relationships

Complete objects can connect a named product (including SKU and subscription
length/unit) to explicitly labelled nested money objects. Supported roles include
product price, total, tax-inclusive total, reference amount, discount, credit,
tax and trial. These roles are retained, not collapsed into a preferred price.

Digit-string amounts can be normalized using an unambiguous source-provided
`currencyExponents` or `currenciesSubunit` map (integer exponent 0–6). Conflicting
or absent metadata leaves the normalized amount unknown; there is no default of
two decimals. Exact raw amount, exponent-map source, money-object source, owner
source, body hash and script identity remain attached. The normalization is an
observation of the source-scale relationship, not certification of a payable
charge or tax policy. Trial and incentive presence remains distinct from normal
product money. No rounded monthly-equivalent multiplication is performed.

## Admission boundary

Literal existence does not establish that an offer is active, selected,
purchasable or applicable to the requested market. New candidates deliberately
retain `EMBEDDED_OFFER_ACTIVATION_UNRESOLVED`, ambiguous offer ownership and
qualifier status. They pass through the existing semantic/verifier pipeline;
this extension does not itself admit them as verified provider prices. Credits,
discounts and tax components are explicitly non-charge observations. A future
active-offer binding would need independent, source-grounded proof; it must not
remove these blockers solely because parsing succeeded.

## Validation

Generic tests live beside the new parser. They use synthetic data and do not
read or commit production evidence. Read-only local diagnostics against the two
retained pricing bodies recovered eight named product/cadence tax-inclusive
totals per response, plus separate money roles. Both exact-byte hashes remained
unchanged and zero new observations passed price verification. Browser and
Decodo were unnecessary for those retained responses. The separate planner's
zero-request/exhaustion behavior is not changed.
