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

export async function setVisualColor(source: string, kind: 'table' | 'relationship' | 'group', id: string, color: string) {
  if (!/^#[\da-f]{6}$/i.test(color)) throw new Error('Enter a six-digit hex color, such as #326d94.');
  const { database } = await import('./schema');
  const db = database(source);
  const target: any = kind === 'table'
    ? db.schemas.flatMap(s => s.tables).find(t => `${t.schema.name}.${t.name}` === id)
    : kind === 'group' ? db.schemas.flatMap(s => s.tableGroups).find(g => g.name === id)
    : db.schemas.flatMap(s => s.refs.map((r, i) => ({ ref: r, id: `${s.name}.ref${i}` }))).find(r => r.id === id)?.ref;
  if (!target) throw new Error('The selected table, group, or relationship no longer exists.');
  let from = target.token.start.offset, to = target.token.end.offset;
  let declaration = source.slice(from, to);
  const key = kind === 'table' ? 'headercolor' : 'color';
  if (kind === 'relationship' && /^ref\s*:\s*[?<>-]/i.test(declaration)) {
    const endpoints = target.endpoints.map((e: any) => `${JSON.stringify(e.schemaName || target.schema.name)}.${JSON.stringify(e.tableName)}.${e.fieldNames.length === 1 ? JSON.stringify(e.fieldNames[0]) : '(' + e.fieldNames.map((f: string) => JSON.stringify(f)).join(', ') + ')'}`);
    const [a, b] = target.endpoints;
    const { isMany, parseCardinality } = await import('./cardinality');
    const relation = (a.relation !== '*' && parseCardinality(a.relation).minimum === 0 ? '?' : '') + (isMany(a.relation) ? (isMany(b.relation) ? '<>' : '>') : isMany(b.relation) ? '<' : '-') + (b.relation !== '*' && parseCardinality(b.relation).minimum === 0 ? '?' : '');
    const leading = source.slice(0, from).match(/,\s*$/);
    const trailing = source.slice(to).match(/^\s*,/);
    if (leading) from -= leading[0].length;
    else if (trailing) to += trailing[0].length;
    const next = source.slice(0, from) + source.slice(to) + `\n\nRef: ${endpoints[0]} ${relation} ${endpoints[1]} [color: ${color}]\n`;
    database(next);
    return next;
  }
  const tokens = [...declaration.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|'''[\s\S]*?'''|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|#[\da-f]+|[A-Za-z_][\w]*|[{}\[\]:]/gi)].filter(t => !t[0].startsWith('//') && !t[0].startsWith('/*'));
  const boundary = kind !== 'relationship' ? (tokens.find(t => t[0] === '{')?.index ?? declaration.length) : declaration.length;
  const setting = tokens.findIndex((t, i) => t.index! < boundary && t[0].toLowerCase() === key && tokens[i + 1]?.[0] === ':');
  if (setting >= 0) {
    const value = tokens[setting + 2];
    declaration = declaration.slice(0, value.index) + color + declaration.slice(value.index! + value[0].length);
  } else {
    const opening = tokens.find(t => t.index! < boundary && t[0] === '[');
    const closing = tokens.find(t => t.index! < boundary && t[0] === ']');
    if (opening && closing) {
      const content = declaration.slice(opening.index! + 1, closing.index).trim();
      declaration = declaration.slice(0, closing.index) + (content ? ', ' : '') + key + ': ' + color + declaration.slice(closing.index);
    } else {
      const position = kind !== 'relationship' ? boundary : (tokens.find(t => t[0] === '}')?.index ?? declaration.length);
      declaration = declaration.slice(0, position) + ` [${key}: ${color}] ` + declaration.slice(position);
    }
  }
  const next = source.slice(0, from) + declaration + source.slice(to);
  database(next);
  return next;
}

export function recordLiteral(value: string, type: string) {
  if (value === '') return 'null';
  if (value.startsWith('`') && value.endsWith('`')) return value;
  if (/^(?:boolean|bool)\b/i.test(type)) {
    if (!/^(?:true|false|0|1)$/i.test(value.trim())) throw new Error('Boolean cells must be true, false, 0, or 1.');
    return value.trim();
  }
  if (/^(?:smallint|bigint|integer|int\b|int[248]\b|serial|bigserial|decimal|numeric|real|float|double)/i.test(type)) {
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) throw new Error('Numeric cells must contain a number.');
    return value.trim();
  }
  return "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r') + "'";
}

export async function setTableRecords(source: string, id: string, columns: string[], rows: string[][]) {
  const { database } = await import('./schema');
  const db = database(source);
  const table = db.schemas.flatMap(s => s.tables).find(t => `${t.schema.name}.${t.name}` === id);
  if (!table) throw new Error('Table no longer exists.');
  if (!columns.length || columns.some(c => !table.fields.some(f => f.name === c)) || rows.some(r => r.length !== columns.length)) throw new Error('Records must match the selected table columns.');
  const existing = table.records[0];
  const prefix = `records ${JSON.stringify(table.schema.name)}.${JSON.stringify(table.name)}(${columns.map(c => JSON.stringify(c)).join(', ')})${existing?.example ? ' [example]' : ''}`;
  const block = rows.length ? `${prefix} {\n${rows.map(r => '  ' + r.join(', ')).join('\n')}\n}` : '';
  // Keep an existing nested block nested; preserve all schema text outside its source range.
  const nested = existing && existing.token.start.offset > table.token.start.offset && existing.token.end.offset < table.token.end.offset;
  const replacement = nested ? block.replace(/^records [^{]+/, `records (${columns.map(c => JSON.stringify(c)).join(', ')})${existing.example ? ' [example]' : ''} `) : block;
  const next = existing
    ? source.slice(0, existing.token.start.offset) + replacement + source.slice(existing.token.end.offset)
    : source + (block ? '\n\n' + block + '\n' : '');
  const checked = database(next).schemas.flatMap(s => s.tables).find(t => `${t.schema.name}.${t.name}` === id)?.records[0];
  checked?.values.forEach(row => row.forEach((cell, i) => {
    if (cell.value != null && cell.type !== 'expression') recordLiteral(String(cell.value), table.fields.find(f => f.name === columns[i])!.type.type_name);
  }));
  return next;
}

export async function setRelationshipCardinality(source: string, id: string, from: string, to: string) {
  const { database } = await import('./schema');
  const { parseCardinality, isMany, readCardinalities, writeCardinalities, cardinalityKey } = await import('./cardinality');
  const a = parseCardinality(from), b = parseCardinality(to);
  const db = database(source);
  const ref = db.schemas.flatMap(schema => schema.refs.map((ref, index) => ({ ref, id: `${schema.name}.ref${index}` }))).find(value => value.id === id)?.ref;
  if (!ref) throw new Error('This relationship no longer exists.');
  const start = ref.token.start.offset, end = ref.token.end.offset, declaration = source.slice(start, end);
  const inline = /^ref\s*:\s*[?<>-]/i.test(declaration);
  const leftBound = inline ? b : a, rightBound = inline ? a : b;
  // Bounds document participation; keep the existing foreign-key direction and SQL relationship kind.
  const leftMany = isMany(ref.endpoints[inline ? 1 : 0].relation), rightMany = isMany(ref.endpoints[inline ? 0 : 1].relation);
  const operator = (leftBound.minimum === 0 ? '?' : '') + (leftMany ? rightMany ? '<>' : '>' : rightMany ? '<' : '-') + (rightBound.minimum === 0 ? '?' : '');
  const token = [...declaration.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|[?<>-]+/g)].find(token => /^[?<>-]+$/.test(token[0]));
  if (!token) throw new Error('Could not locate the relationship operator.');
  const next = source.slice(0, start + token.index!) + operator + source.slice(start + token.index! + token[0].length);
  const [left, right] = ref.endpoints;
  const key = cardinalityKey({ fromTable: `${left.schemaName || ref.schema.name}.${left.tableName}`, fromFields: left.fieldNames, toTable: `${right.schemaName || ref.schema.name}.${right.tableName}`, toFields: right.fieldNames });
  const result = writeCardinalities(next, { ...readCardinalities(source), [key]: { from, to } });
  database(result);
  return result;
}
