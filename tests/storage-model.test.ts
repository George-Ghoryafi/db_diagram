import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSchema, exportSchema } from '../src/schema';
import { readStorageModel, writeStorageModel, validateStorageModel, shapeFields, storageLinkIssue, type StorageModel } from '../src/storage-model';
const sql = `Table public.documents {
  id uuid [pk]
  object_key text
  indexes { object_key [unique] }
  Note: 'Retain this table and index.'
}
Table users { id uuid [pk] }
TableGroup app {
 public.documents
 users
}
`;
import { mixedStorage } from './fixtures/storage';
import { arrangeTables, type Arrangement } from '../src/layout';
import { storageNodeHeight, storageNodeId } from '../src/storage-model';

test('mixed storage round trips in portable DBML comments without changing SQL tables, indexes or groups', () => {
  const source = writeStorageModel(sql, mixedStorage), model = parseSchema(source);
  assert.deepEqual(model.storage, mixedStorage);
  assert.deepEqual(model.tables, parseSchema(sql).tables);
  assert.deepEqual(model.groups, parseSchema(sql).groups);
  assert.equal(exportSchema(source, 'dbml'), source);
  assert.equal(exportSchema(source, 'postgres'), exportSchema(sql, 'postgres'));
  assert.ok(!source.includes('like */'));
  const edited = writeStorageModel(source, { ...mixedStorage, units: mixedStorage.units.map(unit => ({ ...unit, name: unit.name + ' v2' })) });
  assert.equal(edited.split('@schemadb-storage').length, 2);
  assert.ok(edited.startsWith(sql));
  assert.equal(writeStorageModel(source, { version: 1, units: [], links: [] }).trim(), sql.trim());
});
test('storage parser ignores markers in strings, notes, ordinary comments and nested comments; rejects ambiguous or invalid definitions', () => {
  assert.equal(readStorageModel(`Note example { '''/* @schemadb-storage {"version":9} */''' }`).units.length, 0);
  assert.equal(readStorageModel('// /* @schemadb-storage {} */').units.length, 0);
  assert.throws(() => parseSchema(sql + '\n/* @schemadb-storage {"version":9,"units":[],"links":[]} */'), /version/);
  assert.throws(() => readStorageModel('/* @schemadb-storage broken */'), /invalid JSON/);
  assert.throws(() => readStorageModel(writeStorageModel(sql, mixedStorage) + writeStorageModel('', mixedStorage)), /only one/);
  assert.throws(() => validateStorageModel({ ...mixedStorage, units: [...mixedStorage.units, mixedStorage.units[0]] }), /duplicate store/);
  assert.throws(() => validateStorageModel({ ...mixedStorage, units: [{ ...mixedStorage.units[0], items: [mixedStorage.units[0].items[0], mixedStorage.units[0].items[0]] }] }), /duplicate item/);
  assert.throws(() => validateStorageModel({ ...mixedStorage, units: [{ ...mixedStorage.units[1], items: [{ ...mixedStorage.units[1].items[0], shape: '{broken' }] }] }), /valid JSON/);
});
test('document shapes expose nested objects, arrays and JSON Schema as distinct field ports', () => {
  const rows = shapeFields(mixedStorage.units[1].items[0].shape);
  assert.ok(rows.some(row => row.path === 'metadata.language' && row.depth === 1 && row.type === 'string'));
  assert.ok(rows.some(row => row.path === 'chunks[].text' && row.depth === 1));
  assert.deepEqual(shapeFields('{"type":"object","properties":{"document_id":{"type":"string"},"chunks":{"type":"array","items":{"type":"object","properties":{"text":{"type":"string"}}}}}}').map(row => row.path), ['document_id', 'chunks', 'chunks[].text']);
  assert.deepEqual(shapeFields('{"type":"object"}'), []);
  for (const link of mixedStorage.links) assert.equal(storageLinkIssue(link, mixedStorage.units, parseSchema(sql).tables), '');
  assert.match(storageLinkIssue({ ...mixedStorage.links[0], from: { node: 'public.documents', port: 'removed_column' } }, mixedStorage.units, parseSchema(sql).tables), /Missing column/);
  assert.match(storageLinkIssue({ ...mixedStorage.links[0], to: { node: 'storage:files', port: 'removed_bucket' } }, mixedStorage.units, parseSchema(sql).tables), /Missing storage item/);
});
test('all auto-layouts include mixed SQL and storage nodes without overlap, including storage-only diagrams', async () => {
  const model = parseSchema(writeStorageModel(sql, mixedStorage));
  const items = [...model.tables.map(table => ({ id: table.id, width: 260, height: 180 })), ...mixedStorage.units.map(unit => ({ id: storageNodeId(unit.id), width: 300, height: storageNodeHeight(unit) }))];
  const refs = mixedStorage.links.map(link => ({ fromTable: link.from.node, toTable: link.to.node, relation: '1:*' }));
  for (const mode of ['left-right', 'pipeline', 'groups', 'snowflake', 'compact'] as Arrangement[]) {
    const positions = await arrangeTables(items, refs, model.groups, mode);
    assert.equal(Object.keys(positions).length, items.length);
    for (const [i, a] of items.entries()) for (const b of items.slice(i + 1)) {
      const p = positions[a.id], q = positions[b.id];
      assert.ok(p.x + a.width <= q.x || q.x + b.width <= p.x || p.y + a.height <= q.y || q.y + b.height <= p.y, mode + ': overlapping nodes');
    }
  }
  assert.equal(parseSchema(writeStorageModel('', { ...mixedStorage, links: [] })).storage.units.length, 3);
});
