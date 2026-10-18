[![European Commission — EUDAMED](https://raw.githubusercontent.com/t4dhg/mcp-eudamed/main/docs/assets/eudamed-header.svg)](https://ec.europa.eu/tools/eudamed/)

**Independent, unofficial integration.**

# EUDAMED MCP

**Search European medical-device records from your AI assistant.**

[![npm version](https://img.shields.io/npm/v/%40t4dhg%2Fmcp-eudamed)](https://www.npmjs.com/package/@t4dhg/mcp-eudamed)
[![npm downloads](https://img.shields.io/npm/dm/%40t4dhg%2Fmcp-eudamed)](https://www.npmjs.com/package/@t4dhg/mcp-eudamed)
[![TypeScript types included](https://img.shields.io/badge/types-included-3178c6.svg)](https://www.npmjs.com/package/@t4dhg/mcp-eudamed?activeTab=code)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/t4dhg/mcp-eudamed)](https://github.com/t4dhg/mcp-eudamed/stargazers)
[![CI](https://github.com/t4dhg/mcp-eudamed/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/t4dhg/mcp-eudamed/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/t4dhg/mcp-eudamed/branch/main/graph/badge.svg)](https://codecov.io/gh/t4dhg/mcp-eudamed)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-brightgreen.svg)](https://nodejs.org/)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io/)

**Independent, unofficial integration · Read-only access · No API key required for the public endpoints tested**

A read-only Model Context Protocol server for the European Commission's EUDAMED Public API. Search UDI records, verify economic operators, decode classification and status values, and investigate a device without losing the distinction between a public record and verified conformity evidence.

Start with a company name, device name or UDI. Find candidate records, identify the registered manufacturer and build an evidence checklist with source links and explicit gaps.

**5 tools · 3 guided workflows · 5 readable resources**

[Get started](#install-and-connect) · [Example requests](#try-these-requests) · [How evidence works](#understand-the-evidence) · [Official EUDAMED portal](https://ec.europa.eu/tools/eudamed/)

## What makes it useful

- **Identity before interpretation.** Preserve leading zeroes in UDIs, apply exact matching locally, and keep multiple candidates visible.
- **Find the actual manufacturer.** A supplied SRN can belong to another company in the same group. Investigation searches device identity independently and follows the manufacturer SRN in the returned record.
- **Evidence you can trace.** Results carry the exact source query, original retrieval timestamp, API version, cache status and local limits.
- **Honest gaps.** Missing flags remain unknown. Failed requests remain failures. IFUs, declarations and certificates remain unverified until obtained separately.
- **Small tool surface.** Five tools expose the three verified API endpoints and a bounded investigation workflow. Prompts are also resources, so clients can read the procedures without invoking a slash command.
- **Conservative by default.** Serialized requests, bounded retries, timeouts, response-size limits, short-lived caching and organizational-only actor data.

This is an independent integration, not an official European Commission product. Public registration does not independently establish product conformity. The server does not retrieve IFUs or certificates and does not issue a compliant/non-compliant verdict.

## Install and connect

Requires Node.js 22 or later. Add this entry to your MCP client's server configuration:

```json
{
  "mcpServers": {
    "eudamed": {
      "command": "npx",
      "args": ["-y", "@t4dhg/mcp-eudamed@0.1.1"]
    }
  }
}
```

To build from source, run `npm ci && npm run build` in the checkout and configure `node` with the absolute path to `dist/cli.js`.

The server uses stdio. Standard output is reserved for MCP messages. No credentials or `.env` file are needed. Optional configuration is read from the process environment; `.env` files are not loaded automatically.

For programmatic use, import `EudamedClient`, `investigate` or `createServer` from the package. Importing the library does not start a transport:

```typescript
import { EudamedClient, investigate } from '@t4dhg/mcp-eudamed';

const api = new EudamedClient();
const results = await api.devices({
  primaryDi: 'YOUR_PRIMARY_UDI_DI',
  exact: true,
});

const dossier = await investigate(api, {
  manufacturerSrn: 'US-MF-000000001',
  tradeName: 'YOUR_DEVICE_NAME',
});
```

## Try these requests

> Find the public EUDAMED record for this Primary UDI-DI. Show the legal manufacturer, authorised representative, risk class and the exact source query.

> I have a manufacturer SRN and a product name, but the manufacturer search is empty. Check whether the product is registered under a different legal entity.

> Build an evidence checklist for this device. Separate what EUDAMED says from what still needs a controlled IFU, declaration or certificate.

## Tools

| Tool                      | Purpose                                                                         | Main inputs                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `eudamed_devices`         | Search and normalize UDI records; optionally include raw device fields          | At least one of `primaryDi`, `basicUdi`, `manufacturerSrn`, `tradeName`, `deviceName`, `reference`; optional `exact`, `limit`, `language`, `raw` |
| `eudamed_actors`          | Verify one exact SRN with organizational fields only                            | `actorId`                                                                                                                                        |
| `eudamed_discover_actors` | Discover exact legal/abbreviated company-name candidates, with portal fallback  | `name`, optional `country`, `role`, `limit`                                                                                                      |
| `eudamed_references`      | Retrieve code translations, optionally narrowed locally                         | `language`, `code`, `id`, `limit`                                                                                                                |
| `eudamed_investigate`     | Resolve candidate devices and operators, decode fields and expose evidence gaps | Device search fields; `language`, `maxDevices`, `maxManufacturers`, `maxRepresentatives`, `deadlineMs`                                           |

All tools advertise read-only, non-destructive, idempotent, open-world annotations. Tool errors return `isError: true`. Search tools provide JSON text and equivalent `structuredContent`. Investigation provides a concise report in text content and complete evidence in `structuredContent` (also including the report).

### Search a device

```json
{
  "primaryDi": "YOUR_PRIMARY_UDI_DI",
  "exact": true,
  "limit": 10,
  "language": "en",
  "raw": true
}
```

`exact` defaults to `false` for discovery. When true, every supplied filter is compared locally using trimmed, case-insensitive equality. Do not assume upstream partial-name matching; use exact known identifiers and inspect the returned evidence. Multiple filters are sent together; the observed upstream behavior is AND, but it is not a published contractual guarantee.

The device tool returns normalized identity, operators, decoded values, tri-state flags, intended-purpose status and unverified document checklists. Set `raw: true` to retain additional upstream device fields. The library's `devices()` method always returns validated raw device records.

### Investigate a manufacturer mismatch

```json
{
  "manufacturerSrn": "YOUR_SUPPLIED_SRN",
  "tradeName": "YOUR_DEVICE_NAME",
  "maxDevices": 10,
  "maxManufacturers": 3,
  "maxRepresentatives": 3
}
```

The workflow:

1. Query Primary DI first, then Basic UDI, then each supplied name/reference independently with exact local matching. A stale name cannot suppress an exact UDI result.
2. Look up the supplied actor and its returned device portfolio.
3. Use the strongest nonempty route as target candidates, record conflicts with other supplied fields, and preserve alternative route candidates. Read manufacturer SRNs from target candidates and inspect their actors and bounded portfolios.
4. Verify authorised representatives for the selected evidence records.
5. Decode reference values and list the controlled documents still unverified.
6. Return query provenance, failures, omitted counts and unknown upstream coverage.

`targetEvidence` contains only target candidates from the strongest nonempty identity route. `portfolioEvidence` contains other manufacturer records and must not be attributed to the target. `evidence` remains a compatibility alias for **target evidence only**. Manufacturer-only investigations have no target evidence.

`searches` retains each independent query. `conflicts` records supplied-versus-observed disagreements; `alternativeCandidates` retains other search-route matches. `identityStatus` distinguishes identifier matches, candidates, ambiguity, conflicts, not-found, unresolved and portfolio-only results. Multiple versions remain separate candidates; the server does not automatically choose the latest. Missing operator identities and unmatched actor lookups appear in `unresolved`.

`status: "completed"` means execution completed, not that identity, documents or conformity have been established. `partial`, `timed-out` and `cancelled` retain gathered evidence and its limits. The concise report lists target identity, decoded fields, evidence gaps, conflicts, failures, bounds and next documents needed. Detailed records remain available in structured output.

## Prompts and resources

Each prompt takes a required `query` string containing known identifiers, names or the investigation question. Prompts supply procedures; they do not fetch data themselves.

| Prompt                   | Workflow                                                                |
| ------------------------ | ----------------------------------------------------------------------- |
| `investigate_device`     | Device identity, actual manufacturer, representatives and evidence gaps |
| `manufacturer_portfolio` | Verify an operator and inspect its bounded returned portfolio           |
| `conformity_evidence`    | Prepare a document checklist while preserving unverified claims         |

Readable resources:

- `eudamed://guides/search`
- `eudamed://guides/evidence`
- `eudamed://prompts/investigate_device`
- `eudamed://prompts/manufacturer_portfolio`
- `eudamed://prompts/conformity_evidence`

## Understand the evidence

| Output                                   | Meaning                                                                                |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `sourceUrl`, `retrievedAt`, `apiVersion` | Query and observation time; cached observations retain their original time             |
| `returnedByApi`                          | Records in this response, not a total registry count                                   |
| `matched`                                | Records left after local matching                                                      |
| `returned`, `truncated`                  | Local output count and whether this response was locally capped                        |
| `coverage: "unknown"`                    | Registry coverage and individual-record freshness are not established                  |
| `decoded.FIELD`                          | Raw numeric ID, translated label and resolved/unresolved status                        |
| `pagination`                             | Pages fetched, source page URLs and whether the query exhausted its continuation links |
| `flags`                                  | `true`, `false` or `null` for unknown/unrecognized values                              |
| `intendedPurpose.status`                 | `public-record` or `missing`; neither verifies a controlled current IFU                |
| `documents`                              | Explicitly unverified IFU, declaration and certificate evidence; no fabricated URLs    |
| Investigation `failures`                 | Failed steps, distinct from successful empty searches                                  |

An empty search is evidence about that query. It is not proof that the device does not exist or is non-compliant. An ISO 13485 certificate addresses a quality-management system; it does not replace product-specific documentation. See [the evidence workflow](docs/evidence-workflow.md).

## Configuration and bounds

| Environment variable         | Default                                                   | Range / purpose                                        |
| ---------------------------- | --------------------------------------------------------- | ------------------------------------------------------ |
| `EUDAMED_BASE_URL`           | `https://api.datalake.sante.service.ec.europa.eu/eudamed` | HTTPS endpoint, without credentials, query or fragment |
| `EUDAMED_API_VERSION`        | `v1.0`                                                    | Version string such as `v1.0`                          |
| `EUDAMED_TIMEOUT_MS`         | `15000`                                                   | 1–120000; each request attempt including body reads    |
| `EUDAMED_MAX_PAGES`          | `10`                                                      | 1–50 pages per query; combined record cap 10,000       |
| `EUDAMED_MAX_RETRIES`        | `2`                                                       | 0–3 retries after the initial attempt                  |
| `EUDAMED_CACHE_TTL_MS`       | `60000`                                                   | 0–86400000; device/actor response TTL                  |
| `EUDAMED_REFERENCE_TTL_MS`   | `3600000`                                                 | 0–86400000; reference response TTL                     |
| `EUDAMED_MAX_RESPONSE_BYTES` | `10000000`                                                | 1–50000000; streamed body cap                          |

Requests are serialized. The cache holds at most 32 validated responses and stores only projected actor data. References are joined using `CODE + ID` within the requested language. Redirects are rejected. GET retries apply to network failures, timeouts, HTTP 429 and 500/502/503/504. Retry-After is honored; a cooldown over 30 seconds ends the request instead of retrying early.

Device output defaults to 20 records (maximum 100), references to 100 (maximum 500). Investigation defaults to up to 10 records per identity query, 10 target records, 10 separate portfolio-context records, 10 alternative candidates, 3 discovered manufacturers and 3 representatives; maxima are 20 records per group and 5 operators per category. Representative lookups concern targets, or portfolio records when no target identity was supplied. The HTTP adapter rejects queries with over 10,000 combined records and follows only validated continuation links within the page cap. MCP output is capped at 250 KB; narrow the query or reduce limits if exceeded. These are **local safeguards**, not claims about upstream pagination. An investigation can perform multiple sequential requests and retries; `deadlineMs` limits the whole investigation (default 60000, maximum 300000), including queue waits, retries and body reads. MCP cancellation stops queued requests, active fetches and retry waits. Other requests remain usable. The library accepts `{ signal }` as a separate request-options argument.

## Development and verification

```bash
npm ci
npm run lint
npm run format:check
npm run typecheck
npm run test:coverage
npm run test:stdio
npm pack --dry-run
```

Unit and MCP protocol tests are deterministic and use synthetic data. Built stdio checks verify transport initialization, discovery, resources and validation without live network access. Coverage gates include the adapter, investigation and MCP registrations.

Live checks are opt-in:

```bash
npm run test:live
EUDAMED_SMOKE_PRIMARY_DI=YOUR_KNOWN_UDI EUDAMED_SMOKE_ACTOR_ID=YOUR_KNOWN_SRN npm run test:live
```

The first command verifies reference data. `EUDAMED_SMOKE_LANGUAGE` selects a reference language (default `en`); `EUDAMED_SMOKE_EXPECT_LEGISLATION` optionally asserts a known substring such as `2017/746` in the decoded legislation label. Supply both identifiers to exercise live device and actor lookups too. Live data can change; a failed check requires investigation rather than automatically rewriting fixtures. Payloads and actor contacts are not logged.

See [CONTRIBUTING.md](CONTRIBUTING.md), [API contract notes](docs/api-contract.md), and [SECURITY.md](SECURITY.md).

## API scope

Implemented: anonymous JSON GETs to `/udi`, `/actors` and `/reference`, verified against the live service on 14 October 2026. The [DG SANTE API catalogue](https://developer.datalake.sante.service.ec.europa.eu/api-details#api=94b9e658-d721-4b58-8d96-022c490f7a17&operation=411c8f92-26fa-4451-9377-7a13b5d17915) is the upstream reference.

Not implemented: certificate-portal scraping, IFU downloads, writes, bulk registry export or legal-rule evaluation. Pagination follows documented nextLink values. Rate limits, actual record freshness and uptime commitments remain unverified. This package covers the supplied public API integration scope, not every EUDAMED module.

MIT licensed.

## Company discovery and full UDI inputs

Call `eudamed_discover_actors` with a company name. It queries legal and abbreviated names independently, deduplicates identical organizational projections and preserves distinct candidates. Confirm the country, role and legal identity before using a candidate SRN with `eudamed_investigate`. A company portfolio remains separate from a particular device's evidence.

The Data Lake requires an exact registered name in observed name queries. A shortened name can return no matches even when the public portal finds the company. Follow `portalUrl` in a browser for partial-name discovery, then verify the returned SRN with `eudamed_actors`. This server does not automatically browse the portal. [Coverage and source details](docs/coverage.md).

`manufacturerSrn` requires the form `US-MF-000000001` (synthetic example), not a company name. `actorId` accepts economic-operator SRNs or four-digit notified body IDs. Validation checks syntax, not registration existence.

`primaryDi` also accepts a parenthesized GS1 UDI starting with `(01)` and a valid 14-digit GTIN, for example `(01)00012345678905(10)TESTLOT`. Only the DI is sent to the API; production identifiers are not query filters. `identifier` preserves the original input, extracted DI, recognized format and whether it changed. Invalid or ambiguous `(01)` fields are rejected. Raw DIs, including legacy identifiers, remain strings and are not padded or coerced. This is DI extraction, not validation of every UDI production field or a universal HIBCC/ICCBBA/barcode parser. See [GS1 application identifiers](https://www.gs1.org/gs1-application-identifiers).

## Installation and workflow verification

`npm run test:package` packs the actual artifact, installs it into a clean temporary project, imports the library and exercises the installed executable over MCP stdio. It requires npm registry access for dependencies.

See [maintenance](docs/maintenance.md) for scheduled contract checks and handling API changes.

## Independence and attribution

EUDAMED MCP is an independent, unofficial open-source project. It is **not developed, commissioned, endorsed or supported by the European Commission**, and is not affiliated with the European Commission.

The header reproduces the [European Commission logo supplied by the EUDAMED portal](https://ec.europa.eu/tools/eudamed/assets/images/ecl/ec/logo/logo-ec--en.svg), with an adjacent EUDAMED label. The logo remains the property of its respective owner and is not covered by this project’s MIT license.

EUDAMED is the European Commission’s European Database on Medical Devices. References to EUDAMED identify the public service this project integrates with; they do not imply official status or endorsement. For official information, visit the [European Commission’s EUDAMED website](https://health.ec.europa.eu/medical-devices-eudamed/overview_en).

Public database records do not independently establish a device’s conformity. This software provides research assistance, not a regulatory determination.
