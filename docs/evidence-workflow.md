# From a product name to an evidence checklist

Suppose a researcher has a product name and an SRN for a European company. The SRN returns a valid actor, but its device query is empty. That does not establish that the product is unregistered.

Use `eudamed_investigate` with both values. The workflow keeps the supplied actor separate, queries identifiers first and each supplied name separately, and follows the manufacturer SRNs in the actual candidate records. It then looks up those actors, their bounded portfolios and the authorised representatives for selected evidence records.

## Review identity first

Compare Primary UDI-DI, Basic UDI-DI, model, reference, manufacturer SRN and names. Related corporate names do not establish that two entities are the same legal manufacturer. Similar trade names do not establish that two models are equivalent. Keep multiple candidates until exact identifiers resolve them.

Inspect `targetEvidence` for target candidates. `portfolioEvidence` is separate discovery context, never target evidence. `searches`, `conflicts` and `alternativeCandidates` preserve independent identity routes and their disagreements. Each evidence record retains the source query that introduced it. Review `limits`, local truncation and failures before drawing conclusions about coverage. Even an uncapped local result has unknown upstream completeness.

## Separate evidence classes

| Class                     | What it can establish                                       | What remains open                                                  |
| ------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| Public actor record       | Listed organization, SRN, role and status                   | Product-specific conformity                                        |
| Public UDI record         | Returned identity, classification, operators and status     | Current controlled IFU, declaration and certificate scope          |
| Manufacturer statement    | What the manufacturer states                                | Whether the statement is the applicable controlled document        |
| Controlled IFU and label  | Documented intended use, revision, warnings and identifiers | Complete conformity-assessment evidence                            |
| Declaration of conformity | Manufacturer declaration for the identified device          | Any separately applicable notified-body evidence                   |
| Certificate and schedule  | Documented scope and status, after verification             | Coverage of an arbitrary marketed model without identifier linkage |
| ISO 13485 certificate     | Quality-management-system scope                             | Product MDR certification or declaration                           |
| Secondary source          | A lead or historical context                                | Current revision, authority and applicability                      |

The MCP verifies only the returned public API data. It does not fetch or authenticate the other evidence classes. Its document statuses deliberately remain `unverified`. A public `MEDICAL_PURPOSE` value is public-record text, not proof that the current controlled IFU was inspected.

## Produce a useful handoff

For each candidate, report:

1. Exact identifiers and legal operators.
2. Decoded fields with raw IDs, retaining unresolved labels.
3. Original query URLs, retrieval times and cache status.
4. Missing public fields and separately unverified documents.
5. Failed steps and locally omitted records/operators.
6. The next evidence needed: exact-model IFU and label, declaration, applicable conformity route, and any required certificate/schedule/status tied to the Basic UDI-DI.

Do not convert `null` to false. Do not infer reusable surgical-instrument status from the generic `REUSABLE` flag. Do not conclude non-compliance from an empty search or a missing certificate URL. Determining the applicable legal route requires current authoritative sources and details beyond this API.

A completed investigation is a traceable collection of public-record observations and open questions, not a regulatory verdict.

An overall deadline and client cancellation halt further calls. A `timed-out` or `cancelled` result retains evidence collected earlier; it must not be described as a completed investigation. The text report summarizes the detailed structured result.
