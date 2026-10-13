import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordLinks, matchesRecord } from '../src/record-links';

test('FK records link to the parent in both relationship directions, including zero', () => {
  const ref = { fromTable: 'public.users', fromFields: ['id'], toTable: 'public.posts', toFields: ['user_id'], relation: '1:*' };
  const expected = [{ tableId: 'public.users', columns: ['id'], values: ['0'] }];
  assert.deepEqual(recordLinks([ref], 'public.posts', 'user_id', ['id', 'user_id'], [{value: 10}, {value: 0}]), expected);
  assert.deepEqual(recordLinks([{ fromTable: ref.toTable, fromFields: ref.toFields, toTable: ref.fromTable, toFields: ref.fromFields, relation: '*:1' }], 'public.posts', 'user_id', ['user_id'], [{value: 0}]), expected);
  assert.deepEqual(recordLinks([ref], 'public.users', 'id', ['id'], [{value: 0}]), []);
  assert.deepEqual(recordLinks([ref], 'public.posts', 'user_id', ['user_id'], [{value: null}]), []);
  assert.deepEqual(recordLinks([ref], 'public.posts', 'user_id', ['user_id'], [{value: 'now()', type: 'expression'}]), []);
});

test('composite, self and one-to-one references match the complete parent key', () => {
  const composite = { fromTable: 'items', fromFields: ['shop_id', 'code'], toTable: 'shops', toFields: ['id', 'code'], relation: '*:1' };
  const [link] = recordLinks([composite], 'items', 'code', ['code', 'shop_id'], [{value: 'A'}, {value: 7}]);
  assert.deepEqual(link, {tableId: 'shops', columns: ['id', 'code'], values: ['7', 'A']});
  assert.ok(matchesRecord(['code', 'id'], [{value: 'A'}, {value: 7}], link));
  assert.ok(!matchesRecord(['code', 'id'], [{value: 'B'}, {value: 7}], link));
  assert.deepEqual(recordLinks([composite], 'items', 'code', ['code'], [{value: 'A'}]), []);
  const self = { fromTable: 'users', fromFields: ['manager_id'], toTable: 'users', toFields: ['id'], relation: '*:1' };
  assert.equal(recordLinks([self], 'users', 'manager_id', ['manager_id'], [{value: 2}])[0].tableId, 'users');
  const one = { fromTable: 'users', fromFields: ['id'], toTable: 'profiles', toFields: ['user_id'], relation: '1:1' };
  assert.equal(recordLinks([one], 'profiles', 'user_id', ['user_id'], [{value: 2}])[0].tableId, 'users');
});
