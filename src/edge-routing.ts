export type Point = { x: number; y: number };
export type TableBounds = Point & { width: number; height: number };

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

function routeWithClearance(source: Point, target: Point, tables: TableBounds[], clearance: number): Point[] | null {
  const obstacles = tables.map(t => ({ x: t.x - clearance, y: t.y - clearance, width: t.width + clearance * 2, height: t.height + clearance * 2 }));
  const sourceGap = Math.min(48, ...obstacles.filter(t => t.x > source.x && source.y > t.y && source.y < t.y + t.height).map(t => t.x - source.x));
  const targetGap = Math.min(48, ...obstacles.filter(t => t.x + t.width < target.x && target.y > t.y && target.y < t.y + t.height).map(t => target.x - t.x - t.width));
  const start = { x: source.x + sourceGap / 2, y: source.y }, end = { x: target.x - targetGap / 2, y: target.y };
  const xs = [...new Set([start.x, end.x, ...obstacles.flatMap(t => [t.x, t.x + t.width])])].sort((a, b) => a - b);
  const ys = [...new Set([start.y, end.y, ...obstacles.flatMap(t => [t.y, t.y + t.height])])].sort((a, b) => a - b);
  const point = (index: number): Point => ({ x: xs[index % xs.length], y: ys[Math.floor(index / xs.length)] });
  const inside = (p: Point) => obstacles.some(t => p.x > t.x && p.x < t.x + t.width && p.y > t.y && p.y < t.y + t.height);
  if (inside(start) || inside(end)) return null;
  const startIndex = ys.indexOf(start.y) * xs.length + xs.indexOf(start.x);
  const endIndex = ys.indexOf(end.y) * xs.length + xs.indexOf(end.x);
  type Step = { index: number; direction: number; cost: number; estimate: number; key: string };
  const initial = `${startIndex}:0`;
  const queue: Step[] = [{ index: startIndex, direction: 0, cost: 0, estimate: 0, key: initial }];
  const costs = new Map([[initial, 0]]), previous = new Map<string, string>();
  while (queue.length) {
    queue.sort((a, b) => b.estimate - a.estimate);
    const current = queue.pop()!;
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
      if (inside(b) || obstacles.some(t => crossesTable(a, b, t))) continue;
      const cost = current.cost + Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + (current.direction && current.direction !== direction ? 24 : 0);
      const key = `${index}:${direction}`;
      if (cost >= (costs.get(key) ?? Infinity)) continue;
      costs.set(key, cost); previous.set(key, current.key);
      queue.push({ index, direction, cost, key, estimate: cost + Math.abs(b.x - end.x) + Math.abs(b.y - end.y) });
    }
  }
  return null;
}

export function routeGeometry(points: Point[]) {
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
  return { path: points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' '), label };
}
