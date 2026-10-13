import { useEffect, useRef, useState } from 'react';
import RouteWorker from './edge-routing.worker?worker';
import { createRoutePlanner, type RouteRequest, type RouteResult } from './route-planner';
export function useRelationshipRoutes(request: RouteRequest, dragging: boolean) {
  const [result, setResult] = useState<RouteResult>({ key: '', routes: {} });
  const current = useRef({ key: request.key, dragging });
  current.current = { key: request.key, dragging };
  const planner = useRef<ReturnType<typeof createRoutePlanner> | null>(null);
  useEffect(() => {
    const unavailable = () => setResult({ key: '', routes: {}, error: 'Relationship routing is unavailable. Reload to retry.' });
    let worker: Worker;
    try { worker = new RouteWorker(); }
    catch { unavailable(); return; }
    const queue = createRoutePlanner(request => worker.postMessage(request), result => {
      if (result.key === current.current.key && !current.current.dragging) setResult(result);
    });
    planner.current = queue;
    worker.onmessage = ({ data }: MessageEvent<RouteResult>) => queue.receive(data);
    worker.onerror = () => { planner.current = null; worker.terminate(); unavailable(); };
    return () => { planner.current = null; worker.terminate(); };
  }, []);
  useEffect(() => { planner.current?.update(request, dragging); }, [request.key, dragging]);
  return result;
}
