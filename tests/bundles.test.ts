import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SchemaStore } from "../server/storage";
import { browserApi } from "../src/browser-api";
import { defaultBundle } from "../src/bundles";

const dbml = "Table preserved { id integer [pk] }";
test("legacy diagrams get the default bundle; moving preserves DBML, revision and layout across restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "diagram-bundles-"));
  try {
    writeFileSync(join(directory, "legacy.dbml"), dbml);
    const store = new SchemaStore(directory);
    assert.equal(store.read("legacy").bundle_id, defaultBundle.id);
    const bundle = await store.createBundle("Personal", "#9b76df");
    await store.saveLayout("legacy", {
      "public.preserved": { x: 123, y: 456 },
    });
    const before = store.read("legacy");
    const moved = await store.moveSchema("legacy", bundle.id);
    assert.equal(moved.id, before.id);
    assert.equal(moved.dbml, before.dbml);
    assert.equal(moved.revision, before.revision);
    assert.deepEqual(moved.layout, before.layout);
    const reopened = new SchemaStore(directory);
    assert.equal(reopened.read("legacy").bundle_id, bundle.id);
    assert.deepEqual(
      reopened.listBundles().map((b) => b.name),
      ["Shared diagrams", "Personal"],
    );
    await assert.rejects(
      store.moveSchema("legacy", "missing"),
      /Bundle not found/,
    );
    await assert.rejects(store.createBundle("", "red"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test("browser bundles permit duplicate display names without colliding IDs or losing metadata on edits", async () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => values.get(k) || null,
      setItem: (k: string, v: string) => values.set(k, v),
    },
    configurable: true,
  });
  const bundle = (await browserApi(
    "/bundles",
    { name: "Personal", color: "#9b76df" },
    "POST",
  )) as { id: string };
  const first = (await browserApi(
    "/schemas",
    { name: "My diagram", dbml, bundle_id: bundle.id },
    "POST",
  )) as {
    id: string;
    dbml: string;
    revision: string;
    bundle_id: string;
    layout: unknown;
  };
  const second = (await browserApi(
    "/schemas",
    { name: "My diagram", dbml, bundle_id: defaultBundle.id },
    "POST",
  )) as typeof first;
  assert.notEqual(first.id, second.id);
  const moved = (await browserApi(
    "/schemas/" + first.id + "/bundle",
    { bundle_id: defaultBundle.id },
    "PUT",
  )) as typeof first;
  assert.equal(moved.dbml, first.dbml);
  assert.equal(moved.revision, first.revision);
  assert.deepEqual(moved.layout, first.layout);
  const edited = (await browserApi(
    "/schemas/" + first.id,
    { dbml: dbml + "\n// edited", revision: first.revision },
    "PUT",
  )) as typeof first;
  assert.equal(edited.bundle_id, defaultBundle.id);
  await assert.rejects(
    browserApi("/bundles", { name: "Bad", color: "red" }, "POST"),
    /valid bundle color/,
  );
});
