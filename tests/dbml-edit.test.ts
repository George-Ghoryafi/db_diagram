import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Parser} from '@dbml/core';
import {addIndex} from '../src/dbml-edit';
test('adds indexes without damaging nested blocks or quoted braces',()=>{
 for(const source of ["Table users {\n id int [pk]\n email varchar [note: '}']\n}","Table users {\n id int\n email varchar\n indexes {\n id\n }\n}"]){
 const out=addIndex(source,'public.users',"email [unique, name: 'email_idx']");
 const d=Parser.parse(out,'dbml').export(); assert.equal(d.schemas[0].tables[0].indexes.at(-1)?.name,'email_idx');
 }
});
