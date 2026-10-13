export type Point = { x: number; y: number };
export type TableBounds = Point & { width: number; height: number };
export function storageLabelPosition(points: Point[], tables: TableBounds[], width: number) {
  const candidates = points.slice(1).map((point, index) => ({
    x: (point.x + points[index].x) / 2, y: (point.y + points[index].y) / 2,
    length: Math.abs(point.x - points[index].x) + Math.abs(point.y - points[index].y),
  })).sort((a, b) => b.length - a.length);
  return candidates.find(point => !tables.some(table => point.x + width / 2 > table.x && point.x - width / 2 < table.x + table.width && point.y + 10 > table.y && point.y - 10 < table.y + table.height)) || routeGeometry(points).label;
}
type Segment = { a: Point; b: Point; terminal?: boolean; endpoints?: Point[]; bundles?: string[] };
export type RelationshipRoute = { id: string; source: Point; target: Point; sourceSide?: "left" | "right"; targetSide?: "left" | "right"; sourceBundle?: string; targetBundle?: string };
const laneGap = 12;

// Reserve cable lanes across the whole diagram, not independently per edge.
export function routeRelationships(relationships: RelationshipRoute[], tables: TableBounds[]) {
  const routes: Record<string, Point[] | null> = {}, occupied: Segment[] = [];
  const counts = new Map<string, number>();
  relationships.forEach(ref => [ref.sourceBundle, ref.targetBundle].forEach(key => { if (key) counts.set(key, (counts.get(key) || 0) + 1); }));
  const bundled = (key?: string) => !!key && (counts.get(key) || 0) > 1;
  const ordered = [...relationships].sort((a,b) => {
    const shared = (ref: RelationshipRoute) => bundled(ref.sourceBundle) || bundled(ref.targetBundle);
    return Number(shared(b)) - Number(shared(a)) || (shared(a) && shared(b) ? Math.abs(a.source.x-a.target.x)+Math.abs(a.source.y-a.target.y)-Math.abs(b.source.x-b.target.x)-Math.abs(b.source.y-b.target.y) : 0);
  });
  for (const ref of ordered) {
    const reverse = !bundled(ref.sourceBundle) && bundled(ref.targetBundle);
    const source = reverse ? ref.target : ref.source, target = reverse ? ref.source : ref.target;
    const sourceSide = reverse ? ref.targetSide || 'left' : ref.sourceSide || 'right';
    const targetSide = reverse ? ref.sourceSide || 'right' : ref.targetSide || 'left';
    const keys = [ref.sourceBundle, ref.targetBundle].filter((key): key is string => !!key);
    const bundles = keys.filter(bundled);
    let route: Point[] | null = null;
    for (const [spacing, stem, clearance] of [[12,24,12],[8,24,6],[4,16,2],[2,16,0],[2,48,0],[1,24,0],[1,4,0],[.25,1,0]]) {
      route = routeWithClearance(source, target, tables, clearance, occupied, stem, spacing, sourceSide, targetSide, bundles, keys);
      if (route) break;
    }
    if (route && reverse) route.reverse();
    routes[ref.id] = route;
    if (!route) continue;
    route.slice(1).forEach((point, index) => occupied.push({ a: route![index], b: point, terminal: index === 0 || index === route!.length - 2, bundles: keys, endpoints: [...(index === 0 ? [ref.source] : []), ...(index === route!.length - 2 ? [ref.target] : [])] }));
  }
  return routes;
}

export function crossesTable(a: Point, b: Point, table: TableBounds) {
  const right = table.x + table.width, bottom = table.y + table.height;
  return a.y === b.y
    ? a.y > table.y && a.y < bottom && Math.max(a.x, b.x) > table.x && Math.min(a.x, b.x) < right
    : a.x > table.x && a.x < right && Math.max(a.y, b.y) > table.y && Math.min(a.y, b.y) < bottom;
}

