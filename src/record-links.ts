import { isMany } from './cardinality';
export type RecordValue = { value: string | number | boolean | null; type?: string };
export type RecordFocus = { columns: string[]; values: string[] };
type Ref = { fromTable: string; fromFields: string[]; toTable: string; toFields: string[]; relation: string; sqlRelation?: string };

export function recordLinks(refs: Ref[], tableId: string, column: string, columns: string[], row: RecordValue[]) {
  return refs.flatMap(ref => {
    const [from, to] = (ref.sqlRelation || ref.relation).split(':');
    const source = ref.fromTable === tableId && isMany(from) && !isMany(to);
    const target = ref.toTable === tableId && (isMany(to) && !isMany(from) || !isMany(from) && !isMany(to));
    if (!source && !target) return [];
    const fields = source ? ref.fromFields : ref.toFields;
    if (!fields.includes(column)) return [];
    const cells = fields.map(field => row[columns.indexOf(field)]);
    if (cells.some(cell => !cell || cell.value == null || cell.type === 'expression')) return [];
    return [{ tableId: source ? ref.toTable : ref.fromTable, columns: source ? ref.toFields : ref.fromFields, values: cells.map(cell => String(cell.value)) }];
  });
}

export function matchesRecord(columns: string[], row: RecordValue[], focus: RecordFocus) {
  return focus.columns.every((column, i) => {
    const cell = row[columns.indexOf(column)];
    return cell && cell.value != null && cell.type !== 'expression' && String(cell.value) === focus.values[i];
  });
}
