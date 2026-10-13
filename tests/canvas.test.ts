import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleFields, matchesSearch } from "../src/canvas";
import { replaceNote } from "../src/dbml-edit";
import { parseSchema, exportSchema } from "../server/schema";
test("detail levels include composite key and FK fields without changing the schema", () => {
  const fields = [
    { name: "id", pk: true },
    { name: "account_id" },
    { name: "other_pk" },
    { name: "description" },
  ];
  assert.deepEqual(
    visibleFields(fields, "keys", ["account_id", "other_pk"]).map(
      (f) => f.name,
    ),
    ["id", "account_id", "other_pk"],
  );
  assert.deepEqual(visibleFields(fields, "names", []), []);
  assert.equal(visibleFields(fields, "all", []), fields);
  assert(matchesSearch("public.Users.EMAIL", " email "));
});
test("sticky notes keep braces, quotes and multiline text; edit only the top-level note", () => {
  const text =
    'Table users {\n id int [pk]\n Note: "do not change { this }"\n}\nNote todo {\n "old } content"\n}\n';
  const message = 'Design { audit } tables\nKeep "history"';
  const next = replaceNote(
    text,
    "todo",
    `Note todo {\n ${JSON.stringify(message)}\n}`,
  );
  const parsed = parseSchema(next);
  assert.equal(parsed.notes[0].content, message);
  assert.equal(parsed.tables[0].note, "do not change { this }");
  assert.equal(exportSchema(next, "dbml"), next);
  assert.throws(() => replaceNote(text, "missing", ""));
});

import { arrangeTables, type Arrangement } from "../src/layout";
test("all layout modes handle cyclic/disconnected graphs and avoid table overlap", async () => {
  const items = [
    { id: "a", width: 235, height: 500 },
    { id: "b", width: 235, height: 140 },
    { id: "c", width: 235, height: 180 },
    { id: "d", width: 235, height: 350 },
  ];
  const refs = [
    { fromTable: "a", toTable: "b" },
    { fromTable: "b", toTable: "a" },
    { fromTable: "a", toTable: "c" },
  ];
  for (const mode of [
    "left-right",
    "pipeline",
    "snowflake",
    "compact",
  ] as Arrangement[]) {
    const ps = await arrangeTables(items, refs, [{ tables: ["a", "b"] }], mode);
    assert.equal(Object.keys(ps).length, items.length);
    for (const i of items) {
      assert(Number.isFinite(ps[i.id].x) && Number.isFinite(ps[i.id].y));
      for (const j of items.filter((j) => j.id !== i.id)) {
        const a = ps[i.id],
          b = ps[j.id];
        assert(
          a.x + i.width <= b.x ||
            b.x + j.width <= a.x ||
            a.y + i.height <= b.y ||
            b.y + j.height <= a.y,
          `${mode}: ${i.id}/${j.id} overlap`,
        );
      }
    }
  }
  assert.deepEqual(await arrangeTables([], [], [], "compact"), {});
});

import { highlightedRelationships } from "../src/canvas";
test("highlight toggle illuminates all relationships without selection, then focuses a selected table", () => {
  const refs = [
    { id: "ab", fromTable: "a", toTable: "b" },
    { id: "bc", fromTable: "b", toTable: "c" },
    { id: "dd", fromTable: "d", toTable: "d" },
  ];
  assert.deepEqual(
    [...highlightedRelationships(refs, true, "", "")],
    ["ab", "bc", "dd"],
  );
  assert.deepEqual([...highlightedRelationships(refs, true, "a", "")], ["ab"]);
  assert.deepEqual(
    [...highlightedRelationships(refs, true, "b", "")],
    ["ab", "bc"],
  );
  assert.deepEqual([...highlightedRelationships(refs, false, "b", "")], ["ab","bc"]);
  assert.deepEqual([...highlightedRelationships(refs,false,"","")],[]);
  assert.deepEqual(
    [...highlightedRelationships(refs, false, "", "dd")],
    ["dd"],
  );
});

import {foreignKeyTargets} from '../src/canvas';
test('foreign-key indicators respect relationship direction and composite columns',()=>{
 const refs=[{fromTable:'users',fromFields:['id'],toTable:'posts',toFields:['user_id'],relation:'1:*'},{fromTable:'lines',fromFields:['order_id','version'],toTable:'orders',toFields:['id','version'],relation:'*:1'}];
 assert.deepEqual(foreignKeyTargets(refs,'users'),{});
 assert.deepEqual(foreignKeyTargets(refs,'posts'),{user_id:['users.id']});
 assert.deepEqual(foreignKeyTargets(refs,'lines'),{order_id:['orders.id'],version:['orders.version']});
 const self=[{fromTable:'users',fromFields:['parent_id'],toTable:'users',toFields:['id'],relation:'*:1'}];
 assert.deepEqual(foreignKeyTargets(self,'users'),{parent_id:['users.id']});
});

