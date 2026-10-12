import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSchema,exportSchema} from '../server/schema';
test('UI group syntax and index source round trip intact',()=>{
const text='Table users {\n id int [pk]\n email varchar\n indexes {\n email [unique]\n }\n}\nTableGroup identity [color: #537bad] {\n public.users\n}\n';
const model=parseSchema(text);assert.equal(model.groups[0].color,'#537bad');assert.deepEqual(model.groups[0].tables,['public.users']);assert.equal(exportSchema(text,'dbml'),text);
});
