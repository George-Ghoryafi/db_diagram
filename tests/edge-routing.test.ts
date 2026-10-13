import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crossesTable, routeRelationship, routeGeometry, type TableBounds, type Point } from '../src/edge-routing';

function verify(source: Point, target: Point, tables: TableBounds[]) {
  const route = routeRelationship(source, target, tables);
  assert.ok(route, 'A route exists');
  assert.deepEqual(route[0], source);
  assert.deepEqual(route.at(-1), target);
  for (let i = 1; i < route.length; i++) {
    assert.ok(route[i].x === route[i - 1].x || route[i].y === route[i - 1].y, 'Segments remain orthogonal');
    assert.ok(!tables.some(t => crossesTable(route[i - 1], route[i], t)), 'No segment crosses a table');
  }
  assert.ok(route[1].x > source.x, 'Source exits to the right');
  assert.ok(route.at(-2)!.x < target.x, 'Target enters from the left');
  assert.match(routeGeometry(route).path, /^M /);
  return route;
}

test('relationship routes avoid intervening tables and update when obstacles move', () => {
  const source = { x: 100, y: 50 }, target = { x: 500, y: 50 };
  const tables = [{ x: 0, y: 0, width: 100, height: 100 }, { x: 500, y: 0, width: 100, height: 100 }];
  const direct = verify(source, target, tables);
  const detour = verify(source, target, [...tables, { x: 220, y: 0, width: 100, height: 100 }]);
  assert.ok(detour.some(p => p.y < 0 || p.y > 100));
  assert.notDeepEqual(direct, detour);
});

test('self references and targets behind the source route around their own tables', () => {
  verify({ x: 100, y: 30 }, { x: 0, y: 70 }, [{ x: 0, y: 0, width: 100, height: 100 }]);
  verify({ x: 400, y: 40 }, { x: 0, y: 40 }, [{ x: 300, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 100, height: 100 }]);
});

test('routes can use narrow gaps between tables', () => {
  verify({ x: 100, y: 50 }, { x: 110, y: 50 }, [{ x: 0, y: 0, width: 100, height: 100 }, { x: 110, y: 0, width: 100, height: 100 }]);
});

test('parallel relationships use distinct lanes and avoid table obstacles', async () => {
  const { routeRelationships } = await import('../src/edge-routing');
  const tables = [{ x:0,y:0,width:100,height:100 },{ x:500,y:0,width:100,height:100 },{ x:220,y:0,width:100,height:100 }];
  const requests = [-9, 0, 9].map((offset, i) => ({ id:String(i), source:{x:100,y:50+offset},target:{x:500,y:50+offset} }));
  const routes = routeRelationships(requests,tables);
  const segments: { a:Point;b:Point;id:string }[] = [];
  for (const request of requests) {
    const route = routes[request.id];
    assert.ok(route);
    assert.deepEqual(route[0],request.source);
    assert.deepEqual(route.at(-1),request.target);
    for(let i=1;i<route.length;i++) {
      const a: Point=route[i-1],b: Point=route[i];
      assert.ok(a.x===b.x || a.y===b.y);
      assert.ok(!tables.some(table=>crossesTable(a,b,table)));
      for(const other of segments) {
        if(other.id===request.id)continue;
        const horizontal=a.y===b.y && other.a.y===other.b.y && a.y===other.a.y;
        const vertical=a.x===b.x && other.a.x===other.b.x && a.x===other.a.x;
        if(horizontal)assert.ok(Math.min(Math.max(a.x,b.x),Math.max(other.a.x,other.b.x))<=Math.max(Math.min(a.x,b.x),Math.min(other.a.x,other.b.x)));
        if(vertical)assert.ok(Math.min(Math.max(a.y,b.y),Math.max(other.a.y,other.b.y))<=Math.max(Math.min(a.y,b.y),Math.min(other.a.y,other.b.y)));
      }
      segments.push({a,b,id:request.id});
    }
  }
});
