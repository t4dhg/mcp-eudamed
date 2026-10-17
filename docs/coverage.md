# Public API coverage and discovery

Sources checked on 2026-10-17:

- [European Commission Public API user guide, production 2.27.0](https://webgate.ec.europa.eu/eudamed-help/en/files/Public%20API%20-%20user%20guide.pdf)
- [Official OpenAPI definition](https://webgate.ec.europa.eu/eudamed-help/en/files/Swagger%20OpenAPI%20file.yaml)
- [Public actor search](https://ec.europa.eu/tools/eudamed/#/screen/search-eo) and [public device search](https://ec.europa.eu/tools/eudamed/#/screen/search-device)

The guide describes two-hour production synchronization and daily non-production synchronization. This is the documented schedule, not a measured service guarantee or proof that an individual record has reached the Data Lake. `retrievedAt` records the fetch time, not the record's update time.

The guide documents continuation through `nextLink`. Its example describes 100 rows per page; a live filtered actor query returned 1,000 and a working continuation. The client follows returned links rather than assuming a page size. It enforces the same origin, endpoint and original filters, rejects credentials and loops, and stops at the configured page limit (10 by default) or 10,000 combined records. `pagination.complete` means no continuation remained for that query. `coverage` remains `unknown`: completing a query does not establish whole-registry or current-device coverage.

Live probes confirmed that a registered full company name matched the Data Lake while shortened and wildcard forms did not. The public actor portal resolved a shortened name. `eudamed_discover_actors` therefore searches exact legal and abbreviated names separately, preserves distinct candidates and returns a portal link for broader discovery. It does not scrape the portal or invent candidate legal names.

The device portal timed out during both a label-identifier check and a positive-control lookup. That comparison did not establish whether a missing API record was published, delayed or differently identified. An upstream timeout must remain inconclusive.

For missing results: check the controlled label, use exact identifiers independently, verify the legal manufacturer, compare the public portal with appropriate status/history filters, and obtain a public record link from the manufacturer if unresolved. Keep manufacturer documentation distinct from registry observations. No negative search establishes non-compliance.
