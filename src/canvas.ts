export type Detail = "all" | "keys" | "names";
export function visibleFields<T extends { name: string; pk?: boolean }>(
  fields: T[],
  detail: Detail,
  keys: string[],
) {
  return detail === "names"
    ? []
    : detail === "keys"
      ? fields.filter((f) => f.pk || keys.includes(f.name))
      : fields;
}
export function matchesSearch(value: string, query: string) {
  return value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

export function highlightedRelationships(
  refs: { id: string; fromTable: string; toTable: string }[],
  enabled: boolean,
  selectedTable: string,
  selectedEdge: string,
) {
  return new Set(
    refs
      .filter(
        (ref) =>
          ref.id === selectedEdge ||
          ((enabled || !!selectedTable) &&
            (!selectedTable ||
              ref.fromTable === selectedTable ||
              ref.toTable === selectedTable)),
      )
      .map((ref) => ref.id),
  );
}

export function foreignKeyTargets(
 refs:{fromTable:string;fromFields:string[];toTable:string;toFields:string[];relation:string}[],
 tableId:string,
){
 const targets:Record<string,string[]>={};
 for(const ref of refs){
  const [from,to]=ref.relation.split(':');
  if(ref.fromTable===tableId && from==='*')ref.fromFields.forEach((field,index)=>(targets[field]??=[]).push(ref.toTable+'.'+ref.toFields[index]));
  if(ref.toTable===tableId && (to==='*'||(from==='1'&&to==='1')))ref.toFields.forEach((field,index)=>(targets[field]??=[]).push(ref.fromTable+'.'+ref.fromFields[index]));
 }
 return targets;
}
