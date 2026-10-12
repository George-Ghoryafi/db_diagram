import { test } from 'node:test';
import { request as httpRequest } from 'node:http';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSchema, exportSchema } from '../server/schema.js';
import { SchemaStore } from '../server/storage.js';
import { example } from '../server/example.js';
import { createApp } from '../server/index.js';

const schema = 'Table users {\n id integer [pk]\n email varchar(255) [unique, not null]\n indexes { (id, email) [unique, name: \'identity\'] }\n}';
test('Official DBML v2 parser preserves indexes, groups, references and namespaced tables', () => {
  const model = parseSchema(example);
  assert.equal(model.tables.length, 5); assert.equal(model.refs.length, 6); assert.equal(model.groups.length, 2);
  const users = parseSchema(schema).tables[0];
  assert.equal(users.fields[1].type, 'varchar(255)'); assert.equal(users.indexes[0].name, 'identity'); assert.equal(users.indexes[0].columns.length, 2);
  const namespaced = parseSchema('Table auth.users {\n id int [pk]\n}\nTable things {\n user_id int [ref: > auth.users.id]\n}');
  assert.equal(namespaced.refs[0].fromTable, 'auth.users'); assert.equal(namespaced.refs[0].toTable, 'public.things');
  for (const format of ['postgres', 'mysql', 'mssql']) assert.match(exportSchema(example, format), /CREATE TABLE/i);
  assert.equal(exportSchema(example, 'dbml'), example);
});
test('Invalid DBML produces a useful diagnostic', () => {
  assert.throws(() => parseSchema('Table nope { broken }'), error => error instanceof Error && error.message.length > 5);
});
test('Atomic schema storage prevents conflicts and traversal, backs up revisions and persists layouts', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'local-dbdiagram-'));
  try {
    const store = new SchemaStore(directory);
    const created = await store.write('test', schema);
    assert.equal(store.list()[0].id, 'test');
    await assert.rejects(store.write('../escape', schema), /Invalid schema ID/);
    await assert.rejects(store.write('test', schema), /changed/);
    await assert.rejects(store.write('test', 'Table invalid { broken }', created.revision));
    assert.equal(store.read('test').dbml, schema);
    const updated = await store.write('test', `${schema}\n// Updated`, created.revision);
    await assert.rejects(store.write('test', schema, created.revision), /changed/);
    assert.equal(readFileSync(join(directory, '.backups', `test.${created.revision}.dbml`), 'utf8'), schema);
    const secondStore = new SchemaStore(directory);
    const attempts = await Promise.allSettled([store.write('test', `${schema}\n// Writer A`, updated.revision), secondStore.write('test', `${schema}\n// Writer B`, updated.revision)]);
    assert.equal(attempts.filter(a => a.status === 'fulfilled').length, 1);
    await store.saveLayout('test', {'public.users': {x: 123, y: 345}});
    assert.deepEqual(secondStore.read('test').layout, {'public.users': {x: 123, y: 345}});
    await assert.rejects(store.saveLayout('test', {users: {x: Infinity, y: 0}}), /finite/);
    assert.ok(!readdirSync(directory).some(name => name.endsWith('.tmp')));
    writeFileSync(join(directory, 'outside.txt'), schema);
    symlinkSync(join(directory, 'outside.txt'), join(directory, 'link.dbml'));
    assert.throws(() => store.read('link'), /Symlink/);
  } finally { rmSync(directory, {recursive: true, force: true}); }
});
test('HTTP API rejects hostile origins and validates saves', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'local-dbdiagram-api-'));
  const app = createApp(new SchemaStore(directory));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as {port: number};
  const request = (path: string, options: {method?: string; body?: string; headers?: Record<string, string>} = {}) => new Promise<{status: number; json: () => Promise<Record<string, string>>}>((resolve, reject) => {
    const req = httpRequest({hostname: '127.0.0.1', port: address.port, path, method: options.method || 'GET', headers: {host: '127.0.0.1:4318', 'content-type': 'application/json', ...options.headers}}, res => {
      let body = ''; res.on('data', chunk => {body += chunk;}); res.on('end', () => resolve({status: res.statusCode!, json: async () => JSON.parse(body)}));
    });
    req.on('error', reject); req.end(options.body);
  });
  try {
    assert.equal((await request('/api/schemas', {headers: {origin: 'https://hostile.example'}})).status, 403);
    assert.equal((await request('/api/schemas', {headers: {host: 'hostile.example:4318'}})).status, 403);
    const response = await request('/api/schemas', {method: 'POST', body: JSON.stringify({name: 'test', dbml: schema})});
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.equal((await request('/api/schemas/test', {method: 'PUT', body: JSON.stringify({dbml: schema})})).status, 409);
    assert.equal((await request('/api/parse', {method: 'POST', body: JSON.stringify({dbml: 'nonsense'})})).status, 400);
    assert.equal((await request('/api/schemas/test', {method: 'PUT', body: JSON.stringify({dbml: schema + '\n// updated', revision: created.revision})})).status, 200);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(directory, {recursive: true, force: true}); }
});
