# Marka CLI

The npm package is `@absolutepraya/marka`. Its primary command is `marka`;
`karakeep` remains an alias for existing scripts.

## Install and connect

After the package has been published:

```bash
npm install --global @absolutepraya/marka
marka auth init
marka whoami
```

Create a key under **Settings > API Keys** in your Marka instance. Enter the
instance origin without `/api/v1` during authentication setup.

Configuration remains in `$XDG_CONFIG_HOME/karakeep/config.json` (or
`~/.config/karakeep/config.json`) for compatibility. The file has mode `0600`.
Existing `KARAKEEP_API_KEY` and `KARAKEEP_SERVER_ADDR` environment variables
remain supported. Keep API keys in local configuration or a secret store.

`marka whoami` exits unsuccessfully when access cannot be verified. An
unauthorized response prompts you to check the instance address and API key.

## Build locally

```bash
pnpm --filter @absolutepraya/marka build
node apps/cli/dist/index.mjs --help
```

The existing CLI publishing workflow builds this package for npm. Its trusted
publisher must be configured for `absolutepraya/marka` and
`.github/workflows/cli.yml` before a release is published. Package publication
is required before public installation instructions can be used.
