import { test } from "node:test";
import assert from "node:assert/strict";
import { Parser } from "@dbml/core";
import { addIndex } from "../src/dbml-edit";
test("adds indexes without damaging nested blocks or quoted braces", () => {
  for (const source of [
    "Table users {\n id int [pk]\n email varchar [note: '}']\n}",
    "Table users {\n id int\n email varchar\n indexes {\n id\n }\n}",
  ]) {
    const out = addIndex(
      source,
      "public.users",
      "email [unique, name: 'email_idx']",
    );
    const d = Parser.parse(out, "dbml").export();
    assert.equal(d.schemas[0].tables[0].indexes.at(-1)?.name, "email_idx");
  }
});

import { findTableRange } from "../src/dbml-edit";
test("table selection covers nested definitions and ignores comments and quoted braces", () => {
  const definition = `Table "team space"."users" as U {
  id int [pk]
  note: '''A } and Table fake { description'''
  indexes { id [name: 'brace}'] }
 }`;
  const source =
    "// Table users {}\nTable other { id int }\n" +
    definition +
    "\nTable users { id int }";
  const range = findTableRange(source, "team space", "users");
  assert.ok(range);
  assert.equal(source.slice(range.from, range.to), definition);
  const publicRange = findTableRange(source, "public", "users");
  assert.equal(
    source.slice(publicRange!.from, publicRange!.to),
    "Table users { id int }",
  );
  assert.equal(findTableRange(source, "public", "missing"), null);
});
