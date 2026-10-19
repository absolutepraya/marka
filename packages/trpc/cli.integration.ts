import { test, vi } from "vitest";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { PluginManager, PluginType } from "@karakeep/shared/plugins";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getInMemoryDB } from "@karakeep/db/drizzle";
import {
  users,
  bookmarkTranscripts,
  bookmarks,
  assets,
  AssetTypes,
  bookmarkLinks,
} from "@karakeep/db/schema";
import { generateApiKey, authenticateApiKey } from "./auth";
import { createCallerFactory } from "./index";
import type { Context } from "./index";
import { appRouter } from "./routers/_app";
import api from "../api/index";
import { saveAsset } from "@karakeep/shared/assetdb";
import { QuotaService } from "@karakeep/shared-server";
import type { ZApiKeyScope } from "@karakeep/shared/types/apiKeys";
import type { SearchOptions } from "@karakeep/shared/search";
import type { AddressInfo } from "node:net";

vi.mock("@karakeep/shared-server", async (original) => {
  const mod = await original<typeof import("@karakeep/shared-server")>();
  const mocks = Object.fromEntries(
    Object.keys(mod)
      .filter((k) => k.endsWith("Queue"))
      .map((k) => [
        k,
        {
          enqueue: vi.fn().mockResolvedValue("audit-job"),
          stats: vi.fn().mockResolvedValue({
            pending: 0,
            pending_retry: 0,
            running: 0,
            failed: 0,
          }),
          dequeue: vi.fn(),
        },
      ]),
  );
  return { ...mod, ...mocks, triggerSearchReindex: vi.fn() };
});
vi.mock("./email", () => ({
  sendListInvitationEmail: vi.fn().mockResolvedValue(true),
  sendInviteEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));
const execute = promisify(execFile);
const base = await mkdtemp(join(tmpdir(), "marka-cli-integration-"));
const binary =
  process.env.MARKA_CLI_BINARY ??
  new URL("../../apps/cli/dist/index.mjs", import.meta.url).pathname;
const binaries = { published: binary, source: binary };
function check(name: string, condition: boolean) {
  assert.equal(condition, true, name);
}

test("installed CLI preserves library data, permissions, revisions, and machine-readable results", async () => {
  await mkdir(`${base}/config`, { recursive: true });
  const db = getInMemoryDB(true);
  const seeded = await db
    .insert(users)
    .values([
      { name: "Audit owner", email: "audit-owner@example.test", role: "admin" },
      { name: "Audit collaborator", email: "audit-col@example.test" },
      { name: "Audit destination", email: "audit-dest@example.test" },
    ])
    .returning();
  const keys = await Promise.all(
    seeded.map((u) => generateApiKey("audit-only", u.id, db, ["fullaccess"])),
  );
  const ro = await generateApiKey("audit-read-only", seeded[0].id, db, [
    "bookmarks:read",
  ]);
  const ctx = (
    u: (typeof seeded)[number],
    scopes: ZApiKeyScope[] = ["fullaccess"],
  ): Context => ({
    db,
    user: u,
    auth: { type: "apiKey" as const, keyId: "audit", scopes },
    req: { ip: null },
  });
  const callers = seeded.map((u) => createCallerFactory(appRouter)(ctx(u)));
  const sessionCallers = seeded.map((u) =>
    createCallerFactory(appRouter)({
      ...ctx(u),
      auth: { type: "session" as const },
    }),
  );
  const app = new Hono<{ Variables: { ctx: Context } }>()
    .use("*", async (c, next) => {
      const key = c.req.header("authorization")?.replace(/^Bearer /, "");
      let auth: Awaited<ReturnType<typeof authenticateApiKey>> | undefined;
      try {
        auth = await authenticateApiKey(key ?? "", db);
      } catch {
        /* Invalid keys intentionally use an unauthenticated context. */
      }
      c.set(
        "ctx",
        auth
          ? {
              ...ctx(auth.user),
              auth: {
                type: "apiKey",
                keyId: auth.apiKey.keyId,
                scopes: auth.apiKey.scopes,
              },
            }
          : { db, user: null, auth: null, req: { ip: null } },
      );
      await next();
    })
    .route("/api", api);
  let failAssetDownload = false;
  let replaceArchiveOnPreflight: string | undefined;
  const server = createServer(async (req, res) => {
    try {
      if (
        replaceArchiveOnPreflight &&
        req.url?.includes("bookmarkPortability.capabilities")
      ) {
        await writeFile(
          replaceArchiveOnPreflight,
          "source archive replaced after validation",
        );
        replaceArchiveOnPreflight = undefined;
      }
      if (failAssetDownload && req.url?.startsWith("/api/assets/")) {
        res.writeHead(503);
        res.end("audit asset failure");
        return;
      }
      const chunks: Buffer[] = [];
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        for (const item of Array.isArray(value) ? value : value ? [value] : [])
          headers.append(key, item);
      }
      for await (const c of req) chunks.push(c);
      const response = await app.fetch(
        new Request(`http://127.0.0.1${req.url}`, {
          method: req.method,
          headers,
          ...(chunks.length
            ? {
                body: new Uint8Array(Buffer.concat(chunks)),
                duplex: "half" as const,
              }
            : {}),
        }),
      );
      res.writeHead(
        response.status,
        Object.fromEntries(response.headers.entries()),
      );
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function cli(
    args: string[],
    options: {
      key?: string;
      binary?: keyof typeof binaries;
      stdin?: string;
      expected?: number;
      name?: string;
    } = {},
  ) {
    const binary = options.binary ?? "published";
    const env = {
      ...process.env,
      XDG_CONFIG_HOME: `${base}/config`,
      KARAKEEP_API_KEY: options.key ?? keys[0].key,
      KARAKEEP_SERVER_ADDR: origin,
      NO_COLOR: "false",
    };
    let result: {
      code: string | number | undefined;
      stdout: string;
      stderr: string;
      killed?: boolean;
    };
    try {
      const pending = execute(process.execPath, [binaries[binary], ...args], {
        env,
        timeout: 15000,
        maxBuffer: 4 * 1024 * 1024,
      });
      pending.child.stdin?.end(options.stdin ?? "");
      result = { code: 0, ...(await pending) };
    } catch (error) {
      const e = error as Error & {
        code?: string | number;
        stdout?: string;
        stderr?: string;
        killed?: boolean;
      };
      result = {
        code: e.code,
        stdout: e.stdout ?? "",
        stderr: e.stderr ?? "",
        killed: e.killed,
      };
    }
    let json;
    try {
      json = JSON.parse(result.stdout);
    } catch {
      /* Commander usage errors may have empty stdout. */
    }

    const label =
      options.name ??
      args
        .map((a, i) => (args[i - 1] === "--dest-api-key" ? "TEST_KEY" : a))
        .join(" ");
    if (options.expected !== undefined)
      assert.equal(result.code, options.expected, label + " " + result.stderr);
    if (args.includes("--json") && result.code === 0)
      assert.notEqual(json, undefined, label + " must have JSON stdout");
    return { ...result, json };
  }
  try {
    for (const binary of ["source"] as const) {
      await cli(["--json", "whoami"], { binary, expected: 0 });
      await cli(["--json", "bookmarks", "list"], { binary, expected: 0 });
    }
    await cli(["whoami"], { key: "invalid-audit-only", expected: 1 });
    await cli(["--server-addr", origin + "/", "--json", "whoami"], {
      expected: 0,
      name: "Connection accepts a normal trailing slash",
    });
    await cli(
      [
        "auth",
        "init",
        "--server-addr",
        origin,
        "--api-key",
        "audit-fake-key",
        "--force",
      ],
      { expected: 0 },
    );
    const cfg = JSON.parse(
      await readFile(`${base}/config/karakeep/config.json`, "utf8"),
    );
    check(
      "auth saves supplied server/key",
      cfg.serverAddr === origin && cfg.apiKey === "audit-fake-key",
    );
    const l = (
      await cli(
        ["--json", "lists", "create", "--name", "Audit root", "--icon", "📚"],
        { expected: 0 },
      )
    ).json;
    const child = (
      await cli(
        [
          "--json",
          "lists",
          "create",
          "--name",
          "Child",
          "--icon",
          "📁",
          "--parent-id",
          l.id,
        ],
        { expected: 0 },
      )
    ).json;
    const smart = (
      await cli(
        [
          "--json",
          "lists",
          "create",
          "--name",
          "Smart",
          "--icon",
          "🔎",
          "--type",
          "smart",
          "--query",
          "is:fav",
        ],
        { expected: 0 },
      )
    ).json;
    await cli(["--json", "lists", "get", l.id], { expected: 0 });
    await cli(["--json", "lists", "list"], { expected: 0 });
    await cli(
      [
        "--json",
        "lists",
        "update",
        child.id,
        "--name",
        "Renamed",
        "--root",
        "--public",
      ],
      { expected: 0 },
    );
    const updated = await callers[0].lists.get({ listId: child.id });
    check(
      "explicit public and root fields persist",
      updated.public && updated.parentId === null,
    );
    await cli(
      ["--json", "lists", "update", child.id, "--description", "changed"],
      { expected: 0 },
    );
    check(
      "metadata edit retains public flag",
      (await callers[0].lists.get({ listId: child.id })).public === true,
    );
    const added = await cli(
      [
        "--json",
        "bookmarks",
        "add",
        "--text",
        "Audit original text",
        "--format",
        "plain",
        "--title",
        "Plain title",
        "--tag-name",
        "audit-tag",
        "--list-id",
        l.id,
      ],
      { expected: 0 },
    );
    const b = added.json[0];
    const actual = await callers[0].bookmarks.getBookmark({ bookmarkId: b.id });
    check(
      "add output includes persisted tags",
      JSON.stringify(added.json[0].tags) ===
        JSON.stringify(actual.tags.map((t) => t.name)),
    );
    const link = (
      await cli(
        [
          "--json",
          "bookmarks",
          "add",
          "--link",
          "https://www.youtube.com/watch?v=Audit12345",
          "--title",
          "Link",
        ],
        { expected: 0 },
      )
    ).json[0];
    await cli(["--json", "bookmarks", "add", "--note", "Legacy note"], {
      expected: 0,
    });
    await cli(["--json", "bookmarks", "get", b.id, "--include-content"], {
      expected: 0,
    });
    await cli(
      [
        "--json",
        "bookmarks",
        "update",
        b.id,
        "--note",
        "Metadata",
        "--archive",
        "--favourite",
      ],
      { expected: 0 },
    );
    await cli(
      ["--json", "bookmarks", "update", b.id, "--title", "Preserve flags"],
      { expected: 0 },
    );
    check(
      "metadata edit retains archive and favourite",
      (await callers[0].bookmarks.getBookmark({ bookmarkId: b.id }))
        .archived === true &&
        (await callers[0].bookmarks.getBookmark({ bookmarkId: b.id }))
          .favourited === true,
    );
    await cli(
      ["--json", "bookmarks", "update", b.id, "--no-archive", "--no-favourite"],
      { expected: 0 },
    );
    await cli(
      [
        "--json",
        "bookmarks",
        "check-url",
        "https://www.youtube.com/watch?v=Audit12345",
      ],
      { expected: 0 },
    );
    const pg = (
      await cli(["--json", "bookmarks", "list", "--limit", "1"], {
        expected: 0,
      })
    ).json;
    await cli(
      [
        "--json",
        "bookmarks",
        "list",
        "--limit",
        "1",
        "--cursor",
        pg.nextCursor,
      ],
      { expected: 0 },
    );
    const all = (
      await cli(["--json", "bookmarks", "list", "--limit", "1", "--all"], {
        expected: 0,
      })
    ).json;
    check(
      "bookmark all pagination has all 3 unique records",
      all.bookmarks.length === 3 &&
        new Set(all.bookmarks.map((b: { id: string }) => b.id)).size === 3,
    );
    await cli(["--json", "bookmarks", "list", "--cursor", "bad-cursor"], {
      expected: 1,
    });
    await cli(["bookmarks", "list", "--limit", "101"], { expected: 1 });
    await cli(["--json", "bookmarks", "search", "audit"], {
      expected: 1,
      name: "Search correctly fails when disposable server has no search plugin",
    });
    PluginManager.register({
      type: PluginType.Search,
      name: "CLI integration search",
      provider: {
        getClient: async () => ({
          addDocuments: async () => undefined,
          deleteDocuments: async () => undefined,
          clearIndex: async () => undefined,
          search: async (options: SearchOptions) => {
            const rows = await db.select().from(bookmarks);
            const filtered = rows.filter((row) =>
              (options.filter ?? []).every((filter) =>
                filter.type === "in"
                  ? filter.values.includes(row.id)
                  : (row as Record<string, unknown>)[filter.field] ===
                    filter.value,
              ),
            );
            return {
              hits: filtered
                .slice(
                  options.offset ?? 0,
                  (options.offset ?? 0) + (options.limit ?? 20),
                )
                .map((row) => ({ id: row.id, score: 1 })),
              totalHits: filtered.length,
              processingTimeMs: 0,
            };
          },
        }),
      },
    });
    const search = (
      await cli(
        ["--json", "bookmarks", "search", "Audit", "--all", "--limit", "1"],
        { expected: 0 },
      )
    ).json;
    check("search pagination", search.bookmarks.length === 3);
    const access = (
      await cli(["--json", "bookmarks", "content-access", b.id], {
        expected: 0,
      })
    ).json;
    await cli(
      [
        "--json",
        "bookmarks",
        "edit-content",
        b.id,
        "--text",
        "Changed body",
        "--base-version",
        String(access.textVersion),
      ],
      { expected: 0 },
    );
    await cli(
      [
        "--json",
        "bookmarks",
        "edit-content",
        b.id,
        "--text",
        "Stale overwrite",
        "--base-version",
        String(access.textVersion),
      ],
      { expected: 1 },
    );
    check(
      "stale edit preserves current body",
      (
        (await callers[0].bookmarks.getBookmark({ bookmarkId: b.id }))
          .content as { text: string }
      ).text === "Changed body",
    );
    await cli(
      [
        "--json",
        "bookmarks",
        "progress",
        "set",
        b.id,
        "--offset",
        "4",
        "--percent",
        "25",
      ],
      { expected: 0 },
    );
    await cli(["--json", "bookmarks", "progress", "get", b.id], {
      expected: 0,
    });
    await cli(
      [
        "--json",
        "bookmarks",
        "update-tags",
        b.id,
        "--add-tag",
        "new-tag",
        "--remove-tag",
        "audit-tag",
      ],
      { expected: 0 },
    );
    await cli(["--json", "tags", "list"], { expected: 0 });
    await cli(["--json", "tags", "get", "--name", "new-tag"], { expected: 0 });
    const tags = (await callers[0].tags.list({})).tags;
    await cli(
      [
        "--json",
        "tags",
        "merge",
        "--into",
        tags.find((t) => t.name === "new-tag")!.id,
        "--from",
        tags.find((t) => t.name === "audit-tag")!.id,
      ],
      { expected: 0 },
    );
    const extra = await callers[0].tags.create({ name: "delete-me" });
    await cli(["--json", "tags", "delete", extra.id], { expected: 0 });
    const h = (
      await cli(
        [
          "--json",
          "highlights",
          "create",
          "--bookmark",
          b.id,
          "--start",
          "0",
          "--end",
          "7",
          "--text",
          "Changed",
          "--color",
          "blue",
        ],
        { expected: 0 },
      )
    ).json;
    await cli(["--json", "highlights", "get", h.id], { expected: 0 });
    await cli(["--json", "highlights", "list", "--all", "--limit", "1"], {
      expected: 0,
    });
    await cli(["--json", "highlights", "list", "--bookmark", b.id], {
      expected: 0,
    });
    await cli(
      ["--json", "highlights", "search", "Changed", "--all", "--limit", "1"],
      { expected: 0 },
    );
    await cli(
      ["--json", "highlights", "update", h.id, "--note", "Annotation"],
      { expected: 0 },
    );
    await cli(["--json", "highlights", "update", h.id, "--clear-note"], {
      expected: 0,
    });
    await cli(["--json", "highlights", "delete", h.id], { expected: 0 });
    await db.insert(bookmarkTranscripts).values({
      bookmarkId: link.id,
      provider: "youtube",
      providerItemId: "audit",
      status: "ready",
      sourceTranscript: "Source transcript",
      text: "Source transcript",
      revision: 0,
    });
    await cli(["--json", "transcripts", "get", link.id], { expected: 0 });
    await cli(
      [
        "--json",
        "transcripts",
        "update",
        link.id,
        "--text",
        "Working transcript",
        "--expected-revision",
        "0",
      ],
      { expected: 0 },
    );
    await cli(
      [
        "--json",
        "transcripts",
        "update",
        link.id,
        "--text",
        "Stale transcript",
        "--expected-revision",
        "0",
      ],
      { expected: 1 },
    );
    await cli(["--json", "transcripts", "reset", link.id], { expected: 1 });
    await cli(["--json", "transcripts", "reset", link.id, "--yes"], {
      expected: 0,
    });
    await cli(["--json", "transcripts", "retry", link.id], { expected: 0 });
    await cli(
      [
        "--json",
        "lists",
        "add-bookmark",
        "--list",
        child.id,
        "--bookmark",
        b.id,
      ],
      { expected: 0 },
    );
    await cli(
      [
        "--json",
        "lists",
        "remove-bookmark",
        "--list",
        child.id,
        "--bookmark",
        b.id,
      ],
      { expected: 0 },
    );
    await cli(
      ["--json", "lists", "merge", "--source", child.id, "--target", l.id],
      { expected: 0, name: "merge empty manual source should succeed" },
    );
    await cli(
      ["lists", "add-bookmark", "--list", child.id, "--bookmark", b.id],
      { expected: 0 },
    );
    await cli(
      ["--json", "lists", "merge", "--source", child.id, "--target", l.id],
      { expected: 0 },
    );
    const invite = (
      await cli(
        [
          "--json",
          "lists",
          "collaborators",
          "invite",
          l.id,
          "--email",
          seeded[1].email!,
          "--role",
          "editor",
          "--recursive",
        ],
        { expected: 0 },
      )
    ).json;
    await sessionCallers[1].lists.acceptInvitation({
      invitationId: invite.invitationId,
    });
    await cli(["--json", "lists", "collaborators", "list", l.id], {
      expected: 0,
    });
    await cli(
      [
        "--json",
        "lists",
        "collaborators",
        "update-role",
        l.id,
        "--user-id",
        seeded[1].id,
        "--role",
        "viewer",
      ],
      { expected: 0 },
    );
    const ver = (
      await callers[0].bookmarks.getContentPermissions({ bookmarkId: b.id })
    ).textVersion;
    await cli(
      [
        "--json",
        "bookmarks",
        "edit-content",
        b.id,
        "--text",
        "Illegal shared edit",
        "--base-version",
        String(ver),
      ],
      { key: keys[1].key, expected: 1 },
    );
    await callers[0].bookmarks.grantContentEditor({
      bookmarkId: b.id,
      userId: seeded[1].id,
    });
    await cli(
      [
        "--json",
        "bookmarks",
        "edit-content",
        b.id,
        "--text",
        "Authorized shared edit",
        "--base-version",
        String(ver),
      ],
      { key: keys[1].key, expected: 0 },
    );
    await cli(
      [
        "--json",
        "bookmarks",
        "update",
        b.id,
        "--title",
        "Illegal shared metadata",
      ],
      { key: keys[1].key, expected: 1 },
    );
    await cli(
      [
        "--json",
        "lists",
        "collaborators",
        "remove",
        l.id,
        "--user-id",
        seeded[1].id,
      ],
      { expected: 0 },
    );
    await cli(["--json", "bookmarks", "get", b.id], {
      key: keys[1].key,
      expected: 1,
    });
    await cli(["--json", "bookmarks", "get", b.id], {
      key: ro.key,
      expected: 0,
    });
    await cli(
      [
        "--json",
        "bookmarks",
        "update",
        b.id,
        "--title",
        "Illegal read-only update",
      ],
      { key: ro.key, expected: 1 },
    );
    await cli(["--json", "lists", "list"], { key: ro.key, expected: 1 });
    await cli(["--json", "admin", "users", "list"], { expected: 0 });
    await cli(["--json", "admin", "users", "list"], {
      key: keys[1].key,
      expected: 1,
    });
    await cli(["--json", "admin", "bookmarks", "debug", link.id], {
      expected: 0,
    });
    for (const command of [
      "recrawl",
      "reindex",
      "regenerate-embedding",
      "retag",
      "resummarize",
    ])
      await cli(["--json", "admin", "bookmarks", command, link.id], {
        expected: 0,
      });
    await cli(["--json", "admin", "jobs", "stats"], { expected: 0 });
    for (const command of [
      "recrawl-links",
      "retag-all",
      "resummarize-all",
      "regenerate-embeddings",
    ])
      await cli(["--json", "admin", "jobs", command, "--status", "all"], {
        expected: 0,
      });
    for (const command of ["reindex-all", "reprocess-assets"])
      await cli(["--json", "admin", "jobs", command], { expected: 0 });
    const pdf = `${base}/sample.pdf`;
    await writeFile(
      pdf,
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n",
    );
    const _asset = (
      await cli(["--json", "bookmarks", "add", "--asset", pdf], { expected: 0 })
    ).json?.[0];
    await callers[0].highlights.create({
      bookmarkId: b.id,
      startOffset: 0,
      endOffset: 10,
      text: "Authorized",
      note: "Preserve annotation",
      color: "green",
    });
    await callers[0].feeds.create({
      name: "Audit feed",
      url: "https://example.test/feed.xml",
      enabled: false,
      importTags: true,
    });
    const curated = (await callers[0].tags.list({})).tags.find(
      (tag) => tag.name === "new-tag",
    )!;
    await callers[0].users.updateSettings({ curatedTagIds: [curated.id] });
    const transcript = await db.query.bookmarkTranscripts.findFirst({
      where: eq(bookmarkTranscripts.bookmarkId, link.id),
    });
    assert.ok(transcript);
    const binaryFixtures = [
      {
        id: "caption-fixture",
        type: AssetTypes.CAPTION_SOURCE,
        mime: "text/vtt",
        name: "source.vtt",
        body: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nSaved caption\n",
        transcriptId: transcript.id,
      },
      {
        id: "html-fixture",
        type: AssetTypes.LINK_HTML_CONTENT,
        mime: "text/html",
        name: "page.html",
        body: "<html><body>Preserved cached page</body></html>",
        transcriptId: null,
      },
      {
        id: "archive-fixture",
        type: AssetTypes.LINK_FULL_PAGE_ARCHIVE,
        mime: "text/html",
        name: "archive.html",
        body: "<html><body>Preserved full page archive</body></html>",
        transcriptId: null,
      },
    ];
    for (const fixture of binaryFixtures) {
      const bytes = Buffer.from(fixture.body);
      const quotaApproved = await QuotaService.checkStorageQuota(
        db,
        seeded[0].id,
        bytes.length,
      );
      await saveAsset({
        userId: seeded[0].id,
        assetId: fixture.id,
        asset: bytes,
        metadata: { contentType: fixture.mime, fileName: fixture.name },
        quotaApproved,
      });
      await db.insert(assets).values({
        id: fixture.id,
        userId: seeded[0].id,
        bookmarkId: link.id,
        transcriptId: fixture.transcriptId,
        assetType: fixture.type,
        contentType: fixture.mime,
        fileName: fixture.name,
        size: bytes.length,
      });
    }
    await db
      .update(bookmarkLinks)
      .set({
        contentAssetId: "html-fixture",
        htmlContent: binaryFixtures[1].body,
      })
      .where(eq(bookmarkLinks.id, link.id));
    const dump = await cli(
      ["--json", "dump", "--output", `${base}/audit-dump.tar.gz`],
      { expected: 0 },
    );
    assert.equal(dump.json.version, 2);
    assert.equal(dump.json.counts.highlights, 1);
    assert.equal(dump.json.counts.transcripts, 1);
    const before = await callers[0].bookmarks.getBookmark({ bookmarkId: b.id });
    await cli(
      [
        "--json",
        "migrate",
        "--dest-server",
        origin,
        "--dest-api-key",
        keys[2].key,
        "--yes",
        "--batch-size",
        "1",
      ],
      { expected: 0 },
    );
    const migrated = (
      await callers[2].bookmarks.getBookmarks({ includeContent: true })
    ).bookmarks;
    const migratedText = migrated.find((x) => x.title === before.title);
    check(
      "migration preserves plain text format",
      migratedText?.content.type === "text" &&
        before.content.type === "text" &&
        migratedText.content.format === before.content.format,
    );
    check("migration preserves all 4 bookmark records", migrated.length === 4);
    check(
      "migration preserves reading progress",
      (
        await callers[2].bookmarks.getReadingProgress({
          bookmarkId: migratedText!.id,
        })
      )?.readingProgressOffset === 4,
    );
    check(
      "migration preserves highlights",
      (await callers[2].highlights.getAll({ limit: 20 })).highlights.length ===
        1,
    );
    check(
      "migration preserves feed importTags",
      (await callers[2].feeds.list()).feeds[0].importTags === true,
    );
    check(
      "migration preserves transcripts",
      (await callers[2].transcripts.get({
        bookmarkId: migrated.find((x) => x.content.type === "link")!.id,
      })) !== null,
    );
    const targetTags = (await callers[2].tags.list({})).tags;
    assert.deepEqual((await callers[2].users.settings()).curatedTagIds, [
      targetTags.find((tag) => tag.name === "new-tag")!.id,
    ]);
    const migratedLink = migrated.find((x) => x.content.type === "link")!;
    assert.equal(
      (await db.query.bookmarkLinks.findFirst({
        where: eq(bookmarkLinks.id, migratedLink.id),
      }))!.htmlContent,
      null,
    );
    const migratedTranscript = await callers[2].transcripts.get({
      bookmarkId: migratedLink.id,
    });
    assert.equal(migratedTranscript?.sourceAttachments.length, 1);
    for (const fixture of binaryFixtures) {
      const id: string =
        fixture.type === AssetTypes.CAPTION_SOURCE
          ? migratedTranscript!.sourceAttachments[0].id
          : fixture.type === AssetTypes.LINK_FULL_PAGE_ARCHIVE
            ? (await db.query.assets.findFirst({
                where: (asset, { and, eq }) =>
                  and(
                    eq(asset.bookmarkId, migratedLink.id),
                    eq(asset.assetType, AssetTypes.LINK_FULL_PAGE_ARCHIVE),
                  ),
              }))!.id
            : (migratedLink.content as { contentAssetId: string })
                .contentAssetId;
      assert.notEqual(id, fixture.id);
      const response: Response = await fetch(`${origin}/api/assets/${id}`, {
        headers: { authorization: `Bearer ${keys[2].key}` },
      });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), fixture.body);
    }
    failAssetDownload = true;
    const assetFail = await cli([
      "migrate",
      "--dest-server",
      origin,
      "--dest-api-key",
      keys[2].key,
      "--yes",
      "--exclude-lists",
      "--exclude-tags",
      "--exclude-feeds",
      "--exclude-rules",
      "--exclude-ai-prompts",
      "--exclude-webhooks",
      "--exclude-user-settings",
    ]);
    check("asset migration failure returns nonzero", assetFail.code !== 0);
    failAssetDownload = false;
    await cli(["--json", "lists", "delete", smart.id], { expected: 0 });
    await cli(["--json", "bookmarks", "delete", link.id], { expected: 0 });
    await cli(["--json", "wipe", "--yes"], { key: keys[2].key, expected: 0 });
    check(
      "wipe removes destination bookmarks",
      (await callers[2].bookmarks.getBookmarks({})).bookmarks.length === 0,
    );
    const corruptRoot = join(base, "corrupt");
    await mkdir(corruptRoot);
    await execute(
      "tar",
      ["-xzf", `${base}/audit-dump.tar.gz`, "-C", corruptRoot],
      { env: { ...process.env, COPYFILE_DISABLE: "1" } },
    );
    const cached = await readFile(join(corruptRoot, "assets/html-fixture"));
    await writeFile(
      join(corruptRoot, "assets/html-fixture"),
      Buffer.alloc(cached.length, 65),
    );
    const corruptArchive = join(base, "corrupt.tar.gz");
    await execute(
      "tar",
      [
        "-czf",
        corruptArchive,
        "-C",
        corruptRoot,
        "manifest.json",
        "account.json",
        "bookmarks",
        "assets",
      ],
      { env: { ...process.env, COPYFILE_DISABLE: "1" } },
    );
    const corrupted = await cli(
      ["--json", "restore", corruptArchive, "--yes"],
      { key: keys[2].key, expected: 1 },
    );
    assert.match(corrupted.stderr, /checksum mismatch/);
    assert.equal(
      (await callers[2].bookmarks.getBookmarks({})).bookmarks.length,
      0,
    );
    assert.equal((await callers[2].lists.list()).lists.length, 0);
    // Alter genuine archive headers to exercise duplicate, link, traversal,
    // unexpected-path, and oversized-member rejection before any API writes.
    const originalTar = gunzipSync(await readFile(`${base}/audit-dump.tar.gz`));
    // macOS tar can put a PAX header before the first regular file.
    let manifestOffset = 0;
    while (
      originalTar
        .subarray(manifestOffset, manifestOffset + 100)
        .toString()
        .split("\0", 1)[0] !== "manifest.json"
    ) {
      const size = parseInt(
        originalTar
          .subarray(manifestOffset + 124, manifestOffset + 136)
          .toString()
          .split("\0", 1)[0]
          .trim(),
        8,
      );
      assert.ok(Number.isFinite(size) && manifestOffset < originalTar.length);
      manifestOffset += 512 + Math.ceil(size / 512) * 512;
    }
    const manifestTar = originalTar.subarray(manifestOffset);
    const firstSize = parseInt(
      manifestTar.subarray(124, 136).toString().split("\0", 1)[0].trim(),
      8,
    );
    const firstMember = manifestTar.subarray(
      0,
      512 + Math.ceil(firstSize / 512) * 512,
    );
    for (const [kind, path, type, size] of [
      ["link", "assets/unsafe", "2", 0],
      ["traversal", "../outside", "0", 0],
      ["unexpected", "unexpected.txt", "0", 0],
      ["oversized", "assets/oversized", "0", 256 * 1024 * 1024 + 1],
      ["duplicate", "manifest.json", "0", firstSize],
    ] as const) {
      const header = Buffer.from(manifestTar.subarray(0, 512));
      header.fill(0, 0, 100);
      header.write(path, 0);
      header.fill(0, 124, 136);
      header.write(size.toString(8).padStart(11, "0"), 124);
      header.write(type, 156);
      if (kind === "link") header.write("/tmp/marka-outside", 157);
      header.fill(32, 148, 156);
      const checksum = header.reduce((sum, value) => sum + value, 0);
      header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148);
      const extra = kind === "duplicate" ? firstMember : header;
      const invalidPath = join(base, `${kind}.tar.gz`);
      await writeFile(
        invalidPath,
        gzipSync(Buffer.concat([extra, originalTar])),
      );
      const invalid = await cli(["--json", "restore", invalidPath, "--yes"], {
        key: keys[2].key,
        expected: 1,
      });
      assert.match(invalid.stderr, /archive member|size limit/i);
      assert.equal(
        (await callers[2].bookmarks.getBookmarks({})).bookmarks.length,
        0,
      );
      assert.equal((await callers[2].lists.list()).lists.length, 0);
    }
    await writeFile(
      join(corruptRoot, "manifest.json"),
      JSON.stringify({ format: "karakeep.dump", version: 1, complete: true }),
    );
    await execute(
      "tar",
      ["-czf", corruptArchive, "-C", corruptRoot, "manifest.json"],
      { env: { ...process.env, COPYFILE_DISABLE: "1" } },
    );
    await cli(["--json", "restore", corruptArchive, "--yes"], {
      key: keys[2].key,
      expected: 1,
    });
    assert.equal(
      (await callers[2].bookmarks.getBookmarks({})).bookmarks.length,
      0,
    );
    await writeFile(
      join(corruptRoot, "manifest.json"),
      JSON.stringify({
        format: "karakeep.dump",
        version: 2,
        complete: true,
        exclusions: [],
        counts: { bookmarks: 0, assets: 0, highlights: 0, transcripts: 0 },
        assetSha256: {},
      }),
    );
    await writeFile(
      join(corruptRoot, "account.json"),
      JSON.stringify({ json: { account: {}, membership: {} } }),
    );
    await writeFile(join(corruptRoot, "bookmarks/state.jsonl"), "");
    const emptyArchive = join(base, "empty.tar.gz");
    await execute(
      "tar",
      [
        "-czf",
        emptyArchive,
        "-C",
        corruptRoot,
        "manifest.json",
        "account.json",
        "bookmarks",
      ],
      { env: { ...process.env, COPYFILE_DISABLE: "1" } },
    );
    const emptyRestore = await cli(
      ["--json", "restore", emptyArchive, "--yes"],
      { key: keys[2].key, expected: 0 },
    );
    assert.equal(emptyRestore.json.restored, 0);

    const stagedArchive = join(base, "replace-during-import.tar.gz");
    await writeFile(stagedArchive, await readFile(`${base}/audit-dump.tar.gz`));
    replaceArchiveOnPreflight = stagedArchive;
    const restored = await cli(["--json", "restore", stagedArchive, "--yes"], {
      key: keys[2].key,
      expected: 0,
    });
    assert.equal(restored.json.restored, 4);
    assert.equal(replaceArchiveOnPreflight, undefined);
    assert.equal(
      await readFile(stagedArchive, "utf8"),
      "source archive replaced after validation",
    );
    const restoredBookmarks = (
      await callers[2].bookmarks.getBookmarks({ includeContent: true })
    ).bookmarks;
    assert.equal(restoredBookmarks.length, 4);
    const restoredText = restoredBookmarks.find(
      (x) => x.content.type === "text" && x.title === before.title,
    )!;
    assert.equal((restoredText.content as { format: string }).format, "plain");
    assert.equal(
      (
        await callers[2].bookmarks.getReadingProgress({
          bookmarkId: restoredText.id,
        })
      ).readingProgressOffset,
      4,
    );
    assert.equal((await callers[2].highlights.getAll({})).highlights.length, 1);
    assert.ok(
      await callers[2].transcripts.get({
        bookmarkId: restoredBookmarks.find((x) => x.content.type === "link")!
          .id,
      }),
    );
    await cli(["--json", "wipe", "--yes"], { key: keys[2].key, expected: 0 });

    const stdinBookmark = (
      await cli(
        ["--json", "bookmarks", "add", "--stdin", "--format", "plain"],
        { stdin: "Piped body", expected: 0 },
      )
    ).json[0];
    check(
      "stdin creation preserves body",
      stdinBookmark.content.text === "Piped body",
    );
    await writeFile(base + "/edit.txt", "File body");
    const stdinAccess = (
      await callers[0].bookmarks.getContentPermissions({
        bookmarkId: stdinBookmark.id,
      })
    ).textVersion;
    await cli(
      [
        "--json",
        "bookmarks",
        "edit-content",
        stdinBookmark.id,
        "--file",
        base + "/edit.txt",
        "--base-version",
        String(stdinAccess),
      ],
      { expected: 0 },
    );
    await cli(
      [
        "--json",
        "bookmarks",
        "edit-content",
        stdinBookmark.id,
        "--stdin",
        "--base-version",
        String(stdinAccess + 1),
      ],
      { stdin: "Piped edit", expected: 0 },
    );
    await cli(
      [
        "--json",
        "bookmarks",
        "edit-content",
        stdinBookmark.id,
        "--text",
        "x",
        "--file",
        base + "/edit.txt",
        "--base-version",
        String(stdinAccess + 2),
      ],
      { expected: 1 },
    );
    const partial = await cli(
      [
        "--json",
        "bookmarks",
        "add",
        "--text",
        "Valid partial text",
        "--link",
        "not-a-url",
      ],
      { expected: 1 },
    );
    check(
      "partial add returns successful records with nonzero status",
      partial.json?.length === 1 && partial.code === 1,
    );
    await cli(
      [
        "bookmarks",
        "add",
        "--link",
        "https://example.test",
        "--format",
        "plain",
      ],
      { expected: 1 },
    );
    const tagRead = await generateApiKey("audit-read-tags", seeded[2].id, db, [
      "tags:read",
    ]);
    const tagFailure = await cli([
      "migrate",
      "--dest-server",
      origin,
      "--dest-api-key",
      tagRead.key,
      "--yes",
      "--exclude-bookmarks",
      "--exclude-lists",
      "--exclude-feeds",
      "--exclude-rules",
      "--exclude-ai-prompts",
      "--exclude-webhooks",
      "--exclude-user-settings",
    ]);
    check(
      "tag creation permission failures return nonzero",
      tagFailure.code !== 0,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(base, { recursive: true, force: true });
  }
}, 180000);
