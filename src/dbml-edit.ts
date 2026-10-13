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

// Locate a whole table without mistaking quoted braces or comments for syntax.
export function findTableRange(source: string, schema: string, name: string) {
  const tokens = [
    ...source.matchAll(
      /\/\/[^\n]*|\/\*[\s\S]*?\*\/|'''[\s\S]*?'''|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|[A-Za-z_][\w]*|[{}.]/g,
    ),
  ].filter((m) => !m[0].startsWith("//") && !m[0].startsWith("/*"));
  const identifier = (value: string) =>
    value.startsWith('"') ? JSON.parse(value) : value;
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (depth === 0 && tokens[i][0].toLowerCase() === "table") {
      let j = i + 1;
      let table = identifier(tokens[j]?.[0] || ""),
        namespace = "public";
      if (tokens[j + 1]?.[0] === ".") {
        namespace = table;
        table = identifier(tokens[j + 2]?.[0] || "");
        j += 2;
      }
      if (namespace === schema && table === name) {
        while (j < tokens.length && tokens[j][0] !== "{") j++;
        let nested = 0;
        for (; j < tokens.length; j++) {
          if (tokens[j][0] === "{") nested++;
          if (tokens[j][0] === "}" && --nested === 0)
            return { from: tokens[i].index!, to: tokens[j].index! + 1 };
        }
      }
    }
    if (tokens[i][0] === "{") depth++;
    if (tokens[i][0] === "}") depth--;
  }
  return null;
}

export async function setAttachedNote(source:string,schema:string,tableName:string,fieldName:string,content:string){
 const {database}=await import('./schema');
 const db=database(source);
 const table=db.schemas.find(s=>s.name===schema)?.tables.find(t=>t.name===tableName);
 if(!table)throw new Error('Table not found.');
 const target:any=fieldName?table.fields.find(f=>f.name===fieldName):table;
 if(!target)throw new Error('Attribute not found.');
 // shortcut: inherited TablePartial fields must have their notes edited in the partial.
 if(fieldName && target.injectedPartial)throw new Error('This attribute comes from a TablePartial. Edit its note in the DBML partial.');
 const note='note: '+JSON.stringify(content);
 let next:string;
 if(target.noteToken){
  const {start,end}=target.noteToken;
  next=source.slice(0,start.offset)+note+source.slice(end.offset);
 }else if(!fieldName){
  const position=table.token.end.offset-1;
  next=source.slice(0,position)+'\n  '+note+'\n'+source.slice(position);
 }else{
  const position=target.token.end.offset;
  const declaration=source.slice(target.token.start.offset,position);
  const tokens=[...declaration.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|'''[\s\S]*?'''|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|[\[\]]/g)].filter(t=>!t[0].startsWith('//')&&!t[0].startsWith('/*'));
  const brackets=tokens.filter(t=>t[0]==='['||t[0]===']');
  const opening=brackets.at(-2),closing=brackets.at(-1);
  const arrayOnly=opening&&closing&&target.type.type_name.endsWith('[]')&&!declaration.slice(opening.index!+1,closing.index).trim();
  if(opening?.[0]==='['&&closing?.[0]===']'&&!arrayOnly){
   const offset=target.token.start.offset+closing.index!;
   const existing=declaration.slice(opening.index!+1,closing.index).trim();
   next=source.slice(0,offset)+(existing?', ':'')+note+source.slice(offset);
  }else next=source.slice(0,position)+' ['+note+']'+source.slice(position);
 }
 database(next);
 return next;
}
