import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleFields, matchesSearch } from "../src/canvas";
import { replaceNote } from "../src/dbml-edit";
import { parseSchema, exportSchema } from "../server/schema";
test("detail levels include composite key and FK fields without changing the schema", () => {
  const fields = [
    { name: "id", pk: true },
    { name: "account_id" },
    { name: "other_pk" },
    { name: "description" },
  ];
  assert.deepEqual(
    visibleFields(fields, "keys", ["account_id", "other_pk"]).map(
      (f) => f.name,
    ),
    ["id", "account_id", "other_pk"],
  );
  assert.deepEqual(visibleFields(fields, "names", []), []);
  assert.equal(visibleFields(fields, "all", []), fields);
  assert(matchesSearch("public.Users.EMAIL", " email "));
});
test("sticky notes keep braces, quotes and multiline text; edit only the top-level note", () => {
  const text =
    'Table users {\n id int [pk]\n Note: "do not change { this }"\n}\nNote todo {\n "old } content"\n}\n';
  const message = 'Design { audit } tables\nKeep "history"';
  const next = replaceNote(
    text,
    "todo",
    `Note todo {\n ${JSON.stringify(message)}\n}`,
  );
  const parsed = parseSchema(next);
  assert.equal(parsed.notes[0].content, message);
  assert.equal(parsed.tables[0].note, "do not change { this }");
  assert.equal(exportSchema(next, "dbml"), next);
  assert.throws(() => replaceNote(text, "missing", ""));
});

import { arrangeTables, type Arrangement } from "../src/layout";
test("all layout modes handle cyclic/disconnected graphs and avoid table overlap", () => {
  const items = [
    { id: "a", width: 235, height: 500 },
    { id: "b", width: 235, height: 140 },
    { id: "c", width: 235, height: 180 },
    { id: "d", width: 235, height: 350 },
  ];
  const refs = [
    { fromTable: "a", toTable: "b" },
    { fromTable: "b", toTable: "a" },
    { fromTable: "a", toTable: "c" },
  ];
  for (const mode of [
    "left-right",
    "pipeline",
    "snowflake",
    "compact",
  ] as Arrangement[]) {
    const ps = arrangeTables(items, refs, [{ tables: ["a", "b"] }], mode);
    assert.equal(Object.keys(ps).length, items.length);
    for (const i of items) {
      assert(Number.isFinite(ps[i.id].x) && Number.isFinite(ps[i.id].y));
      for (const j of items.filter((j) => j.id !== i.id)) {
        const a = ps[i.id],
          b = ps[j.id];
        assert(
          a.x + i.width <= b.x ||
            b.x + j.width <= a.x ||
            a.y + i.height <= b.y ||
            b.y + j.height <= a.y,
          `${mode}: ${i.id}/${j.id} overlap`,
        );
      }
    }
  }
  assert.deepEqual(arrangeTables([], [], [], "compact"), {});
});
