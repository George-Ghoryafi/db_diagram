import type { IncomingMessage, ServerResponse } from "node:http";
import { createHostedApp } from "../server/hosted.js";
import { NeonSchemaStore } from "../server/neon-storage.js";

const app = createHostedApp(() => new NeonSchemaStore());
export default function handler(
  req: IncomingMessage & { query?: Record<string, string | string[]> },
  res: ServerResponse,
) {
  const route = req.query?.route;
  if (route)
    req.url = "/api/" + (Array.isArray(route) ? route.join("/") : route);
  app(req, res);
}
