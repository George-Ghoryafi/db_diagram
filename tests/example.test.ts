import { test } from "node:test";
import assert from "node:assert/strict";
import { example, exampleLayout } from "../src/example";
import model from "../src/example-model.json";
import { parseSchema } from "../src/schema";
import { browserApi } from "../src/browser-api";
import { SchemaStore } from "../server/storage";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
  },
  configurable: true,
});
test("bundled showcase displays real DBML features with positions for every node", () => {
  const parsed=parseSchema(example);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), model);
  assert.equal(model.tables.length, 5);
  assert.equal(model.refs.length, 6);
  assert(model.refs.every((r) => r.name));
  assert.equal(model.groups.length, 2);
  assert.equal(model.notes.length, 1);
  assert(
    parsed.tables.some((t) =>
      t.indexes.some((i) => i.pk && i.columns.length === 2),
    ),
  );
  for (const n of [...model.tables, ...model.notes])
    assert(exampleLayout[n.id]);
});
test("static deployment starts with the sample, preserves edits and rejects stale saves", async () => {
  values.clear();
  const list = await browserApi("/schemas", undefined, "GET") as {id:string}[];
  assert.equal(list[0].id, "welcome");
  const d = await browserApi("/schemas/welcome", undefined, "GET") as typeof import("../src/example").exampleDocument;
  assert.equal(d.storage, "browser");
  const updated = await browserApi(
    "/schemas/welcome",
    { dbml: example + "\n// My edit", revision: d.revision },
    "PUT",
  ) as typeof d;
  assert.notEqual(updated.revision, d.revision);
  assert.equal(
    (await browserApi("/schemas/welcome", undefined, "GET") as typeof d).dbml,
    updated.dbml,
  );
  await assert.rejects(
    browserApi(
      "/schemas/welcome",
      { dbml: example, revision: d.revision },
      "PUT",
    ),
    /changed/,
  );
  await assert.rejects(
    browserApi(
      "/schemas/welcome",
      { dbml: "broken", revision: updated.revision },
      "PUT",
    ),
  );
  const again=await browserApi("/schemas", undefined, "GET");assert(Array.isArray(again));assert.equal(again.length,1);
  values.set("dbdiagram.schemas.v1", "broken");
  await assert.rejects(browserApi("/schemas", undefined, "GET"));
  assert.equal(values.get("dbdiagram.schemas.v1"), "broken");
  values.clear();
});
test("server seeds only empty workspaces and leaves existing schemas intact", async () => {
  const dir = mkdtempSync(join(tmpdir(), "diagram-showcase-"));
  try {
    const store = new SchemaStore(dir);
    await store.seed();
    assert.deepEqual(store.read("welcome").layout, exampleLayout);
    await store.write("my-work", "Table mine {\n id int [pk]\n}");
    const before = store.read("my-work");
    await store.seed();
    assert.deepEqual(store.read("my-work"), before);
    assert.equal(store.list().length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
