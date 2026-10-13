import type { Point, RelationshipRoute, TableBounds } from './edge-routing';
export type RouteRequest = { key: string; relationships: RelationshipRoute[]; tables: TableBounds[] };
export type RouteResult = { key: string; routes: Record<string, Point[] | null>; error?: string };

// Keep one search in flight and one latest request; never queue pointer movements.
export function createRoutePlanner(send: (request: RouteRequest) => void, accept: (result: RouteResult) => void) {
  let latest: RouteRequest | null = null, inFlight = false, paused = false;
  const dispatch = () => { if (!paused && !inFlight && latest) { inFlight = true; send(latest); } };
  return {
    update(request: RouteRequest, pause: boolean) { latest = request; paused = pause; dispatch(); },
    receive(result: RouteResult) {
      inFlight = false;
      if (latest?.key === result.key && !paused) accept(result);
      else dispatch();
    },
  };
}
