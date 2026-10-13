export type CompositeRef = { id: string; name?: string; fromTable: string; fromFields: string[]; toTable: string; toFields: string[]; relation: string };
export const relationshipField = (fields: string[]) => fields.length > 1 ? 'tuple:' + JSON.stringify(fields) : fields[0] || 'header';
export function compositeEndpoints(refs: CompositeRef[], tableId: string) {
  const tuples = new Map<string, { id: string; fields: string[]; references: CompositeRef[] }>();
  for (const ref of refs) for (const [table, fields] of [[ref.fromTable, ref.fromFields], [ref.toTable, ref.toFields]] as const) {
    if (table !== tableId || fields.length < 2) continue;
    const id = relationshipField(fields), tuple = tuples.get(id) || { id, fields, references: [] };
    if (!tuple.references.some(other => other.id === ref.id)) tuple.references.push(ref);
    tuples.set(id, tuple);
  }
  return [...tuples.values()];
}
