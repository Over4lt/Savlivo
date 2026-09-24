# Bounded named-price prose

`NAMED_PRICE_PROSE_V1` extends extraction; it is not an admission or recovery
identity. The normal verifier re-extracts retained bytes and applies unchanged
currency, ownership, market, provenance, commercial-role and conflict rules.

Recognized structures include an explicit monthly amount followed by a named
parenthetical label, named monthly charges, bounded introductory totals followed
by an explicit renewal transition, and included-with relationships. Coordinating
clauses own their separate amounts and product names. Unknown labels/structures
remain on the existing unresolved extraction path. This is deliberately not a
general natural-language parser or a translation system.

Relationships retain body hash, DOM/JSON path, normalized-text UTF-16 amount,
name, clause and transition spans, original clause text, phase, and an explicit
prior introductory amount/duration where present. Original source snippets and
locators remain available. Commercial classification re-reads the exact source
text and reproduces the relationship before using the narrower clause context.
A renewal verb alone does not establish an introductory phase or resolve a
conflicting price. Reference prices and excluded monetary roles remain excluded.

Only `description`, `disclaimer`, `legalDisclaimer`, `offerText`, and `terms`
string fields are considered inside the existing bounded JSON traversal.
Limits: 2,000 characters and 16 monetary occurrences per text; at most 64 JSON
fields / 64,000 characters per extraction. Unsupported or oversized fields stay
outside this new recognizer. Embedded candidates keep ambiguous ownership and
`EMBEDDED_OFFER_ACTIVATION_UNRESOLVED`; prose recognition cannot prove an active
purchase offer or transfer page-wide market applicability into embedded data.

No amount/currency inference, price division, provider-specific matching,
network work, model calls, historical migration or replay recovery is added.
Zero remains extractable but cannot become a recurring provider price. Synthetic
verification proves supported local structures, not any particular production
page or run. Split DOM text and unsupported prose can still remain unresolved.
