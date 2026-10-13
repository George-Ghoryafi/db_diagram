import { routeRelationships } from './edge-routing';
import type { RouteRequest, RouteResult } from './route-planner';
self.onmessage = ({ data }: MessageEvent<RouteRequest>) => {
  let result: RouteResult;
  try { result = { key: data.key, routes: routeRelationships(data.relationships, data.tables), tables: data.tables, sides: Object.fromEntries(data.relationships.map(ref => [ref.id, `${ref.sourceSide || "right"}:${ref.targetSide || "left"}`])) }; }
  catch (error) { result = { key: data.key, routes: {}, error: String(error) }; }
  self.postMessage(result);
};
