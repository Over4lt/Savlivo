# V3 translation boundary

Translation is an optional derived-text stage. It does not extract proposition
answers or decide truth. This boundary remains useful, but is no longer the only
model capability: see [source-bound evidence truth](research-v3-evidence-truth.md).
The product requirement is deterministic TRUTH, not deterministic natural-language
understanding. The earlier non-LLM extraction blocker has therefore been resolved
by a separate bounded evidence-understanding contract, not by regex accumulation.

`translation.mjs` preserves original visible segments, original observation/hash,
ordered spans/text, transformed text and FAITHFUL/UNCERTAIN translation status.
Local validation rejects extra fields, changed/missing/reordered source segments,
incorrect identities/hashes, numeric mutation and exceeded bounds. Original body,
transport and geography are never overwritten. Derived views retain presentation
markup and are escaped; their evidence bindings map back to exact original spans.
Source mapping proves provenance, not semantic fidelity. FAITHFUL is a translation
assertion, not a truth or sufficiency verdict.

The standalone LIVE runner normally uses evidence understanding directly on original
multilingual material. It does NOT force a translation call before understanding.
`createLiveTranslationInterpreter` remains a separate optional interface with a
translation-only schema; `createLiveSemanticInterpreter` now uses the evidence schema.
Already usable original/translated evidence can bypass model calls. Understanding
may consume a validated translation artifact, but every derived support must still
identify the original span and exact transformed segment/artifact. Uncertain or
forged mappings cannot be used as supported evidence.

Calls are invocation/timeout/output bounded, SDK retries are disabled, and each
reservation is checkpointed before dispatch. Failures are scoped to that attempt;
native evidence and other grounded actions remain available. Failed translation is
neither contradiction nor a reason to retract an established fact. LIVE configuration
still fails closed: native bypass is intentional on-demand processing, not a silent
substitution of a legacy model adapter.

The static English parser remains limited. Seven-language translation fixtures test
faithful mappings through its supported wording; they do not claim arbitrary prose
coverage. General multilingual source semantics now use the separate evidence
understanding path. Offline fixtures validate contracts/evaluation, not live model
accuracy. No new live call has been made in this milestone.
