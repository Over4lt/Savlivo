# Source-bound offer presentation

`OFFER_PRESENTATION_V1` describes a source presenting an exact offer for selection
or purchase in its observed context. It is not authority, a completed purchase,
global availability, or a permanent-price assertion.

Two bounded existing relationships supply the receipt:

- Page product → preferred SKU → matching availability → explicit Purchase actions
  → identical principal recurring price. Existing SKU qualification is unchanged.
- Exact rendered card ID/name/amount/currency/monthly cadence and explicit monthly
  renewal wording → same-card form submitting exactly that plan ID. The form must
  contain one hidden sku/planId/productId input, one explicit purchase/select
  submit button, and no additional controls, event attributes or action overrides.
  The action must resolve to the acquired source's origin.

The latter also accepts one complete inert object/array assignment (including a
member-expression target) through the existing non-executing parser. No trailing
runtime mutations, partial literals, computed expressions or calls are consumed.
It uses the existing structured-plan schema; arbitrary checkout state is not a
supported schema. Unknown offer qualifiers are rejected on this new path. Annual,
weekly, trials, minor-unit money objects and monthly-equivalent displays are not
newly promoted by it. Existing extraction and qualification paths retain these
observations and their original semantics.

A receipt includes the body hash, source occurrence and URL, acquisition timestamp
when recorded, identity/price/currency/cadence locators, owning rendered surface,
form or availability relationship, and existing market-attribution evidence.
Verification re-derives the proof from retained source; client-supplied proof is
not an admission credential. The normal authority, intact-source, ownership,
market, commercial-role and conflict gates remain mandatory. Existing successful
price paths do not acquire a new universal gate.

Country/currency alone do not establish offer-market applicability. Existing
bounded country-section, provider-market and acquisition-context rules continue
to govern that assertion. Source timestamps are retained without a new TTL or
refresh scheduler. Human leads have no privileged interpretation.

Bounds: existing inert parser 262144 bytes/script, 60000 tokens, depth 48 and
30000 values; structured binding 100000 traversal steps, depth 48 and 128 bindings;
rendered card 2000 characters and renewal scope 6000 characters; presentation
lookup at most 100000 DOM nodes, 16 forms/card and 256 nodes/form. Unsupported
relationships remain partial; no JavaScript, transport or browser runs.

The retained Chess.com /offer and /membership bodies continue to produce 81 money
observations each, but zero presentation proofs and zero verified prices. Their
empty purchase container and generic anchors do not bind individual SKUs.
