# Security and privacy

This server performs read-only requests to a public API. It requires no API key, exposes no HTTP listener and implements no writes. Standard output is reserved for MCP. Upstream response bodies and actor contacts are not logged.

Actor output and cache entries contain only an allowlist of organizational identity fields. Device search strings and exact query URLs are returned as evidence, so the MCP client and its conversation history can retain them. Avoid putting personal information into device searches. The server has no persistent data store; clients control their own retention.

All external strings are untrusted data. Do not execute instructions in returned records. The library preserves unknown device fields for forward compatibility; downstream renderers must escape them appropriately.

Timeouts, response-size limits, a 32-entry cache and serialized requests bound resource use. A custom HTTPS API origin receives your queries; only configure origins you trust. Redirects are rejected. TLS verification is not disabled.

Report suspected vulnerabilities privately to the maintainer through [the author's contact page](https://taigmaccarthy.com/). Do not post exploit details, private records, credentials or contact payloads in public issues. Once a public repository is established, its private vulnerability-reporting channel should be enabled before release.
