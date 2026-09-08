# Santati TypeScript SDK

Monorepo for Santati client libraries. Built with pnpm, tsdown, Vitest, Biome, and Changesets.

## Packages

| Package | Description |
|---------|-------------|
| [`@santati/audit-log`](./packages/audit-log) | Write audit events to a sink and read them back server-side |

## Development

Requires Node.js >= 20 and pnpm >= 10.

```bash
pnpm install
pnpm verify    # lint + typecheck + test + build + publint + attw
```

## Release

This repo uses [Changesets](https://github.com/changesets/changesets) for versioning:

1. Add a changeset: `pnpm changeset`
2. Merge the "Version Packages" PR that Changesets opens on `main`
3. CI publishes to npm with provenance

Set `NPM_TOKEN` in GitHub repository secrets before the first publish.
