# Contributing

Use Node.js 22 or later and install with `npm ci`. Keep API calls in the adapter, evidence normalization independent of transport, and MCP registrations thin. Inspect real public response shapes before changing schemas. Use synthetic fixtures in tests; never commit contact information, credentials or captured private records.

Before submitting a change, run:

```bash
npm run lint
npm run format:check
npm run typecheck
npm run test:coverage
npm run test:stdio
npm run test:package
```

Tests should distinguish plausible failures: exact versus substring matches, wrong versus actual manufacturers, missing versus false flags, failed versus empty searches, same-ID reference values in different categories, stale names alongside exact UDIs, separate portfolio evidence, multiple versions, IVDR records, missing operators and cancellation during queued requests, fetches and retries. Transport tests must exercise MCP discovery and calls, not only registration functions.

Live smoke tests are optional and separate from CI. `npm run test:live` verifies references. Add `EUDAMED_SMOKE_PRIMARY_DI` and `EUDAMED_SMOKE_ACTOR_ID` for known public records to exercise all endpoints. Do not pin mutable live classifications as timeless facts.

## Release procedure

The source repository is https://github.com/t4dhg/mcp-eudamed. Before a first npm release, enable private vulnerability reporting and configure npm trusted publishing for the repository's `publish.yml` workflow. Do not claim directory listings or publication before verifying them live.

Update `package.json`, the lockfile, `server.json` and `src/version.ts` together. `server.json` is prepared registry metadata, not evidence of an existing listing. Run the checks above, inspect the actual tarball for secrets, unintended files and broken documentation links, and confirm the package imports without starting stdio. Use explicit git staging paths and inspect the staged diff.

The manual publishing workflow runs the checks and uses npm OIDC to **stage** the package. It does not make the package installable. A maintainer must separately review the staged artifact and approve it locally with npm's 2FA flow. Never paste an OTP or long-lived publishing token into an issue, log or configuration file.

After promotion, verify the published version and install path before changing the README's source-only installation guidance. Registry publication is a separate step after npm availability and ownership metadata have been verified.

### First publication and artifact verification

1. Approve the exact public repository destination and complete the leak review before the first push. Add repository/homepage/bugs metadata only for the verified destination. Run the complete verification gate on the final tree.
2. Verify the npm account with `npm whoami`. If it returns E401, authenticate locally with `npm login`; never paste authentication codes into chat or logs. A brand-new package needs an authenticated bootstrap before its trusted publisher can be configured. The current npm [staged publishing documentation](https://docs.npmjs.com/staged-publishing/) supports creating a new package by staging it. Use a distinct bootstrap prerelease version and tag so it does not occupy the intended release version. Keep it pending until CI has staged and a maintainer has promoted the actual release; rejecting the only pending version can remove the package setup and invalidate its trusted publisher. Never approve the bootstrap candidate. Do not substitute a long-lived token or direct publication for the workspace's CI staging policy.
3. Configure a stage-only GitHub trusted publisher for the verified repository, `publish.yml` and `npm-release` environment. The workflow configuration alone does not prove that trust exists. Keep final promotion restricted to a maintainer with 2FA.
4. Set a release date in CHANGELOG.md when actually cutting the release. Tag the verified commit `v<package-version>` and push it. The workflow refuses any ref that does not match the package version, checks the clean installation and stages the same tarball whose SHA1/integrity appear in its summary. Download `npm-release-candidate` for inspection.
5. Read the actual stage ID from the successful stage output. Run `npm stage view <stage-id>` and compare its package, version and shasum with `pack-manifest.json` and the workflow summary. Stop on a mismatch; do not approve an unknown artifact. OIDC can stage but cannot perform the human approval step.
6. The maintainer runs `npm stage approve <stage-id>` in an interactive local terminal, completing 2FA there. No OTP belongs in this repository or a conversation. Reject an unwanted candidate with `npm stage reject <stage-id>`.
7. Verify `npm view @t4dhg/mcp-eudamed version dist.shasum dist-tags --json`, compare the published shasum, and install that exact version into a fresh project. Only then advertise npm installation and publish the MCP registry listing. A staged package is not installable.
