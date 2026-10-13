import { isMany } from './cardinality';
import type { ElkNode, LayoutOptions } from "elkjs/lib/elk-api";
export type Arrangement = "left-right" | "pipeline" | "snowflake" | "compact" | "groups";
type Item = { id: string; width: number; height: number; fields?: { name: string; y: number }[] };
type Ref = { fromTable: string; toTable: string; fromFields?: string[]; toFields?: string[]; relation?: string };
type Point = { x: number; y: number };

// ELK mode settings observed in dbdiagram's shipped renderer.
const options: Record<Exclude<Arrangement, "compact" | "groups">, LayoutOptions> = {
  "left-right": {
    "elk.algorithm": "layered",
    "elk.layered.spacing.baseValue": "40",
    "elk.spacing.componentComponent": "80",
    "elk.layered.spacing.edgeNodeBetweenLayers": "120",
    "elk.layered.considerModelOrder.strategy": "PREFER_EDGES",
    "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
    "elk.layered.mergeEdges": "true",
    "elk.layered.nodePlacement.strategy": "INTERACTIVE",
    "elk.layered.layering.strategy": "INTERACTIVE",
  },
  pipeline: {
    "elk.algorithm": "layered",
    "elk.direction": "RIGHT",
    "elk.hierarchyHandling": "INCLUDE_CHILDREN",
    "elk.layered.layering.strategy": "NETWORK_SIMPLEX",
    "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
    "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
    "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    "elk.layered.mergeEdges": "true",
    "elk.layered.spacing.baseValue": "48",
    "elk.layered.spacing.nodeNodeBetweenLayers": "96",
    "elk.layered.spacing.edgeNodeBetweenLayers": "88",
    "elk.spacing.componentComponent": "72",
  },
  snowflake: {
    "elk.algorithm": "force",
    "elk.spacing.nodeNode": "5",
    "elk.force.temperature": "0.001",
    "elk.force.iterations": "300",
  },
};

