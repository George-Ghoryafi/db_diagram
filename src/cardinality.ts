import { storageBlock } from './storage-model.js';
export type Cardinality = { minimum: number; maximum: number | null };
export type CardinalityRef = { fromTable: string; fromFields: string[]; toTable: string; toFields: string[] };
export function parseCardinality(value: string): Cardinality {
  if (value === '*') return { minimum: 0, maximum: null };
  const match = /^(\d+)(?:\.\.(\d+|\*))?$/.exec(value);
  if (!match) throw new Error('Use 1, 0..1, 0..*, or a range such as 2..5.');
  const minimum = Number(match[1]), maximum = match[2] === '*' ? null : Number(match[2] ?? match[1]);
  if (!Number.isSafeInteger(minimum) || (maximum !== null && (!Number.isSafeInteger(maximum) || maximum < minimum))) throw new Error('Cardinality bounds must be non-negative integers with maximum ≥ minimum.');
  return { minimum, maximum };
}
export const isMany = (value: string) => { const { maximum } = parseCardinality(value); return maximum === null || maximum > 1; };
export const cardinalityKey = (ref: CardinalityRef) => JSON.stringify([ref.fromTable, ref.fromFields, ref.toTable, ref.toFields]);
export function readCardinalities(source: string): Record<string, { from: string; to: string }> {
  const block = storageBlock(source, '@schemadb-cardinality');
  if (!block) return {};
  let model;
  try { model = JSON.parse(block.json); } catch { throw new Error('Invalid JSON in @schemadb-cardinality.'); }
  if (model?.version !== 1 || !model.relationships || typeof model.relationships !== 'object' || Array.isArray(model.relationships)) throw new Error('Cardinality metadata needs version 1 and a relationships object.');
  for (const bounds of Object.values(model.relationships) as { from: string; to: string }[]) {
    if (!bounds || typeof bounds.from !== 'string' || typeof bounds.to !== 'string') throw new Error('Each relationship needs from and to cardinalities.');
    parseCardinality(bounds.from); parseCardinality(bounds.to);
  }
  return model.relationships;
}
export function writeCardinalities(source: string, relationships: Record<string, { from: string; to: string }>) {
  const block = storageBlock(source, '@schemadb-cardinality');
  const comment = '/* @schemadb-cardinality\n' + JSON.stringify({ version: 1, relationships }, null, 2).replace(/\*\//g, '*\\u002f') + '\n*/';
  const next = block ? source.slice(0, block.from) + comment + source.slice(block.to) : source + '\n\n' + comment + '\n';
  readCardinalities(next);
  return next;
}
