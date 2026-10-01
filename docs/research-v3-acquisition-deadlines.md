# Research V3 acquisition deadlines and request ledger

Acquisition remains one attempt, without retries. This change does not alter routing, observation authority, geography verification, semantic selection or truth.

Previously the 15,000 ms acquisition controller covered proxy DNS, pre-geography verification, robots, provider retrieval/redirects/body and post-geography verification together. A provider public-reader timer also started before its robots hook, so robots consumed the provider reader's deadline. The retained currency live attempt records three request reservations and 669 bytes, but no request-level results. Its exact failed subphase cannot be reconstructed retrospectively. The ordinary sequence implies pre-geography, robots and provider reservations; it does not prove which responses completed.

## Bounds and cancellation

Each DNS operation and each HTTP hop now gets a fresh child signal and a 15,000 ms deadline. HTTP timing covers connection/TLS, headers and body together; phase transitions classify where that hop's deadline expired, rather than extending it. The acquisition parent cap is 90,000 ms by default (six request intervals), leaving room for four required country-bound HTTP operations plus setup/DNS overhead. Redirects share this cap and existing request/byte budgets. Configuration allows a finite cap of at most 180,000 ms and request intervals at most 60,000 ms. No run budget is increased.

Public-reader timers use the acquisition cap, not the short hop interval. The independently started parent cap remains authoritative even when a reader/robots hook starts later. Child timers and parent listeners are cleared on all exits. Late callbacks cannot update accounting after a bounded operation ends. DNS cannot always be cancelled inside the OS resolver; its result is ignored after expiry and cannot dispatch HTTP.

Explicit caller cancellation is `EXPLICIT_CANCELLATION`; overall expiry is `ACQUISITION_DEADLINE_EXCEEDED`. Phase codes combine purpose (`GEO_PRE`, `ROBOTS`, `PROVIDER`, `GEO_POST`) with `DNS`, `CONNECT_TLS`, `HEADERS` or `BODY` and `_TIMEOUT`. Other errors retain a controlled code or become `NETWORK_FAILED`/`DNS_FAILED`. Arbitrary exception messages are not retained.

The shared proxy stack reports CONNECT initiation and target request initiation, and streamed body bytes. It cannot separately expose DNS versus TCP versus proxy CONNECT versus target TLS within `CONNECT_TLS`, or status/headers before the first body chunk. A proxy stall after target initiation but before the first body byte is therefore classified `HEADERS`, even if headers internally arrived. Its HTTP status can remain null on failure. Direct HTTPS exposes response headers and records `BODY` immediately after headers arrive. These labels report observable phases, not inferred socket events.

## Durable ledger

A row is created at dispatch/accounting, with local sequence, action/attempt IDs, transport, purpose, destination origin, requested geography, ordering, elapsed ms, hop deadline, acquisition cap, last observed phase, completion/failure, HTTP status when observable, bytes and redirect predecessor. Ledger length equals acquisition HTTP request accounting, including failed dispatched requests. DNS is bounded setup, not an HTTP request, and failures include safe DNS timing/context metadata.

Origins alone are retained in the ledger: userinfo, paths, query strings and fragments are discarded. No request headers, cookies, proxy credentials or arbitrary exception text are serialized. Existing grounded action/observation URLs retain their existing handling. Successful receipt of HTTP bytes does not imply admission of provider evidence: robots policy, MIME, authority and bracket geography checks still apply.

The engine stores returned ledgers and timing in attempts and `ACQUISITION_LEDGER` trace events before handling acquisition/capacity failure. Completed failed attempts survive integrity-protected checkpoints. Reservations are checkpointed before dispatch as before. In-flight partial ledgers are not incrementally checkpointed: abrupt process loss can leave a reserved attempt without completed diagnostics, and resume does not replay it.

## Offline verification

`node --test services/api/src/research-v3/acquisition-deadlines.test.mjs` uses injected transport/DNS and a deterministic timer scheduler. It covers ordered bracket verification, redirects, each observable timeout phase, parent expiry, cancellation, transport failure, DNS, exact HTTP accounting, sequential slow operations, signal isolation, timer cleanup, failed-attempt checkpoint restoration and origin redaction. The full V3 suite preserves all existing semantic, pricing, account and geography regressions.
