import { test } from "node:test";
import assert from "node:assert/strict";
import { highlightTree, tagHighlighter, tags } from "@lezer/highlight";
import { dbmlLanguage } from "../src/dbml-language";

test("DBML highlighting distinguishes comments, keywords, types and escaped strings", () => {
  const source =
    "/* Table fake {\n still a comment } */\nTable users { id integer [note: 'brace} and \\\'quote'] }";
  const tokens: Record<string, string[]> = {};
  highlightTree(
    dbmlLanguage.parser.parse(source),
    tagHighlighter([
      { tag: tags.comment, class: "comment" },
      { tag: tags.keyword, class: "keyword" },
      { tag: tags.typeName, class: "type" },
      { tag: tags.string, class: "string" },
    ]),
    (from, to, style) => {
      (tokens[style] ??= []).push(source.slice(from, to));
    },
  );
  assert.ok(tokens.comment.join("").includes("still a comment"));
  assert.deepEqual(tokens.keyword, ["Table", "note"]);
  assert.deepEqual(tokens.type, ["integer"]);
  assert.deepEqual(tokens.string, ["'brace} and \\\'quote'"]);
});
