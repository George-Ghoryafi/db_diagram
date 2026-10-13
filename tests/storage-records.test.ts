import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateStorageModel, validateStorageRecords, writeStorageModel, type StorageModel } from '../src/storage-model';
import { parseSchema, exportSchema } from '../src/schema';
import { mixedStorage } from './fixtures/storage';

test('sample records preserve JSON types, nested documents and object metadata through DBML round trips', () => {
  const sql = 'Table documents { id uuid [pk] }';
  const model = parseSchema(writeStorageModel(sql, { ...mixedStorage, links: [] }));
  assert.deepEqual(model.storage.units, mixedStorage.units);
  const record = model.storage.units[1].items[0].records[0];
  assert.deepEqual(record.metadata, { language: 'en', reviewed: false });
  assert.deepEqual(record.chunks, [{ text: 'First paragraph', score: 0 }]);
  assert.equal(record.optional, null);
  assert.equal(exportSchema(writeStorageModel(sql, { ...mixedStorage, links: [] }), 'postgres'), exportSchema(sql, 'postgres'));
  assert.deepEqual(validateStorageRecords('document', {}, [{ empty: '', zero: 0, bool: false, nullable: null, list: [1, true, null] }])[0], { empty: '', zero: 0, bool: false, nullable: null, list: [1, true, null] });
});
test('sample record validation rejects invalid containers, duplicate keys and invalid object sizes', () => {
  assert.throws(() => validateStorageRecords('document', {}, [null]), /array of objects/);
  assert.throws(() => validateStorageRecords('document', {}, [{ bad: Infinity }]), /array of objects/);
  assert.throws(() => validateStorageRecords('kv', {}, [{ key: 'a' }]), /needs a value/);
  assert.deepEqual(validateStorageRecords('kv', {}, [{ key: 'a', value: null }]), [{ key: 'a', value: null }]);
  assert.throws(() => validateStorageRecords('kv', {}, [{ key: 'a', value: 0 }, { key: 'a', value: false }]), /unique/);
  assert.throws(() => validateStorageRecords('blob', {}, [{ key: '' }]), /non-empty/);
  assert.throws(() => validateStorageRecords('blob', {}, [{ key: 'a', size_bytes: -1 }]), /non-negative integer/);
});
test('vector indexes and sample vectors round trip and validate dimension and metric configuration', () => {
  const storage: StorageModel = validateStorageModel({ version: 1, units: [{ id: 'vectors', kind: 'vector', name: 'Semantic search', provider: 'Qdrant', items: [{ id: 'chunks', name: 'document_chunks', dimensions: 3, metric: 'cosine', shape: '{"document_id":"uuid","text":"string"}', records: [{ id: 'chunk-1', vector: [0.1, -0.3, 0], metadata: { document_id: 'doc-1', text: 'Hello' } }] }] }], links: [] });
  assert.deepEqual(parseSchema(writeStorageModel('', storage)).storage, storage);
  assert.throws(() => validateStorageRecords('vector', { dimensions: 3 }, [{ id: 'a', vector: [1, 2] }]), /3 dimensions/);
  assert.throws(() => validateStorageRecords('vector', {}, [{ id: 'a', vector: [1, 'bad'] }]), /finite numbers/);
  assert.throws(() => validateStorageRecords('vector', {}, [{ id: 'a', vector: [] }]), /non-empty array/);
  assert.throws(() => validateStorageRecords('vector', {}, [{ id: 'a', vector: [1] }, { id: 'a', vector: [2] }]), /unique/);
  assert.throws(() => validateStorageModel({ ...storage, units: [{ ...storage.units[0], items: [{ ...storage.units[0].items[0], dimensions: 0 }] }] }), /dimensions/);
  assert.throws(() => validateStorageModel({ ...storage, units: [{ ...storage.units[0], items: [{ ...storage.units[0].items[0], metric: 'unknown' }] }] }), /metric/);
});
