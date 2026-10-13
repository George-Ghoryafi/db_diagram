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

import {setAttachedNote} from '../src/dbml-edit';
test('attached notes edit only the intended table or attribute using official source ranges',async()=>{
 const source=`// Preserve this comment
Table "team"."users" {
  id int [pk]
  "display name" varchar [not null, default: '[]']
  tags varchar[]
  body text [note: 'Old } note']
  Note { 'Original table note' }
}
Table other { id int [pk, note: 'Untouched'] }
`;
 const fieldNote='A detailed "note"\nwith braces } and unicode café';
 let edited=await setAttachedNote(source,'team','users','display name',fieldNote);
 edited=await setAttachedNote(edited,'team','users','body','Updated body note');
 edited=await setAttachedNote(edited,'team','users','tags','Tags note');
 edited=await setAttachedNote(edited,'team','users','','Updated table note');
 const db=Parser.parse(edited,'dbmlv2');
 const users=db.schemas.find(s=>s.name==='team')!.tables[0];
 assert.equal(users.fields.find(f=>f.name==='display name')!.note,fieldNote);
 assert.equal(users.fields.find(f=>f.name==='display name')!.not_null,true);
 assert.equal(users.fields.find(f=>f.name==='tags')!.type.type_name,'varchar[]');
 assert.equal(users.fields.find(f=>f.name==='body')!.note,'Updated body note');
 assert.equal(users.note,'Updated table note');
 assert.ok(edited.startsWith('// Preserve this comment'));
 assert.ok(edited.endsWith("Table other { id int [pk, note: 'Untouched'] }\n"));
 const newTableNote=await setAttachedNote('Table sample { id int }','public','sample','','A table note');
 assert.equal(Parser.parse(newTableNote,'dbmlv2').schemas[0].tables[0].note,'A table note');
 await assert.rejects(setAttachedNote(source,'team','users','missing','Nope'),/Attribute not found/);
});
