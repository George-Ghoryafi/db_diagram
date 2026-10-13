import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_DBML_BYTES, validateDbmlText, SchemaError } from '../src/schema';
test('DBML has a 100 MB UTF-8 limit, including multibyte text', () => {
  assert.equal(MAX_DBML_BYTES,100_000_000);
  validateDbmlText('x'.repeat(MAX_DBML_BYTES));
  assert.throws(()=>validateDbmlText('x'.repeat(MAX_DBML_BYTES+1)),(error:unknown)=>error instanceof SchemaError && error.status===413);
  assert.throws(()=>validateDbmlText('é'.repeat(MAX_DBML_BYTES/2+1)),/100 MB/);
  assert.throws(()=>validateDbmlText(null),/must be a string/);
});
