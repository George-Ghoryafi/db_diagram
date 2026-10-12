import dagre from "@dagrejs/dagre";
export type Arrangement = "left-right" | "pipeline" | "snowflake" | "compact";
type Item = { id: string; width: number; height: number };
type Ref = { fromTable: string; toTable: string };
export function arrangeTables(
  items: Item[],
  refs: Ref[],
  groups: { tables: string[] }[],
  mode: Arrangement,
) {
  const positions: Record<string, { x: number; y: number }> = {};
  if (!items.length) return positions;
  if (mode === "left-right") {
    const graph = new dagre.graphlib.Graph()
      .setGraph({
        rankdir: "LR",
        nodesep: 70,
        ranksep: 110,
        marginx: 70,
        marginy: 100,
      })
      .setDefaultEdgeLabel(() => ({}));
    items.forEach((n) =>
      graph.setNode(n.id, { width: n.width, height: n.height }),
    );
    refs
      .filter(
        (r) =>
          items.some((i) => i.id === r.fromTable) &&
          items.some((i) => i.id === r.toTable),
      )
      .forEach((r) => graph.setEdge(r.fromTable, r.toTable));
    dagre.layout(graph);
    items.forEach((n) => {
      const p = graph.node(n.id);
      positions[n.id] = { x: p.x - n.width / 2, y: p.y - n.height / 2 };
    });
  } else if (mode === "pipeline") {
    const remaining = items.filter(
      (i) => !groups.some((g) => g.tables.includes(i.id)),
    );
    [
      ...groups.map((g) => items.filter((i) => g.tables.includes(i.id))),
      remaining,
    ]
      .filter((g) => g.length)
      .forEach((stage, column) => {
        let y = 100;
        stage.forEach((n) => {
          positions[n.id] = { x: 70 + column * 350, y };
          y += n.height + 65;
        });
      });
  } else if (mode === "snowflake") {
    const degree = (n: Item) =>
      refs.filter((r) => r.fromTable === n.id || r.toTable === n.id).length;
    const sorted = [...items].sort(
      (a, b) => degree(b) - degree(a) || a.id.localeCompare(b.id),
    );
    const maxSize =
      Math.max(...items.map((i) => Math.max(i.width, i.height))) + 80;
    const radius = Math.max(maxSize, (sorted.length * maxSize) / (2 * Math.PI));
    const center = radius + maxSize;
    positions[sorted[0].id] = { x: center, y: center };
    sorted.slice(1).forEach((n, i) => {
      const angle = (2 * Math.PI * i) / (sorted.length - 1);
      positions[n.id] = {
        x: center + radius * Math.cos(angle),
        y: center + radius * Math.sin(angle),
      };
    });
  } else {
    const columns = Math.ceil(Math.sqrt(items.length));
    let y = 100;
    for (let i = 0; i < items.length; i += columns) {
      const row = items.slice(i, i + columns);
      row.forEach((n, j) => (positions[n.id] = { x: 70 + j * 350, y }));
      y += Math.max(...row.map((n) => n.height)) + 70;
    }
  }
  return positions;
}
