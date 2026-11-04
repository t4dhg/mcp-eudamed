# Changelog

## [0.2.0] - 2026-11-04

### Changed

- Migrate runtime validation from Zod 3 to patched Zod 4 and raise the MCP SDK floor. Exported schema-derived TypeScript types now use Zod 4; the runtime still requires Node 22 or later. Use Node 24 for development.
- Refresh runtime and development dependency locks, upgrade lint tooling with scoped minimatch overrides and align Vitest with its coverage provider.

### Fixed

- Reject an oversized upstream record collection before visiting its elements, preserving existing response, pagination and output limits.
- Clean obsolete emitted files before building. Inspect the actual tarball for lifecycle declarations, missing entry points, test fixtures, nested archives and unintended configuration files.
- Enforce all-dependency audits and strict fresh-consumer checks in CI and release staging, including the installed library and credential-free stdio handshake, all five tools, resources, prompts, validation and shutdown.

## 0.1.1 - 2026-10-18

- Updated npm installation instructions, project presentation and EUDAMED header.
- Added prominent independent-project disclosure and European Commission attribution.
- Added package, compatibility and quality badges with CI-backed Codecov reporting.
- Added manual MCP registry publication using GitHub OIDC.

No runtime behavior changes.

## 0.1.0 - 2026-10-18

Initial release:

- Read-only device search, actor verification, company-name discovery, reference decoding and bounded evidence investigations.
- Exact legal/abbreviated company-name queries with candidate provenance and public-portal guidance for partial names.
- Role-aware SRN validation and extraction of valid parenthesized GS1 (01) identifiers, preserving original inputs.
- Validated continuation links, bounded pagination, retries, cancellation, caching and explicit coverage limits.
- Separate target and portfolio evidence, identity conflicts, document gaps and concise reports.
- Synthetic regression tests, autonomous assistant workflow evaluation and clean-package installation checks.
- Separate scheduled live API checks, dependency updates and staged release workflow.
