# Command Line Tool (CLI)

Marka provides a Node.js CLI for managing bookmarks, lists, and tags.
The command is `marka`; `karakeep` remains a compatibility alias.

## Features

- Manipulate bookmarks, lists and tags
- Mass import/export of bookmarks

## Installation (NPM)

```
npm install -g @absolutepraya/marka
```


## Upstream Docker alternative

This image provides the upstream Karakeep CLI, not the Marka npm build.

```
docker run --rm ghcr.io/karakeep-app/karakeep-cli:release --help
```

## Usage

```
marka
```

```
Usage: marka [options] [command]

Manage your Marka library from the command line

Options:
  --api-key <key>       the API key to interact with the API (env: KARAKEEP_API_KEY)
  --server-addr <addr>  the address of the server to connect to (env: KARAKEEP_SERVER_ADDR)
  --json                to output the result as JSON
  -V, --version         output the version number
  -h, --help            display help for command

Commands:
  auth                  authentication commands
  bookmarks             manipulating bookmarks
  lists                 manipulating lists
  tags                  manipulating tags
  whoami                returns info about the owner of this API key
  help [command]        display help for command
```

And some of the subcommands:

```
marka bookmarks
```

```
Usage: marka bookmarks [options] [command]

Manipulating bookmarks

Options:
  -h, --help             display help for command

Commands:
  add [options]          creates a new bookmark
  get <id>               fetch information about a bookmark
  update [options] <id>  updates bookmark
  list [options]         list all bookmarks
  delete <id>            delete a bookmark
  help [command]         display help for command

```

```
marka lists
```

```
Usage: marka lists [options] [command]

Manipulating lists

Options:
  -h, --help                 display help for command

Commands:
  list                       lists all lists
  delete <id>                deletes a list
  add-bookmark [options]     add a bookmark to list
  remove-bookmark [options]  remove a bookmark from list
  help [command]             display help for command
```

## Configure authentication

Create an API key in your instance under **Settings > API Keys**. Then run the
interactive setup in a private local terminal:

```bash
marka auth init
```

Enter the instance origin, such as `https://marka.example.com`, without the
`/api/v1` suffix, then enter the API key. The CLI writes its configuration to
`$XDG_CONFIG_HOME/karakeep/config.json`, or `~/.config/karakeep/config.json`
when `XDG_CONFIG_HOME` is unset. The file is created with mode `0600`; the CLI
does not encrypt the API key stored in it.

For unattended agents, configure `KARAKEEP_API_KEY` and
`KARAKEEP_SERVER_ADDR` in the agent host's secret or environment settings. The
server address is your instance origin. If omitted, the CLI defaults to
`https://cloud.karakeep.app`, so self-hosted users should set their own address.
Verify the connection with:

```bash
marka whoami
```

The CLI also accepts `--api-key`, but command-line arguments can be exposed in
shell history or process listings. Prefer `marka auth init` or the
environment variables for credential setup.


## Other clients

There also exists a **non-official**, community-maintained, python package called [karakeep-python-api](https://github.com/thiswillbeyourgithub/karakeep_python_api) that can be accessed from the CLI, but is **not** official.
