// Ignore braces in comments and strings when inserting into an existing table.
export function addIndex(source: string, table: string, expression: string) {
  const tokens = [
    ...source.matchAll(
      /\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|[A-Za-z_][\w.]*|[{}]/g,
    ),
  ].filter((m) => !m[0].startsWith("//") && !m[0].startsWith("/*"));
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i][0].toLowerCase() !== "table") continue;
    const name = tokens[i + 1]?.[0].replace(/^"|"$/g, "");
    if (name !== table && `public.${name}` !== table) continue;
    let start = i + 2;
    while (start < tokens.length && tokens[start][0] !== "{") start++;
    let depth = 0,
      indexEnd: number | undefined;
    for (let j = start; j < tokens.length; j++) {
      if (tokens[j][0] === "{") depth++;
      if (
        depth === 1 &&
        tokens[j][0].toLowerCase() === "indexes" &&
        tokens[j + 1]?.[0] === "{"
      ) {
        let n = 1,
          k = j + 2;
        for (; k < tokens.length; k++) {
          if (tokens[k][0] === "{") n++;
          if (tokens[k][0] === "}" && --n === 0) break;
        }
        indexEnd = tokens[k]?.index;
      }
      if (tokens[j][0] === "}" && --depth === 0) {
        const pos = indexEnd ?? tokens[j].index!;
        const insert =
          indexEnd !== undefined
            ? `  ${expression}\n  `
            : `\n  indexes {\n    ${expression}\n  }\n`;
        return source.slice(0, pos) + insert + source.slice(pos);
      }
    }
  }
  throw new Error(
    "Could not locate table in DBML. Add the index in the editor.",
  );
}

export function replaceNote(source: string, name: string, replacement: string) {
  const tokens = [
    ...source.matchAll(
      /\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|[A-Za-z_][\w.]*|[{}]/g,
    ),
  ].filter((m) => !m[0].startsWith("//") && !m[0].startsWith("/*"));
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (
      depth === 0 &&
      tokens[i][0].toLowerCase() === "note" &&
      tokens[i + 1]?.[0].replace(/^"|"$/g, "") === name &&
      tokens[i + 2]?.[0] === "{"
    ) {
      let nested = 1;
      for (let j = i + 3; j < tokens.length; j++) {
        if (tokens[j][0] === "{") nested++;
        if (tokens[j][0] === "}" && --nested === 0)
          return (
            source.slice(0, tokens[i].index) +
            replacement +
            source.slice(tokens[j].index! + 1)
          );
      }
    }
    if (tokens[i][0] === "{") depth++;
    if (tokens[i][0] === "}") depth--;
  }
  throw new Error("Could not locate this note. Edit it in DBML.");
}
