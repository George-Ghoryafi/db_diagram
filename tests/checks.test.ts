import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRule, describeCheck } from '../src/checks';
import { parseSchema, exportSchema } from '../src/schema';
test('checks attach to all referenced columns and retain inline checks and exact SQL', () => {
 const dbml = `Table preferences {
  value int [check: \`value > 0\`]
  unit text
  objectives text
  checks {
   \`((value >= 1) AND (value <= CASE unit WHEN 'days'::text THEN 365 WHEN 'weeks'::text THEN 52 ELSE 12 END))\` [name: 'window']
   \`(unit = ANY (ARRAY['days'::text, 'weeks'::text, 'months'::text]))\` [name: 'units']
   \`(length(objectives) <= 10000)\`
  }
 }`;
 const table = parseSchema(dbml).tables[0];
 assert.equal(table.checks.length, 4);
 assert.equal(table.fields[0].checks.length, 2);
 assert.equal(table.fields[1].checks.length, 2);
 assert.deepEqual(table.fields[1].checks[1].options, ['days','weeks','months']);
 assert.deepEqual(table.checks[0].limits, [{label:'days',maximum:'365'},{label:'weeks',maximum:'52'},{label:'Other values',maximum:'12'}]);
 assert.equal(table.fields[2].checks[0].summary, 'At most 10,000 characters');
 assert.match(exportSchema(dbml,'postgres'), /CHECK/);
});
test('check explanations stay conservative and identifiers ignore SQL literals, functions and casts', () => {
 assert.equal(describeCheck('((technical_level >= 1) AND (technical_level <= 5))').summary, 'Between 1 and 5 (inclusive)');
 assert.equal(describeCheck('(value >= 1 OR value <= 5)').summary, 'Custom SQL condition');
 assert.equal(describeCheck('value >= 1 AND other <= 5').summary, 'Custom SQL condition');
 assert.deepEqual(checkRule({expression:`length("Body") <= 10 AND unit <> 'value'::text /* value */ AND unit <> $$value$$`},['Body','unit','value','length','text']).fields,['Body','unit']);
 assert.deepEqual(describeCheck("unit IN ('owner''s', 'member')").options,["owner's",'member']);
});
test('index indicators cover composite and expression indexes without marking unrelated fields',()=>{
 const table=parseSchema(`Table accounts {
 id int [pk]
 email text
 org_id int
 note text
 indexes {
 (org_id, email) [unique, name: 'org_email']
 (\`lower(email)\`) [name: 'email_lower']
 }
}`).tables[0];
 assert.equal(table.fields.find(field=>field.name==='email')!.indexes.length,2);
 assert.equal(table.fields.find(field=>field.name==='org_id')!.indexes[0].name,'org_email');
 assert.equal(table.fields.find(field=>field.name==='note')!.indexes.length,0);
});
