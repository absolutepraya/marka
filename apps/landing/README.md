# `@karakeep/landing`

This is the Astro-based public landing site for Marka. The `@karakeep` package
scope is retained as an internal monorepo compatibility identifier.

## Local development

From the repository root:

```bash
pnpm --filter @karakeep/landing dev
```

Other useful commands:

```bash
pnpm --filter @karakeep/landing build
pnpm --filter @karakeep/landing verify
pnpm --filter @karakeep/landing preview
pnpm --filter @karakeep/landing lint
pnpm --filter @karakeep/landing format:fix
pnpm --filter @karakeep/landing typecheck
```

## Notes

- This package is separate from the main web app in `apps/web`.
- The local site origin defaults to `http://localhost:4321/`. Set
  `MARKA_LANDING_SITE_ORIGIN` only for a deliberate local build configuration.
- Landing media provenance and pending capture requirements are tracked in
  `marketing-assets/README.md` and `public/marketing/`.
- For product/docs/deploy workflow of this repository, start from the root `README.md` and `docs/operator-setup.md` instead.