test("left-right puts referenced parents before dependents and aligns siblings", async () => {
  const items = ["root", "a", "b", "leaf"].map(id => ({ id, width: 260, height: id === "root" ? 1100 : 140 }));
  const positions = await arrangeTables(items, [
    { fromTable: "a", toTable: "root", relation: "*:1" },
    { fromTable: "root", toTable: "b", relation: "1:*" },
    { fromTable: "leaf", toTable: "a", relation: "*:1" },
  ], [], "left-right");
  assert(positions.root.x < positions.a.x);
  assert.equal(positions.a.x, positions.b.x);
  assert(positions.a.x < positions.leaf.x);
});

test("compact fills columns independently instead of leaving tall-table row gaps", async () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ id: String(i), width: i === 0 ? 500 : 260, height: i === 0 ? 1100 : 100 }));
  const positions = await arrangeTables(items, [], [], "compact");
  assert(positions[5].y < positions[4].y);
  assert.equal(positions[1].x, positions[5].x);
  assert(positions[1].x >= positions[0].x + 500 + 50);
  assert.equal(new Set(Object.values(positions).map(p => p.x)).size, 4);
});

test("pipeline orders stages by dependency and stacks mixed-size group members", async () => {
  const items = ["parent", "sibling", "child", "other", "ungrouped"].map((id, i) => ({ id, width: 260 + i * 70, height: 180 + i * 100, fields: [{ name: "id", y: 48 }] }));
  const refs = [
    { fromTable: "child", toTable: "parent", fromFields: ["id"], toFields: ["id"], relation: "*:1" },
    { fromTable: "other", toTable: "child", relation: "*:1" },
    { fromTable: "ungrouped", toTable: "parent", relation: "*:1" },
    { fromTable: "missing", toTable: "parent", relation: "*:1" },
  ];
  const positions = await arrangeTables(items, refs, [{ tables: ["child", "other", "missing"] }, { tables: ["parent", "sibling", "child"] }], "pipeline");
  assert.equal(Object.keys(positions).length, items.length);
  assert(positions.parent.x < positions.child.x);
  assert.equal(positions.parent.x, positions.sibling.x);
  assert.equal(positions.child.x, positions.other.x);
  assert(positions.sibling.y >= positions.parent.y + 180 + 28);
});

test("all layouts handle a dense 15-table graph with field ports, cycles and very tall tables", async () => {
  const counts = [35, 10, 4, 13, 17, 6, 3, 7, 4, 11, 5, 7, 4, 9, 4];
  const items = counts.map((count, i) => ({ id: String(i), width: 260 + i % 3 * 20, height: 60 + count * 30, fields: Array.from({ length: count }, (_, f) => ({ name: "field" + f, y: 48 + f * 30 })) }));
  const pairs = [[1,2],[1,3],[2,14],[2,11],[3,3],[3,11],[3,14],[3,14],[4,8],[4,11],[4,14],[5,12],[5,1],[6,0],[7,14],[7,11],[8,14],[8,11],[9,14],[9,14],[9,11],[10,11],[10,14],[11,14],[11,14],[11,3],[12,4],[12,3],[13,14],[14,0]];
  const refs = pairs.map(([from, to]) => ({ fromTable: String(from), toTable: String(to), fromFields: ["field1", "field2"], toFields: ["field0", "field1"], relation: "*:1" }));
  const groups = [[0,14,13,6],[11,10,9,7],[2,3,1],[8,4,12,5]].map(ids => ({ tables: ids.map(String) }));
  const { routeRelationships, crossesTable } = await import('../src/edge-routing');
  const { relationshipPorts } = await import('../src/canvas');
  const portRefs = refs.map((ref, i) => ({ ...ref, id: String(i) }));
  const ports = relationshipPorts(portRefs, 'all');
  const original = JSON.stringify({ items, refs, groups });
  for (const mode of ["left-right", "pipeline", "snowflake", "compact", "groups"] as Arrangement[]) {
    const positions = await arrangeTables(items, refs, groups, mode);
    assert.equal(Object.keys(positions).length, items.length);
    const tables = items.map(item => ({ ...positions[item.id], width:item.width, height:item.height }));
    const routes = routeRelationships(portRefs.map(ref => ({ id:ref.id,
      source:{x:positions[ref.fromTable].x+items[Number(ref.fromTable)].width,y:positions[ref.fromTable].y+78+ports[ref.id].source.offset},
      target:{x:positions[ref.toTable].x,y:positions[ref.toTable].y+48+ports[ref.id].target.offset},
    })), tables);
    const segments: {id:string;a:{x:number;y:number};b:{x:number;y:number}}[] = [];
    for(const [id, route] of Object.entries(routes)) {
      assert.ok(route, `${mode}: relationship ${id} has a route`);
      for(let i=1;i<route.length;i++) {
        const a: {x:number;y:number}=route[i-1],b: {x:number;y:number}=route[i];
        assert.ok(!tables.some(table=>crossesTable(a,b,table)), `${mode}: route avoids tables`);
        for(const other of segments) {
          if(other.id===id)continue;
          if(a.y===b.y && other.a.y===other.b.y && a.y===other.a.y)
            assert.ok(Math.min(Math.max(a.x,b.x),Math.max(other.a.x,other.b.x))<=Math.max(Math.min(a.x,b.x),Math.min(other.a.x,other.b.x)) ||
              (portRefs[Number(id)].fromTable === portRefs[Number(other.id)].fromTable && a.y === positions[portRefs[Number(id)].fromTable].y + 78 + ports[id].source.offset) ||
              (portRefs[Number(id)].toTable === portRefs[Number(other.id)].toTable && a.y === positions[portRefs[Number(id)].toTable].y + 48 + ports[id].target.offset),`${mode}: only common attribute stems share horizontal lines`);
          if(a.x===b.x && other.a.x===other.b.x && a.x===other.a.x)
            assert.ok(Math.min(Math.max(a.y,b.y),Math.max(other.a.y,other.b.y))<=Math.max(Math.min(a.y,b.y),Math.min(other.a.y,other.b.y)),`${mode}: vertical lines stay separate`);
        }
        segments.push({id,a,b});
      }
    }
    for (let i = 0; i < items.length; i++) {
      const a = items[i], p = positions[a.id];
      assert(Number.isFinite(p.x) && Number.isFinite(p.y));
      for (const b of items.slice(i + 1)) {
        const q = positions[b.id];
        assert(p.x + a.width <= q.x || q.x + b.width <= p.x || p.y + a.height <= q.y || q.y + b.height <= p.y, `${mode}: ${a.id}/${b.id} overlap`);
      }
    }
  }
  assert.equal(JSON.stringify({ items, refs, groups }), original);
});