// Route between outward-facing handles on a visibility grid around table bounds.
export function routeRelationship(source: Point, target: Point, tables: TableBounds[]): Point[] | null {
  for (const clearance of [12, 6, 2, 0]) {
    const route = routeWithClearance(source, target, tables, clearance);
    if (route) return route;
  }
  // Overlapping tables can leave an attribute with no unobstructed exit.
  return null;
}

function routeWithClearance(source: Point, target: Point, tables: TableBounds[], clearance: number, occupied: Segment[] = [], stem = 24, spacing = laneGap, sourceSide: "left" | "right" = "right", targetSide: "left" | "right" = "left", bundles: string[] = [], endpointKeys: string[] = []): Point[] | null {
  const obstacles = tables.map(t => ({ x: t.x - clearance, y: t.y - clearance, width: t.width + clearance * 2, height: t.height + clearance * 2 }));
  const gap = (point: Point, side: "left" | "right") => Math.min(stem * 2, ...obstacles.filter(table => point.y > table.y && point.y < table.y + table.height && (side === "right" ? table.x > point.x : table.x + table.width < point.x)).map(table => side === "right" ? table.x - point.x : point.x - table.x - table.width));
  const start = { x: source.x + (sourceSide === "right" ? 1 : -1) * gap(source, sourceSide) / 2, y: source.y };
  const end = { x: target.x + (targetSide === "right" ? 1 : -1) * gap(target, targetSide) / 2, y: target.y };
  const shared = occupied.filter(segment => segment.bundles?.some(key => bundles.includes(key)));
  const xs = [...new Set([start.x, end.x, ...shared.flatMap(segment => [segment.a.x, segment.b.x]), ...obstacles.flatMap(t => [t.x, t.x + t.width]), ...occupied.filter(s => s.a.x === s.b.x).flatMap(s => [s.a.x - spacing, s.a.x + spacing])])].sort((a, b) => a - b);
  const ys = [...new Set([start.y, end.y, ...shared.flatMap(segment => [segment.a.y, segment.b.y]), ...obstacles.flatMap(t => [t.y, t.y + t.height]), ...occupied.filter(s => s.a.y === s.b.y).flatMap(s => [s.a.y - spacing, s.a.y + spacing])])].sort((a, b) => a - b);
  const point = (index: number): Point => ({ x: xs[index % xs.length], y: ys[Math.floor(index / xs.length)] });
  const inside = (p: Point) => obstacles.some(t => p.x > t.x && p.x < t.x + t.width && p.y > t.y && p.y < t.y + t.height);
  if (inside(start) || inside(end)) return null;
  const startIndex = ys.indexOf(start.y) * xs.length + xs.indexOf(start.x);
  const endIndex = ys.indexOf(end.y) * xs.length + xs.indexOf(end.x);
  type Step = { index: number; direction: number; cost: number; estimate: number; key: string };
  const initialDirection = bundles.length ? 1 : 0;
  const initial = `${startIndex}:${initialDirection}`;
  const queue: Step[] = [{ index: startIndex, direction: initialDirection, cost: 0, estimate: 0, key: initial }];
  const push = (step: Step) => {
    queue.push(step);
    let i = queue.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (queue[parent].estimate <= step.estimate) break;
      queue[i] = queue[parent]; i = parent;
    }
    queue[i] = step;
  };
  const pop = () => {
    const first = queue[0], last = queue.pop()!;
    if (queue.length) {
      let i = 0;
      while (i * 2 + 1 < queue.length) {
        let child = i * 2 + 1;
        if (child + 1 < queue.length && queue[child + 1].estimate < queue[child].estimate) child++;
        if (last.estimate <= queue[child].estimate) break;
        queue[i] = queue[child]; i = child;
      }
      queue[i] = last;
    }
    return first;
  };
  const sharedEndpoint = (segment: Segment) => segment.bundles?.some(key => bundles.includes(key)) || (!endpointKeys.length && !segment.bundles?.length && segment.endpoints?.some(point => (point.x === source.x && point.y === source.y) || (point.x === target.x && point.y === target.y)));
  const parallelBlocked = (a: Point, b: Point) => occupied.some(s => !sharedEndpoint(s) && (a.y === b.y && s.a.y === s.b.y
    ? Math.abs(a.y - s.a.y) < (s.terminal ? 0.01 : spacing - 0.01) && Math.max(Math.min(a.x,b.x),Math.min(s.a.x,s.b.x)) < Math.min(Math.max(a.x,b.x),Math.max(s.a.x,s.b.x))
    : a.x === b.x && s.a.x === s.b.x && Math.abs(a.x - s.a.x) < (s.terminal ? 0.01 : spacing - 0.01) && Math.max(Math.min(a.y,b.y),Math.min(s.a.y,s.b.y)) < Math.min(Math.max(a.y,b.y),Math.max(s.a.y,s.b.y))));
  const overlapsTerminal = (a: Point, b: Point) => occupied.some(s => !sharedEndpoint(s) && a.y === b.y && s.a.y === s.b.y && Math.abs(a.y - s.a.y) < .01 && Math.max(Math.min(a.x,b.x),Math.min(s.a.x,s.b.x)) < Math.min(Math.max(a.x,b.x),Math.max(s.a.x,s.b.x)));
  if (overlapsTerminal(source, start) || overlapsTerminal(end, target)) return null;
  const costs = new Map([[initial, 0]]), previous = new Map<string, string>();
  const blockedSegments = new Map<string, boolean>();
  while (queue.length) {
    const current = pop();
    if (current.cost !== costs.get(current.key)) continue;
    if (current.index === endIndex) {
      const result: Point[] = [];
      let key: string | undefined = current.key;
      while (key) { result.push(point(Number(key.split(':')[0]))); key = previous.get(key); }
      result.reverse();
      const full = [source, ...result, target];
      return full.filter((p, i) => !i || i === full.length - 1 || !((full[i - 1].x === p.x && p.x === full[i + 1].x) || (full[i - 1].y === p.y && p.y === full[i + 1].y)));
    }
    const a = point(current.index), column = current.index % xs.length, row = Math.floor(current.index / xs.length);
    const neighbors = [column > 0 ? current.index - 1 : -1, column < xs.length - 1 ? current.index + 1 : -1, row > 0 ? current.index - xs.length : -1, row < ys.length - 1 ? current.index + xs.length : -1];
    for (const index of neighbors) {
      if (index < 0) continue;
      const b = point(index), direction = a.y === b.y ? 1 : 2;
      const segmentKey = `${Math.min(current.index, index)}:${Math.max(current.index, index)}`;
      let blocked = blockedSegments.get(segmentKey);
      if (blocked === undefined) {
        blocked = inside(a) || inside(b) || obstacles.some(t => crossesTable(a, b, t)) || parallelBlocked(a, b);
        blockedSegments.set(segmentKey, blocked);
      }
      if (blocked) continue;
      const reused = Math.max(0, ...shared.map(segment => a.y === b.y && segment.a.y === segment.b.y && a.y === segment.a.y
        ? Math.max(0, Math.min(Math.max(a.x,b.x),Math.max(segment.a.x,segment.b.x)) - Math.max(Math.min(a.x,b.x),Math.min(segment.a.x,segment.b.x)))
        : a.x === b.x && segment.a.x === segment.b.x && a.x === segment.a.x
          ? Math.max(0, Math.min(Math.max(a.y,b.y),Math.max(segment.a.y,segment.b.y)) - Math.max(Math.min(a.y,b.y),Math.min(segment.a.y,segment.b.y))) : 0));
      const cost = current.cost + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) - reused * .35 + (current.direction && current.direction !== direction ? 24 : 0);
      const key = `${index}:${direction}`;
      if (cost >= (costs.get(key) ?? Infinity)) continue;
      costs.set(key, cost); previous.set(key, current.key);
      push({ index, direction, cost, key, estimate: cost + (bundles.length ? .65 : 1) * (Math.abs(b.x - end.x) + Math.abs(b.y - end.y)) });
    }
  }
  return null;
}

