import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCardinality } from '../src/cardinality';
import { parseSchema, exportSchema } from '../src/schema';
import { setRelationshipCardinality, setVisualColor } from '../src/dbml-edit';
import { relationshipFlow, foreignKeyTargets } from '../src/canvas';
import { recordLinks } from '../src/record-links';
const dbml = `Table users {\n id int [pk]\n}\nTable posts {\n id int [pk]\n user_id int [ref: >? users.id]\n}\n`;
test('native optional cardinality renders, retains FK records, and survives inline color edits',async()=>{
 const ref=parseSchema(dbml).refs[0];
 assert.equal(ref.relation,'0..1:*');
 assert.equal(relationshipFlow(ref.relation),'forward');
 assert.deepEqual(foreignKeyTargets([ref],'public.posts'),{user_id:['public.users.id']});
 assert.equal(recordLinks([ref],'public.posts','user_id',['user_id'],[{value:0}])[0].tableId,'public.users');
 assert.equal(parseSchema(await setVisualColor(dbml,'relationship',ref.id,'#abcdef')).refs[0].relation,ref.relation);
});
test('bounded cardinalities preserve SQL, storage comments, names and reference settings',async()=>{
 const original = dbml + '\n/* @schemadb-storage\n{"version":1,"units":[],"links":[]}\n*/\n';
 const next = await setRelationshipCardinality(original,'public.ref0','2..5','0..1');
 assert.equal(parseSchema(next).refs[0].relation,'2..5:0..1');
 assert.equal(parseSchema(next).tables[1].fields[1].name,'user_id');
 assert.match(next, /ref: \?</);
 assert.match(exportSchema(next,'postgres'), /FOREIGN KEY/);
 assert.ok(next.includes('/* @schemadb-storage'));
 assert.equal(relationshipFlow('1:2..5'),'forward');
 const updated = await setRelationshipCardinality(next,'public.ref0','1..*','1');
 assert.equal(parseSchema(updated).refs[0].relation,'1..*:1');
 assert.equal((updated.match(/@schemadb-cardinality/g)||[]).length,1);
 await assert.rejects(setRelationshipCardinality(next,'public.ref0','5..2','1'));
});
test('invalid and ambiguous bounds are rejected',()=>{
 for(const input of ['-1','1.5','2..1','x..y','9007199254740992','1..Infinity']) assert.throws(()=>parseCardinality(input));
 assert.deepEqual(parseCardinality('0..1'),{minimum:0,maximum:1});
 assert.deepEqual(parseCardinality('2..*'),{minimum:2,maximum:null});
});
test('bounded edits retain named composite references, settings and quoted identifiers',async()=>{
 const source=`Table "order-items" {\n org_id int\n item_id int\n}\nTable inventory {\n org_id int\n id int\n indexes {\n (org_id,id) [pk]\n }\n}\nRef stock {\n "order-items".(org_id,item_id) > inventory.(org_id,id) [delete: cascade, color: #abcdef]\n}`;
 const next=await setRelationshipCardinality(source,'public.ref0','0..*','0..1');
 const model=parseSchema(next);
 assert.equal(model.refs[0].name,'stock');
 assert.equal(model.refs[0].relation,'0..*:0..1');
 assert.equal(model.refs[0].color,'#abcdef');
 assert.deepEqual(model.refs[0].fromFields,['org_id','item_id']);
 assert.match(exportSchema(next,'postgres'),/ON DELETE CASCADE/);
 assert.throws(()=>parseSchema(next+'\n/* @schemadb-cardinality {"version":1,"relationships":{}} */'));
});