test('attributes share one port per cardinality and selection changes only the symbol owner', async () => {
  const { relationshipPorts, relationshipFlow } = await import('../src/canvas');
  const refs = Array.from({ length: 6 }, (_, i) => ({ id: String(i), relation: i % 2 ? '*:1' : '1:1', fromTable: 'users', fromFields: ['id'], toTable: 'orders'+i, toFields: ['user_id'] }));
  const ports = relationshipPorts(refs, 'all');
  assert.equal(new Set(refs.map(ref => ports[ref.id].source.offset)).size, 2);
  assert.equal(refs.filter(ref => ports[ref.id].source.showSymbol).length, 2);
  const selected = relationshipPorts(refs, 'all', '4');
  assert.equal(selected['4'].source.showSymbol, true);
  assert.equal(selected['0'].source.showSymbol, false);
  assert.equal(relationshipPorts(refs, 'all', '', new Set(['4']))['4'].source.showSymbol, true);
  refs.forEach(ref => { assert.equal(selected[ref.id].source.offset, ports[ref.id].source.offset); assert.equal(ports[ref.id].target.showSymbol, true); });
  const onlyOneType = relationshipPorts(refs.map(ref => ({...ref, relation:'*:1'})), 'all');
  assert.equal(new Set(refs.map(ref => onlyOneType[ref.id].source.offset)).size, 1);
  assert.equal(refs.filter(ref => onlyOneType[ref.id].source.showSymbol).length, 1);
  assert.equal(relationshipFlow('1:*'), 'forward');
  assert.equal(relationshipFlow('*:1'), 'reverse');
  assert.equal(relationshipFlow('*:*'), 'both');
  const separate = [refs[0], {...refs[1], fromFields:['other']}];
  assert.equal(relationshipPorts(separate, 'all')['0'].source.offset, 0);
  assert.notEqual(relationshipPorts(separate, 'names')['0'].source.offset, 0);
});

test('attribute hover temporarily highlights incoming, outgoing and composite references', async () => {
  const { highlightedRelationships } = await import('../src/canvas');
  const refs = [
    {id:'out',fromTable:'a',fromFields:['org','id'],toTable:'b',toFields:['org','id']},
    {id:'in',fromTable:'c',fromFields:['aid'],toTable:'a',toFields:['id']},
    {id:'other',fromTable:'a',fromFields:['different'],toTable:'d',toFields:['id']},
  ];
  assert.deepEqual([...highlightedRelationships(refs,false,'a','',{tableId:'a',field:'id'})],['out','in']);
  assert.deepEqual([...highlightedRelationships(refs,false,'a','')],['out','in','other']);
  assert.deepEqual([...highlightedRelationships(refs,false,'','other',{tableId:'a',field:'org'})],['out','other']);
});
