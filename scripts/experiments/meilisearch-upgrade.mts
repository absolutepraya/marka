// Synthetic compatibility probe. Never point this at an application instance.
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const endpoint = new URL(process.env.MEILI_ADDR ?? "");
assert.equal(endpoint.hostname, "127.0.0.1");
assert.ok(["17741", "17755", "17756"].includes(endpoint.port));
assert.equal(process.env.MEILI_INDEX_PREFIX, "upgrade_fixture_");
assert.equal(process.env.EMBEDDING_DIMENSIONS, "3");

const mode = process.argv[2];
assert.ok(["seed", "verify", "mutate"].includes(mode ?? ""));

const requirePlugin = createRequire(
  new URL("../../packages/plugins/package.json", import.meta.url),
);
const { Meilisearch } = requirePlugin("meilisearch");
const { MeiliSearchProvider } =
  await import("../../packages/plugins/search-meilisearch/src/index");
const { MeiliSearchVectorProvider } =
  await import("../../packages/plugins/vectorstore-meilisearch/src/index");
const raw = new Meilisearch({
  host: endpoint.toString(),
  apiKey: process.env.MEILI_MASTER_KEY,
});
const search = await new MeiliSearchProvider().getClient();
const vectors = await new MeiliSearchVectorProvider().getClient();
assert.ok(search);
assert.ok(vectors);
const docs = [
  {
    id: "a",
    userId: "alice",
    title: "Chromium browser architecture",
    content: "Isolation and screenshots",
    tags: ["browser"],
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "b",
    userId: "alice",
    title: "Chromium release notes",
    content: "Modern browser engine",
    tags: ["browser"],
    createdAt: "2026-02-01T00:00:00Z",
  },
  {
    id: "c",
    userId: "bob",
    title: "Chromium private notes",
    content: "Private tenant record",
    tags: [],
    createdAt: "2026-03-01T00:00:00Z",
  },
  {
    id: "d",
    userId: "alice",
    title: "Bahasa Indonesia 日本語 café",
    content: "Unicode retrieval",
    tags: [],
    createdAt: "2026-04-01T00:00:00Z",
  },
];
const vectorDocs = [
  { id: "a", userId: "alice", vector: [1, 0, 0] },
  { id: "b", userId: "alice", vector: [0.99, 0.1, 0] },
  { id: "c", userId: "bob", vector: [1, 0, 0] },
  { id: "d", userId: "alice", vector: [-1, 0, 0] },
];
if (mode === "seed") {
  await search.clearIndex();
  await vectors.clearIndex();
  await search.addDocuments(docs, { batch: false });
  await vectors.addVectors(vectorDocs);
}
const alice = [
  { type: "eq" as const, field: "userId" as const, value: "alice" },
];
const result = await search.search({
  query: "Chromium",
  filter: alice,
  sort: [{ field: "createdAt", order: "desc" }],
});
assert.deepEqual(
  result.hits.map((h) => h.id),
  ["b", "a"],
);
assert.equal(result.totalHits, 2);
assert.deepEqual(
  (
    await search.search({
      query: "Chromium",
      filter: alice,
      sort: [{ field: "createdAt", order: "asc" }],
      limit: 1,
      offset: 1,
    })
  ).hits.map((h) => h.id),
  ["b"],
);
assert.deepEqual(
  (await search.search({ query: "Chromium private", filter: alice })).hits,
  [],
);
assert.deepEqual(
  (
    await search.search({
      query: "Chromium",
      filter: [{ type: "in", field: "id", values: ["a", "b"] }],
    })
  ).hits
    .map((h) => h.id)
    .sort(),
  ["a", "b"],
);
assert.deepEqual(
  (await search.search({ query: "日本語", filter: alice })).hits.map(
    (h) => h.id,
  ),
  ["d"],
);
assert.deepEqual(
  (await search.search({ query: "cafe", filter: alice })).hits.map((h) => h.id),
  ["d"],
);
const semantic = await vectors.search({
  vector: [1, 0, 0],
  filter: alice,
  rankingScoreThreshold: 0.75,
});
assert.deepEqual(
  semantic.hits.map((h) => h.id),
  ["a", "b"],
);
assert.ok(semantic.hits.every((h) => h.score >= 0.75));
assert.deepEqual(
  (await vectors.findSimilar({ id: "a", filter: alice })).hits.map((h) => h.id),
  ["b"],
);
assert.deepEqual(
  (
    await vectors.search({
      vector: [1, 0, 0],
      filter: [{ type: "in", field: "id", values: ["b"] }],
    })
  ).hits.map((h) => h.id),
  ["b"],
);
assert.equal(await vectors.getHealth(), true);

if (mode === "mutate") {
  await search.addDocuments([{ ...docs[0]!, title: "Changed fixture" }]);
  assert.equal((await search.search({ query: "Changed" })).hits[0]?.id, "a");
  await search.deleteDocuments(["b"]);
  assert.deepEqual(
    (await search.search({ query: "Chromium", filter: alice })).hits,
    [],
  );
  await search.deleteDocuments(["d"], { batch: false });
  await vectors.deleteVectors(["a", "b"]);
  assert.deepEqual(
    (
      await vectors.search({
        vector: [1, 0, 0],
        filter: alice,
        rankingScoreThreshold: 0.75,
      })
    ).hits,
    [],
  );
  await search.clearIndex();
  await vectors.clearIndex();
  assert.equal((await search.search({ query: "" })).totalHits, 0);
  assert.deepEqual((await vectors.search({ vector: [1, 0, 0] })).hits, []);
}
console.log(
  "MEILI_COMPATIBILITY",
  JSON.stringify({
    version: (await raw.getVersion()).pkgVersion,
    mode,
    checks: [
      "full-text",
      "tenant-isolation",
      "id-eq-in",
      "sorting",
      "pagination",
      "unicode",
      "vectors",
      "similar-documents",
      "ranking-threshold",
      "health",
      ...(mode === "mutate"
        ? ["batch-update", "batch-delete", "direct-delete", "clear"]
        : []),
    ],
  }),
);
