// Ignore braces in comments and strings when inserting into an existing table.
export function addIndex(source: string, table: string, expression: string) {
  const tokens = [...source.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|[A-Za-z_][\w.]*|[{}]/g)].filter(m => !m[0].startsWith('//') && !m[0].startsWith('/*'));
  for (let i=0;i<tokens.length;i++) {
    if(tokens[i][0].toLowerCase()!=='table') continue;
    const name=tokens[i+1]?.[0].replace(/^"|"$/g,'');
    if(name!==table && `public.${name}`!==table) continue;
    let start=i+2; while(start<tokens.length && tokens[start][0]!=='{') start++;
    let depth=0, indexEnd:number|undefined;
    for(let j=start;j<tokens.length;j++) {
      if(tokens[j][0]==='{') depth++;
      if(depth===1 && tokens[j][0].toLowerCase()==='indexes' && tokens[j+1]?.[0]==='{') {
        let n=1,k=j+2; for(;k<tokens.length;k++){if(tokens[k][0]==='{')n++;if(tokens[k][0]==='}' && --n===0)break;}
        indexEnd=tokens[k]?.index;
      }
      if(tokens[j][0]==='}' && --depth===0) {
        const pos=indexEnd??tokens[j].index!;
        const insert=indexEnd!==undefined?`  ${expression}\n  `:`\n  indexes {\n    ${expression}\n  }\n`;
        return source.slice(0,pos)+insert+source.slice(pos);
      }
    }
  }
  throw new Error('Could not locate table in DBML. Add the index in the editor.');
}
