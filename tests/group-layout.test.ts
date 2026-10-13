import { test } from "node:test";
import assert from "node:assert/strict";
import { arrangeTables } from "../src/layout";

test("group arrangement packs bounded groups and ungrouped tables without overlapping outlines", async () => {
  const items = Array.from({ length: 15 }, (_, i) => ({ id: String(i), width: 180 + i % 3 * 80, height: 90 + i % 5 * 140 }));
  const groups = [[0, 1, 2, 3], [4, 5, 6], [7, 8, 9, 10], [11, 12]].map(ids => ({ tables: ids.map(String) }));
  const before = JSON.stringify({ items, groups });
  const positions = await arrangeTables(items, [], groups, "groups");
  assert.equal(Object.keys(positions).length, items.length);
  const bounds = groups.map(group => {
    const members = items.filter(item => group.tables.includes(item.id));
    const x = Math.min(...members.map(item => positions[item.id].x)) - 22;
    const y = Math.min(...members.map(item => positions[item.id].y)) - 38;
    return { x, y,
      right: Math.max(...members.map(item => positions[item.id].x + item.width)) + 22,
      bottom: Math.max(...members.map(item => positions[item.id].y + item.height)) + 22,
    };
  });
  bounds.push(...items.slice(13).map(item => ({ ...positions[item.id], right: positions[item.id].x + item.width, bottom: positions[item.id].y + item.height })));
  for (const [i, a] of bounds.entries()) {
    for (const b of bounds.slice(i + 1)) assert(a.right + 50 <= b.x || b.right + 50 <= a.x || a.bottom + 50 <= b.y || b.bottom + 50 <= a.y);
  }
  for (const [i, a] of items.entries()) {
    const p = positions[a.id];
    assert(Number.isFinite(p.x) && Number.isFinite(p.y));
    for (const b of items.slice(i + 1)) {
      const q = positions[b.id];
      assert(p.x + a.width <= q.x || q.x + b.width <= p.x || p.y + a.height <= q.y || q.y + b.height <= p.y);
    }
  }
  assert.equal(JSON.stringify({ items, groups }), before);
});

test("groups preserve table order, ignore missing members, and assign duplicate memberships once", async () => {
  const items = ["a", "b", "c", "d"].map(id => ({ id, width: 200, height: 100 }));
  const positions = await arrangeTables(items, [], [{ tables: ["b", "a", "a", "missing"] }, { tables: ["a", "c"] }, { tables: ["missing"] }], "groups");
  assert.deepEqual(Object.keys(positions).sort(), ["a", "b", "c", "d"]);
  assert.equal(positions.a.y, positions.b.y);
  assert(positions.a.x < positions.b.x);
  assert(positions.c.x > positions.b.x + 200);
  assert.deepEqual(positions, await arrangeTables(items, [], [{ tables: ["b", "a", "a", "missing"] }, { tables: ["a", "c"] }, { tables: ["missing"] }], "groups"));
});

test("group arrangement falls back to compact with no valid groups, including an empty diagram", async () => {
  const items = ["a", "b"].map(id => ({ id, width: 240, height: 150 }));
  const compact = await arrangeTables(items, [], [], "compact");
  assert.deepEqual(await arrangeTables(items, [], [], "groups"), compact);
  assert.deepEqual(await arrangeTables(items, [], [{ tables: ["missing"] }], "groups"), compact);
  assert.deepEqual(await arrangeTables([], [], [{ tables: ["missing"] }], "groups"), {});
});