export async function arrangeTables(items: Item[], refs: Ref[], groups: { tables: string[] }[], mode: Arrangement) {
  const positions: Record<string, Point> = {};
  if (!items.length) return positions;
  const byId = new Map(items.map(item => [item.id, item]));
  if (mode === "groups") {
    const claimed = new Set<string>();
    const blocks: Item[] = [];
    const membersByBlock = new Map<string, { item: Item; offset: Point }[]>();
    for (const [index, group] of groups.entries()) {
      const ids = new Set(group.tables);
      const members = items.filter(item => ids.has(item.id) && !claimed.has(item.id));
      if (!members.length) continue;
      const packed = compactPositions(members, Math.ceil(Math.sqrt(members.length)));
      const offsets = members.map(item => {
        claimed.add(item.id);
        return { item, offset: { x: packed[item.id].x - 70 + 22, y: packed[item.id].y - 100 + 38 } };
      });
      const id = "group:" + index;
      membersByBlock.set(id, offsets);
      blocks.push({ id,
        width: Math.max(...offsets.map(({ item, offset }) => offset.x + item.width)) + 22,
        height: Math.max(...offsets.map(({ item, offset }) => offset.y + item.height)) + 22,
      });
    }
    if (!blocks.length) return arrangeTables(items, refs, groups, "compact");
    for (const item of items) {
      if (claimed.has(item.id)) continue;
      const id = "table:" + item.id;
      blocks.push({ ...item, id });
      membersByBlock.set(id, [{ item, offset: { x: 0, y: 0 } }]);
    }
    const packed = compactPositions(blocks, Math.ceil(Math.sqrt(blocks.length)));
    for (const [id, members] of membersByBlock) {
      for (const { item, offset } of members) positions[item.id] = { x: packed[id].x + offset.x, y: packed[id].y + offset.y };
    }
    return positions;
  }
  if (mode === "compact") return compactPositions(items, Math.max(4, Math.floor(Math.sqrt(items.length))));
  const portId = (table: string, field: string) => "port:" + JSON.stringify([table, field]);
  const nodes = new Map(items.map(item => [item.id, {
    id: "table:" + item.id,
    width: item.width + 6,
    height: item.height + 6,
    ports: item.fields?.map(field => ({ id: portId(item.id, field.name), x: item.width + 3, y: field.y + 3,
      layoutOptions: mode === "snowflake" ? { "elk.port.side": "EAST" } : undefined })),
    layoutOptions: { "elk.aspectRatio": "1.6", "elk.alignment": "LEFT" },
  } as ElkNode]));
  const endpoint = (table: string, field?: string) => field && byId.get(table)?.fields?.some(f => f.name === field)
    ? portId(table, field) : "table:" + table;
  const edges = refs.filter(ref => byId.has(ref.fromTable) && byId.has(ref.toTable)).map((ref, index) => {
    const from = endpoint(ref.fromTable, ref.fromFields?.[0]);
    const to = endpoint(ref.toTable, ref.toFields?.[0]);
    const reverse = !ref.relation || (isMany(ref.relation.split(":")[0]) && !isMany(ref.relation.split(":")[1]));
    return { id: "ref:" + index, sources: [reverse ? to : from], targets: [reverse ? from : to] };
  });
  let children = [...nodes.values()];
  const stages = new Map<string, { item: Item; offset: Point }[]>();
  let layoutEdges = edges;
  if (mode === "pipeline" && groups.some(group => group.tables.some(id => byId.has(id)))) {
    const owner = new Map<string, string>();
    children = [];
    groups.forEach((group, index) => {
      const members = group.tables.flatMap(id => {
        if (owner.has(id) || !byId.has(id)) return [];
        owner.set(id, "group:" + index);
        return [byId.get(id)!];
      });
      if (!members.length) return;
      let y = 38;
      const offsets = members.map(item => {
        const offset = { x: 30, y };
        y += item.height + 6 + 28;
        return { item, offset };
      });
      const id = "group:" + index;
      stages.set(id, offsets);
      children.push({ id, width: Math.max(...members.map(item => item.width + 6)) + 60, height: y + 2,
        ports: offsets.flatMap(({ item, offset }) => nodes.get(item.id)!.ports?.map(port => ({ ...port, x: offset.x + (port.x || 0), y: offset.y + (port.y || 0) })) || []),
      });
    });
    children.push(...items.filter(item => !owner.has(item.id)).map(item => nodes.get(item.id)!));
    layoutEdges = refs.flatMap((ref, index) => {
      if (!byId.has(ref.fromTable) || !byId.has(ref.toTable)) return [];
      const fromOwner = owner.get(ref.fromTable) || "table:" + ref.fromTable;
      const toOwner = owner.get(ref.toTable) || "table:" + ref.toTable;
      if (fromOwner === toOwner) return [];
      // Use field ports when present; otherwise attach to the owning stage.
      const from = ref.fromFields?.[0] && byId.get(ref.fromTable)?.fields?.some(f => f.name === ref.fromFields![0]) ? endpoint(ref.fromTable, ref.fromFields[0]) : fromOwner;
      const to = ref.toFields?.[0] && byId.get(ref.toTable)?.fields?.some(f => f.name === ref.toFields![0]) ? endpoint(ref.toTable, ref.toFields[0]) : toOwner;
      const reverse = !ref.relation || (isMany(ref.relation.split(":")[0]) && !isMany(ref.relation.split(":")[1]));
      return [{ id: "ref:" + index, sources: [reverse ? to : from], targets: [reverse ? from : to] }];
    });
  }
  const elk = typeof window === "undefined"
    ? new (await import("elkjs/lib/elk.bundled.js")).default()
    : (await import("./layout-engine")).layoutEngine;
  const result = await elk.layout({ id: "root", children, edges: layoutEdges, layoutOptions: options[mode] });
  function collect(node: ElkNode, origin: Point) {
    const point = { x: origin.x + (node.x || 0), y: origin.y + (node.y || 0) };
    stages.get(node.id)?.forEach(({ item, offset }) => {
      positions[item.id] = { x: point.x + offset.x, y: point.y + offset.y };
    });
    if (node.id.startsWith("table:")) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error("Layout returned an invalid table position.");
      positions[node.id.slice(6)] = point;
    }
    node.children?.forEach(child => collect(child, point));
  }
  result.children?.forEach(node => collect(node, { x: 70, y: 100 }));
  if (Object.keys(positions).length !== items.length) throw new Error("Layout did not include every table.");
  return positions;
}

function compactPositions(items: Item[], count: number) {
  const positions: Record<string, Point> = {};
  let x = 70;
  const columns = Array.from({ length: Math.min(items.length, count) }, () => [] as Item[]);
  items.forEach((item, index) => columns[index % columns.length].push(item));
  for (const column of columns) {
    let y = 100;
    for (const item of column) { positions[item.id] = { x, y }; y += item.height + 50; }
    x += Math.max(...column.map(item => item.width)) + 50;
  }
  return positions;
}
