import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crossesTable, routeRelationship, routeGeometry, storageLabelPosition, type TableBounds, type Point } from '../src/edge-routing';

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

test('rounded routes match 10px bends without cutting through table corners', () => {
  const points=[{x:0,y:0},{x:100,y:0},{x:100,y:100}];
  assert.equal(routeGeometry(points).path,'M 0 0 L 90 0 Q 100 0 100 10 L 100 100');
  assert.equal(routeGeometry([{x:0,y:0},{x:8,y:0},{x:8,y:40}]).path,'M 0 0 L 4 0 Q 8 0 8 4 L 8 40');
  assert.equal(routeGeometry(points,[{x:100,y:0,width:100,height:100}]).path,'M 0 0 L 100 0 L 100 100');
  assert.equal(routeGeometry(points,[{x:106,y:0,width:100,height:100}]).path,'M 0 0 L 94 0 Q 100 0 100 6 L 100 100');
});

test('selected relationship labels sit on the segment nearest the click', async () => {
  const { projectToRoute }=await import('../src/edge-routing');
  const route=[{x:0,y:0},{x:100,y:0},{x:100,y:100}];
  assert.deepEqual(projectToRoute(route,{x:104,y:70}),{x:100,y:70});
  assert.deepEqual(projectToRoute(route,{x:25,y:-8}),{x:25,y:0});
});

test('references attach to facing sides or the same side for vertically stacked tables', async () => {
  const { routeRelationships }=await import('../src/edge-routing');
  const { relationshipSides }=await import('../src/canvas');
  assert.deepEqual(relationshipSides({x:400,width:100},{x:0,width:100}),{sourceSide:'left',targetSide:'right'});
  assert.deepEqual(relationshipSides({x:0,width:100},{x:400,width:100}),{sourceSide:'right',targetSide:'left'});
  assert.deepEqual(relationshipSides({x:0,width:100},{x:0,width:100}),{sourceSide:'right',targetSide:'right'});
  assert.deepEqual(relationshipSides({x:0,width:100},{x:0,width:100},true),{sourceSide:'right',targetSide:'left'});
  const tables=[{x:0,y:0,width:100,height:100},{x:400,y:0,width:100,height:100},{x:0,y:250,width:100,height:100}];
  const requests=[
    {id:'back',source:{x:400,y:50},target:{x:100,y:50},sourceSide:'left' as const,targetSide:'right' as const},
    {id:'stacked',source:{x:100,y:70},target:{x:100,y:300},sourceSide:'right' as const,targetSide:'right' as const},
  ];
  const routes=routeRelationships(requests,tables);
  for(const request of requests){const route=routes[request.id];assert.ok(route);assert.deepEqual(route[0],request.source);assert.deepEqual(route.at(-1),request.target);for(let i=1;i<route.length;i++)assert.ok(!tables.some(t=>crossesTable(route[i-1],route[i],t)));}
  assert.ok(routes.back![1].x<requests[0].source.x);
  assert.ok(routes.stacked!.at(-2)!.x>requests[1].target.x);
});


test('storage labels use a clear segment instead of covering endpoint nodes', () => {
  const point = storageLabelPosition([{x:100,y:30},{x:450,y:30},{x:450,y:200},{x:600,y:200}], [{x:0,y:0,width:100,height:100},{x:200,y:0,width:300,height:80},{x:500,y:150,width:100,height:100}], 100);
  assert.equal(point.x,450);
  assert.equal(point.y,115);
});

test('same-attribute cables share a long trunk and fork near their destinations in either direction',async()=>{
 const {routeRelationships}=await import('../src/edge-routing');
 const tables=[{x:0,y:150,width:100,height:100},{x:500,y:0,width:100,height:100},{x:500,y:300,width:100,height:100}];
 const requests=[{id:'a',source:{x:100,y:200},target:{x:500,y:50},sourceBundle:'parent.id:1:right'},{id:'b',source:{x:100,y:200},target:{x:500,y:350},sourceBundle:'parent.id:1:right'}];
 for(const reversed of [false,true]){
  const input=reversed?requests.map(ref=>({id:ref.id,source:ref.target,target:ref.source,targetBundle:ref.sourceBundle,sourceSide:'left' as const,targetSide:'right' as const})):requests;
  const routes=routeRelationships(input,tables);
  for(const ref of input){const route=routes[ref.id];assert.ok(route);assert.deepEqual(route[0],ref.source);assert.deepEqual(route.at(-1),ref.target);for(let i=1;i<route.length;i++)assert.ok(!tables.some(table=>crossesTable(route[i-1],route[i],table)));}
  const aligned=(route:Point[])=>route.slice(1).flatMap((b,i)=>route[i].y===200&&b.y===200?[{min:Math.min(route[i].x,b.x),max:Math.max(route[i].x,b.x)}]:[]);
  const a=aligned(routes.a!),b=aligned(routes.b!);
  assert.ok(a.some(left=>b.some(right=>Math.min(left.max,right.max)-Math.max(left.min,right.min)>300)),'Shared stem reaches close to destination tables');
 }
});

test('cable bundles respect obstacles and keep unrelated cardinalities separate',async()=>{
 const {routeRelationships,branchLabelPosition}=await import('../src/edge-routing');
 const tables=[{x:0,y:150,width:100,height:100},{x:500,y:0,width:100,height:100},{x:500,y:300,width:100,height:100},{x:250,y:150,width:100,height:100}];
 const requests=[{id:'a',source:{x:100,y:200},target:{x:500,y:50},sourceBundle:'parent.id:1:right'},{id:'b',source:{x:100,y:200},target:{x:500,y:350},sourceBundle:'parent.id:1:right'},{id:'other',source:{x:100,y:210},target:{x:500,y:70},sourceBundle:'parent.id:*:right'}];
 const routes=routeRelationships(requests,tables);
 for(const ref of requests){const route=routes[ref.id];assert.ok(route);for(let i=1;i<route.length;i++)assert.ok(!tables.some(table=>crossesTable(route[i-1],route[i],table)));}
 const a=[{x:100,y:200},{x:476,y:200},{x:476,y:50},{x:500,y:50}],b=[{x:100,y:200},{x:476,y:200},{x:476,y:350},{x:500,y:350}];
 assert.deepEqual(branchLabelPosition(a,[b]),{x:476,y:125});
 assert.deepEqual(branchLabelPosition(b,[a]),{x:476,y:275});
});
