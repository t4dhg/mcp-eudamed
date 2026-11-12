# Public API contract and integration boundaries

Base URL: `https://api.datalake.sante.service.ec.europa.eu/eudamed`.

Every request is a JSON GET with `format=json` and `api-version=v1.0`. No authentication was required in live verification on 14 October 2026. Responses use `{ "value": [...], "nextLink": "optional continuation URL" }`. Endpoint fields were inspected directly; this is an observed contract, not a formal service guarantee.

| Endpoint     | Query mapping                                                                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/udi`       | `manufacturerSrn → MF_SRN`, `tradeName → TRADE_NAME`, `deviceName → DEVICE_NAME`, `primaryDi → PRIMARY_DI`, `basicUdi → BASIC_UDI`, `reference → REFERENCE` |
| `/actors`    | `actorId → ACTOR_ID`; discovery: `name → NAME` and `ABBREVIATED_NAME` separately, `country → ACT_COUNTRY_ISO2_CODE`, `role → ACTOR_TYPE`                    |
| `/reference` | `language → LANGUAGE`                                                                                                                                       |

The API returned string UDIs and SRNs, numeric IDs, nullable fields, numeric 1/0 flags, leading whitespace in a nomenclature code and JSON-encoded actor-name fields. Identifiers remain strings. Normalized strings are trimmed; raw device fields remain intact. The exported `parseEmbeddedJson` helper parses encoded values defensively, but raw fields are not silently rewritten.

Device validation requires at least one non-null identity field and validates known scalar fields while retaining unknown fields. Unexpected known-field types, malformed JSON or missing envelopes are errors, not empty lists. Actor validation projects an allowlist of organizational fields and discards all other fields before caching. Reference rows require numeric integer ID and string CODE, LANGUAGE and VALUE.

## Search semantics

Trade-name and company-name matching is exact; do not depend on substring, wildcard or fuzzy matching. Exact identifier queries were observed to work. The integration does not depend on text queries being exact: `exact=true` applies normalized equality to every supplied filter locally. Actor discovery exposes exact legal and abbreviated name searches; verify candidate SRNs before portfolio queries.

All device calls require a nonblank restrictive filter. There is no speculative `page` or `offset` parameter. The client follows validated nextLink values within EUDAMED_MAX_PAGES and reports whether continuation remains. `coverage=unknown` is retained even when a local limit did not truncate anything.

Reference IDs are only meaningful with their CODE and language. For example, the same ID in `RISK_CLASS_ID` and `STATUS_ID` must not collide. Unknown IDs retain their numeric value and an unresolved label. The server does not hard-code risk classes or infer a legal conformity route from them.

## Reliability and provenance

The adapter owns URL encoding, versioning, request serialization, bounded retries, stream-size checks, validation and bounded TTL caching. It retries only transient read failures. A successful empty response can be cached; errors cannot. Cache hits retain the source retrieval time. Returned copies prevent consumers from modifying cached records.

The exact query URL is included intentionally in returned evidence. It is not written to logs. A custom HTTPS base URL is an operator-selected trust boundary: queries go to that host, and `sourceUrl` exposes that host. Do not describe custom-host responses as independently verified Commission evidence.

All upstream strings are untrusted data. Applications consuming the reusable client must escape values when rendering HTML and must not execute instructions found in records.

## Errors

Library errors expose `code`, `status` where available, and `retryable`. Codes are `HTTP`, `NETWORK`, `TIMEOUT`, `SCHEMA`, `SIZE`, `JSON`, `CANCELLED` and `DEADLINE`. Input validation uses Zod errors. HTTP errors retain the query URL, status, observation time and an untrusted response-body excerpt capped at 4 KiB (or the configured response byte limit, if smaller), with explicit truncation and body-read-failure markers. A broken body stream preserves the received HTTP status and partial body; caller cancellation still takes precedence. Arbitrary exception text remains redacted. The manual device-portal link is guidance for a human, never an automated API fallback.

The device tool retains valid device evidence if reference decoding fails, exposing `referenceError`. Investigation records per-step failures and returns `status=partial`; failed steps are null rather than fabricated empty successes.

## Unverified upstream behavior

The official OpenAPI definition and production 2.27.0 user guide were verified on 2026-10-17. The guide documents nextLink pagination and two-hour production synchronization; live pages contained 1,000 rows despite its 100-row example. Rate limits, service guarantees and actual record freshness remain unverified. See [coverage](coverage.md) for links and observations. No internal certificate-web-application endpoint is assumed to be a supported Data Lake API.

Sources: [DG SANTE catalogue](https://developer.datalake.sante.service.ec.europa.eu/api-details#api=94b9e658-d721-4b58-8d96-022c490f7a17), [European Commission EUDAMED overview](https://health.ec.europa.eu/medical-devices-eudamed/overview_en).

Investigation requests accept `deadlineMs` (default 60000, maximum 300000). Client methods accept a separate `{ signal }` request-options argument; the deadline spans queued work, active requests, retries and body reads. Investigation keeps partial evidence after cancellation or expiration. Discovery queries each supplied identity field separately in priority order: Primary DI, Basic UDI, trade name, device name, reference. It exposes conflicts and alternatives instead of silently combining contradictory filters. The ordinary device-search tool retains its explicit multi-filter AND behavior.

## Category filters and availability

The official OpenAPI definition was rechecked on 2026-11-12 and documents `/udi` filters `RISK_CLASS_ID`, `APPLICABLE_LEGISLATION_ID`, `NOMENCLATURE_CODE` and `SPECIAL_DEVICE_TYPE_ID`. `eudamed_devices` exposes these as `riskClass`, `applicableLegislationId`, `nomenclatureCode` and `specialDeviceTypeId`. Numeric IDs pass through; English risk labels resolve through `RISK_CLASS_ID` reference rows, with the reference provenance retained. Unknown or ambiguous labels fail before device I/O. The investigation tool retains identity-based inputs; use device search for category discovery first.

Live verification on that date returned HTTP 404 `Data not found` for a previously retrieved device control and a class/EMDN query, while its actor and reference queries succeeded. Filter support is documented; successful live category retrieval could not be verified during this incident.

`eudamed_status` bypasses caches and independently checks the historical public DERM Basic UDI `506071773DERM-DX-CEMDRXU` and manufacturer `GB-MF-000017972` (last known good 2026-11-09). It reports `probable-device-dataset-outage` only for a device 404 `Data not found` alongside a matching actor control; `available` requires both matching controls, otherwise `inconclusive`. A control can change: this is diagnostic evidence, not definitive outage detection. Custom base URLs use these same controls and may therefore yield inconclusive results. Investigations automatically run this bounded check when every attempted device query returns 404, within the existing deadline and cancellation scope.

`provenance.truncated` now covers both local output and incomplete pagination. `locallyTruncated` preserves the separate output-cap signal. Successful empty responses remain distinct from HTTP failures. Device results already include raw IDs and dynamically decoded labels; equal numeric IDs in different CODE categories never share a label.
