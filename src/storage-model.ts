import { z } from 'zod';

export const storageKinds = {
  blob: { label: 'Object / BLOB storage', item: 'Bucket', plural: 'buckets', color: '#127c80' },
  document: { label: 'Document store', item: 'Collection', plural: 'collections', color: '#7858a5' },
  kv: { label: 'Key-value store', item: 'Keyspace', plural: 'keyspaces', color: '#b67624' },
} as const;
const id = z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Use letters, numbers, underscores or hyphens for IDs.');
const text = z.string().max(20000).default('');
const itemSchema = z.object({
  id, name: z.string().trim().min(1).max(120), note: text,
  access: z.enum(['private', 'public']).default('private'),
  keyPattern: text, contentType: text, ttl: text,
  shape: z.string().default('').refine(value => { if (!value.trim()) return true; try { JSON.parse(value); return true; } catch { return false; } }, 'Document / value shape must be valid JSON.'),
}).strict();
const unitSchema = z.object({
  id, name: z.string().trim().min(1).max(120), kind: z.enum(['blob', 'document', 'kv']),
  provider: z.string().max(120).default(''), note: text,
  items: z.array(itemSchema).default([]),
}).strict();
const endpointSchema = z.object({ node: z.string().min(1).max(300), port: z.string().max(300).default('') }).strict();
const linkSchema = z.object({
  id, from: endpointSchema, to: endpointSchema,
  kind: z.enum(['reference', 'sync', 'cache', 'flow']).default('reference'),
  label: z.string().max(160).default(''), direction: z.enum(['forward', 'both']).default('forward'),
}).strict();
export const storageModelSchema = z.object({ version: z.literal(1), units: z.array(unitSchema), links: z.array(linkSchema) }).strict();
export type StorageUnit = z.infer<typeof unitSchema>;
export type StorageItem = z.infer<typeof itemSchema>;
export type StorageLink = z.infer<typeof linkSchema>;
export type StorageModel = z.infer<typeof storageModelSchema>;
export const emptyStorage: StorageModel = { version: 1, units: [], links: [] };
export const storageNodeId = (id: string) => 'storage:' + id;

export function shapeFields(shape: string): { path: string; name: string; type: string; depth: number }[] {
  if (!shape.trim()) return [];
  const rows: { path: string; name: string; type: string; depth: number }[] = [];
  const visit = (object: unknown, prefix: string, depth: number) => {
    if (!object || typeof object !== 'object' || Array.isArray(object)) return;
    const value = object as Record<string, any>;
    const properties = value.properties && typeof value.properties === 'object' ? value.properties : value.type === 'object' ? {} : value;
    for (const [name, field] of Object.entries(properties)) {
      const spec = field as any;
      const array = Array.isArray(spec) || spec?.type === 'array';
      const nested = array ? (Array.isArray(spec) ? spec[0] : spec.items) : spec;
      const type = typeof spec === 'string' ? spec : array ? 'array' : spec && typeof spec === 'object' ? spec.type || 'object' : spec === null ? 'null' : typeof spec;
      const path = prefix + name;
      rows.push({ path, name, type: Array.isArray(type) ? type.join(' | ') : String(type), depth });
      // shortcut: preview at most 13 levels; use the shape editor for deeper documents.
      if (depth < 12 && nested && typeof nested === 'object' && (nested.properties || !nested.type)) visit(nested, path + (array ? '[].' : '.'), depth + 1);
    }
  };
  visit(JSON.parse(shape), '', 0);
  return rows;
}
export function storagePorts(unit: StorageUnit) {
  return unit.items.flatMap(item => [{ port: item.id, label: item.name }, ...shapeFields(item.shape).map(field => ({ port: item.id + '/' + field.path, label: item.name + '.' + field.path }))]);
}
export function storageNodeHeight(unit: StorageUnit, namesOnly = false) {
  return 78 + (namesOnly ? 0 : unit.items.reduce((height, item) => height + 38 + (item.keyPattern ? 24 : 0) + shapeFields(item.shape).length * 24, 0)) + 28;
}

export function validateStorageModel(value: unknown): StorageModel {
  const parsed = storageModelSchema.safeParse(value);
  if (!parsed.success) throw new Error('Storage definition: ' + parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  const model = parsed.data;
  const unique = (ids: string[], label: string) => { if (new Set(ids).size !== ids.length) throw new Error(`Storage definition: duplicate ${label} IDs.`); };
  unique(model.units.map(unit => unit.id), 'store'); unique(model.links.map(link => link.id), 'connection');
  for (const unit of model.units) {
    unique(unit.items.map(item => item.id), 'item');
    unique(unit.items.map(item => item.name), storageKinds[unit.kind].item.toLowerCase());
  }
  return model;
}

// Recognize only actual top-level comments, never text inside DBML notes or strings.
export function storageBlock(source: string) {
  let depth = 0;
  let block: { from: number; to: number; json: string } | undefined;
  for (const token of source.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\/|'''[\s\S]*?'''|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|[{}]/g)) {
    const match = depth === 0 && /^\/\*\s*@schemadb-storage\s+([\s\S]*?)\*\/$/.exec(token[0]);
    if (match) {
      if (block) throw new Error('Storage definition: keep only one @schemadb-storage block.');
      block = { from: token.index!, to: token.index! + token[0].length, json: match[1] };
    }
    if (token[0] === '{') depth++;
    if (token[0] === '}') depth--;
  }
  return block;
}
export function readStorageModel(source: string): StorageModel {
  const block = storageBlock(source);
  if (!block) return emptyStorage;
  let value: unknown;
  try { value = JSON.parse(block.json); } catch { throw new Error('Storage definition: invalid JSON in @schemadb-storage.'); }
  return validateStorageModel(value);
}
export function writeStorageModel(source: string, value: StorageModel) {
  const model = validateStorageModel(value), block = storageBlock(source);
  const replacement = model.units.length || model.links.length
    ? '/* @schemadb-storage\n' + JSON.stringify(model, null, 2).replace(/\*\//g, '*\\u002f') + '\n*/' : '';
  return block ? source.slice(0, block.from) + replacement + source.slice(block.to) : source + (replacement ? '\n\n' + replacement + '\n' : '');
}

export type StorageTable = { id: string; fields: { name: string }[] };
export function storageLinkIssue(link: StorageLink, units: StorageUnit[], tables: StorageTable[]) {
  for (const endpoint of [link.from, link.to]) {
    const unit = units.find(unit => storageNodeId(unit.id) === endpoint.node);
    const table = tables.find(table => table.id === endpoint.node);
    if (!unit && !table) return `Missing endpoint: ${endpoint.node}`;
    if (endpoint.port && !(unit ? storagePorts(unit).some(item => item.port === endpoint.port) : table!.fields.some(field => field.name === endpoint.port)))
      return `Missing ${unit ? 'storage item' : 'column'}: ${endpoint.node}.${endpoint.port}`;
  }
  return '';
}
