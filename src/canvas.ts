import { isMany } from './cardinality';
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
  refs: { id: string; fromTable: string; toTable: string; fromFields?: string[]; toFields?: string[] }[],
  enabled: boolean,
  selectedTable: string,
  selectedEdge: string,
  hoveredField?: { tableId: string; field: string } | null,
) {
  return new Set(
    refs
      .filter(
        (ref) =>
          ref.id === selectedEdge ||
          (hoveredField
            ? (ref.fromTable === hoveredField.tableId && !!ref.fromFields?.includes(hoveredField.field)) || (ref.toTable === hoveredField.tableId && !!ref.toFields?.includes(hoveredField.field))
            : (enabled || !!selectedTable) &&
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
  if(ref.fromTable===tableId && isMany(from))ref.fromFields.forEach((field,index)=>(targets[field]??=[]).push(ref.toTable+'.'+ref.toFields[index]));
  if(ref.toTable===tableId && (isMany(to)||(!isMany(from)&&!isMany(to))))ref.toFields.forEach((field,index)=>(targets[field]??=[]).push(ref.fromTable+'.'+ref.fromFields[index]));
 }
 return targets;
}

export type RelationshipPort = { offset: number; halfHeight: number; width: number; showSymbol: boolean };
export function relationshipPorts(refs: { id: string; relation: string; sourceSide?: string; targetSide?: string; fromTable: string; toTable: string; fromFields: string[]; toFields: string[] }[], detail: Detail, selectedEdge = "", highlighted?: ReadonlySet<string>) {
  const groups = new Map<string, Map<string, { id: string; side: "source" | "target" }[]>>();
  const ports: Record<string, { source: RelationshipPort; target: RelationshipPort }> = {};
  for (const ref of refs) {
    ports[ref.id] = { source: { offset: 0, halfHeight: 4, width: 10, showSymbol: false }, target: { offset: 0, halfHeight: 4, width: 10, showSymbol: false } };
    for (const side of ["source", "target"] as const) {
      const key = JSON.stringify([side === "source" ? ref.sourceSide || side : ref.targetSide || side, side === "source" ? ref.fromTable : ref.toTable, detail === "names" ? "header" : (side === "source" ? ref.fromFields[0] : ref.toFields[0])]);
      const types = groups.get(key) || new Map();
      const cardinality = ref.relation.split(":")[side === "source" ? 0 : 1];
      const connections = types.get(cardinality) || [];
      connections.push({ id: ref.id, side });
      types.set(cardinality, connections);
      groups.set(key, types);
    }
  }
  for (const types of groups.values()) {
    [...types.values()].forEach((connections, index) => {
      const owner = connections.find(ref => ref.id === selectedEdge) || connections.find(ref => highlighted?.has(ref.id)) || connections[0];
      for (const { id, side } of connections) ports[id][side] = {
        offset: types.size > 1 ? (index - (types.size - 1) / 2) * Math.min(14, 20 / (types.size - 1)) : 0,
        halfHeight: types.size > 1 ? 3 : 4, width: types.size > 1 ? 8 : 10,
        showSymbol: id === owner.id,
      };
    });
  }
  return ports;
}
export function relationshipFlow(relation: string) {
  const [from, to] = relation.split(":");
  if (!from || !to) return "both";
  return !isMany(from) && isMany(to) ? "forward" : isMany(from) && !isMany(to) ? "reverse" : "both";
}

export function relationshipSides(from: { x: number; width: number }, to: { x: number; width: number }, self = false): { sourceSide: "left" | "right"; targetSide: "left" | "right" } {
  if (self || from.x + from.width <= to.x) return { sourceSide: "right", targetSide: "left" };
  if (to.x + to.width <= from.x) return { sourceSide: "left", targetSide: "right" };
  return { sourceSide: "right", targetSide: "right" };
}
