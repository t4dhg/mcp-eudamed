# Maintenance and upstream changes

The weekly **Public API contract** workflow checks reference decoding and optional known-device/actor lookups. Store public check identifiers in repository Actions variables (`EUDAMED_SMOKE_PRIMARY_DI`, `EUDAMED_SMOKE_ACTOR_ID`, `EUDAMED_SMOKE_ACTOR_NAME`), not source fixtures. Logs omit record payloads. Without those variables, only references are checked; a green run is not evidence that every endpoint works. GitHub's normal workflow notification settings control alerts.

Treat live failures separately from deterministic CI:

1. Inspect HTTP/timeout versus schema/identity failures. Retry a transient outage once; do not weaken assertions to make an outage green.
2. Compare the official API definition and user guide with a narrowly filtered response. Check each advertised continuation URL, field type and reference join. Do not dump actor contact fields into logs or issues.
3. Compare a positive control in the public portal. Record query, observation time, selected status/history filters and whether the search actually completed. A timeout is not a negative search.
4. Reproduce changed contracts with synthetic fixtures before modifying the adapter. Keep unknown values unknown and update compatibility notes.
5. Run deterministic checks, clean-package smoke and assistant evaluation when changing tool descriptions or workflows. Review explanations as well as structured assertions.

Dependabot proposes weekly npm and GitHub Actions updates. Review changes and CI; no automatic merging or publication is configured. Publish fixes through the staged release procedure in CONTRIBUTING.md. Never publish directly to work around a failing release gate.