export function routeGeometry(points: Point[], tables: TableBounds[] = []) {
  const lengths = points.slice(1).map((p, i) => Math.abs(p.x - points[i].x) + Math.abs(p.y - points[i].y));
  let remaining = lengths.reduce((a, b) => a + b, 0) / 2;
  let label = points[0];
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const fraction = lengths[i] ? remaining / lengths[i] : 0;
      label = { x: points[i].x + (points[i + 1].x - points[i].x) * fraction, y: points[i].y + (points[i + 1].y - points[i].y) * fraction };
      break;
    }
    remaining -= lengths[i];
  }
  const path = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1], corner = points[i], next = points[i + 1];
    const incoming = lengths[i - 1], outgoing = lengths[i] || 0;
    const turning = next && previous.x !== next.x && previous.y !== next.y;
    // A rounded bend must stay outside the real table, including narrow-gap routes.
    const clearance = Math.min(Infinity, ...tables.map(table => Math.hypot(
      Math.max(table.x - corner.x, 0, corner.x - table.x - table.width),
      Math.max(table.y - corner.y, 0, corner.y - table.y - table.height),
    )));
    const radius = turning ? Math.min(10, incoming / 2, outgoing / 2, clearance) : 0;
    if (!radius) { path.push(`L ${corner.x} ${corner.y}`); continue; }
    const before = { x: corner.x + (previous.x - corner.x) * radius / incoming, y: corner.y + (previous.y - corner.y) * radius / incoming };
    const after = { x: corner.x + (next.x - corner.x) * radius / outgoing, y: corner.y + (next.y - corner.y) * radius / outgoing };
    path.push(`L ${before.x} ${before.y} Q ${corner.x} ${corner.y} ${after.x} ${after.y}`);
  }
  return { path: path.join(' '), label };
}

