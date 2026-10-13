import { routeRelationships, branchLabelPosition } from './edge-routing';
import type { RouteRequest, RouteResult } from './route-planner';
self.onmessage = ({ data }: MessageEvent<RouteRequest>) => {
  let result: RouteResult;
  try { const routes = routeRelationships(data.relationships, data.tables); const labels = Object.fromEntries(Object.entries(routes).flatMap(([id,points])=>points?[[id,branchLabelPosition(points,Object.entries(routes).flatMap(([other,route])=>other!==id&&route?[route]:[]))]]:[])); result = { labels, key: data.key, routes, tables: data.tables, sides: Object.fromEntries(data.relationships.map(ref => [ref.id, `${ref.sourceSide || "right"}:${ref.targetSide || "left"}`])) }; }
  catch (error) { result = { key: data.key, routes: {}, error: String(error) }; }
  self.postMessage(result);
};
