import {
  StreamLanguage,
  HighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
const keywords =
  /^(table|tablegroup|ref|enum|project|note|indexes|records|example|pk|unique|not|null|increment|default|headercolor|color|as)$/i;
const types =
  /^(int|integer|bigint|smallint|varchar|char|text|uuid|timestamp|date|boolean|decimal|numeric|float|double|jsonb?|serial)$/i;
export const dbmlLanguage = StreamLanguage.define({
  startState: () => ({ comment: false }),
  token(stream, state) {
    if (state.comment) {
      if (stream.skipTo("*/")) {
        stream.match("*/");
        state.comment = false;
      } else stream.skipToEnd();
      return "comment";
    }
    if (stream.eatSpace()) return null;
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match("/*")) {
      state.comment = true;
      return "comment";
    }
    if (stream.match(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/))
      return "string";
    if (stream.match(/#[a-f\d]{3,8}\b|\b\d+(\.\d+)?\b/i)) return "number";
    const word = stream.match(/[A-Za-z_]\w*/);
    if (word && typeof word !== "boolean") {
      return keywords.test(word[0])
        ? "keyword"
        : types.test(word[0])
          ? "typeName"
          : null;
    }
    stream.next();
    return null;
  },
});
export const dbmlColors = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.comment, color: "#6a9955 !important" },
    { tag: tags.keyword, color: "#569cd6 !important" },
    { tag: tags.typeName, color: "#4ec9b0 !important" },
    { tag: tags.string, color: "#ce9178 !important" },
    { tag: tags.number, color: "#b5cea8 !important" },
  ]),
);