export function projectToRoute(points: Point[], point: Point) {
  let nearest = points[0], distance = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], dx = b.x - a.x, dy = b.y - a.y;
    const fraction = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    const projection = { x: a.x + dx * fraction, y: a.y + dy * fraction };
    const candidate = Math.hypot(point.x - projection.x, point.y - projection.y);
    if (candidate < distance) { nearest = projection; distance = candidate; }
  }
  return nearest;
}

// Put names on individual branches instead of stacking them on a shared cable trunk.
export function branchLabelPosition(points: Point[], others: Point[][]) {
  const candidates: { point: Point; length: number }[] = [];
  points.slice(1).forEach((b,index)=>{
    const a=points[index], horizontal=a.y===b.y, fixed=horizontal?a.y:a.x;
    let intervals=[[Math.min(horizontal?a.x:a.y,horizontal?b.x:b.y),Math.max(horizontal?a.x:a.y,horizontal?b.x:b.y)]];
    for(const route of others) for(let i=1;i<route.length;i++){
      const c=route[i-1],d=route[i];
      if((horizontal ? c.y!==d.y || c.y!==fixed : c.x!==d.x || c.x!==fixed))continue;
      const low=Math.min(horizontal?c.x:c.y,horizontal?d.x:d.y),high=Math.max(horizontal?c.x:c.y,horizontal?d.x:d.y);
      intervals=intervals.flatMap(([start,end])=>high<=start||low>=end?[[start,end]]:[[start,Math.max(start,low)],[Math.min(end,high),end]].filter(([start,end])=>end>start));
    }
    intervals.forEach(([start,end])=>{if(end>start)candidates.push({length:end-start,point:horizontal?{x:(start+end)/2,y:fixed}:{x:fixed,y:(start+end)/2}});});
  });
  return candidates.sort((a,b)=>b.length-a.length)[0]?.point || routeGeometry(points).label;
}
