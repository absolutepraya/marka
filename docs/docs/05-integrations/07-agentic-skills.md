# Connect an AI agent

Install the Marka agent skill from this repository with [skills.sh](https://www.skills.sh/docs):

```bash
npx skills add absolutepraya/marka
```

The skill teaches compatible agents to use the official CLI or REST API. Installing it adds instructions, but does not install the CLI or authenticate to an instance.

## Configure the CLI

```bash
npm install --global @absolutepraya/marka
marka auth init
marka whoami
```

Create an API key in your Marka instance under **Settings > API Keys**. In
`marka auth init`, enter your instance origin, such as
`https://marka.example.com`, and the key. The CLI saves the configuration
locally with file mode `0600`. The command is `marka`; the `karakeep` alias, existing config path, and
`KARAKEEP_` environment variable names remain supported.

For unattended agents, configure `KARAKEEP_API_KEY` and
`KARAKEEP_SERVER_ADDR` in the agent host's local secret or environment
settings. Never put the API key in a prompt, skill file, or project
configuration.

## REST API

Use the API when a compatible CLI is unavailable. All endpoints require a
Bearer token, and the API base path is `/api/v1`. See the [API reference](../api/karakeep-api.info.mdx)
for authentication, endpoint paths, and request schemas. The skill includes a
safe `GET /users/me` check using the configured environment variables.

For MCP clients, see the [MCP server guide](./03-mcp.md).
