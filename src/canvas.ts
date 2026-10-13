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

export type RelationshipPort = { offset: number; halfHeight: number; width: number };
export function relationshipPorts(refs: { id: string; fromTable: string; toTable: string; fromFields: string[]; toFields: string[] }[], detail: Detail) {
  const groups = new Map<string, { id: string; side: "source" | "target" }[]>();
  const ports: Record<string, { source: RelationshipPort; target: RelationshipPort }> = {};
  for (const ref of refs) {
    ports[ref.id] = { source: { offset: 0, halfHeight: 6, width: 15 }, target: { offset: 0, halfHeight: 6, width: 15 } };
    for (const side of ["source", "target"] as const) {
      const key = JSON.stringify([side, side === "source" ? ref.fromTable : ref.toTable, detail === "names" ? "header" : (side === "source" ? ref.fromFields[0] : ref.toFields[0])]);
      const group = groups.get(key) || [];
      group.push({ id: ref.id, side });
      groups.set(key, group);
    }
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const spacing = 18 / (group.length - 1);
    group.forEach(({ id, side }, index) => {
      ports[id][side] = { offset: -9 + spacing * index, halfHeight: Math.min(4, spacing * .4), width: 9 };
    });
  }
  return ports;
}
export function relationshipFlow(relation: string) {
  return relation === "1:*" ? "forward" : relation === "*:1" ? "reverse" : "both";
}
