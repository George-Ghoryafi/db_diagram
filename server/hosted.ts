import express, { type ErrorRequestHandler } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createSchemaMcp, type McpSchemaStore } from "./mcp-server.js";
import {
  SchemaError,
  errorMessage,
  parseSchema,
  exportSchema,
} from "./schema.js";
import type { Layout } from "./storage.js";

type HostedStore = McpSchemaStore & {
  saveLayout(id: string, layout: Layout): Promise<unknown>;
};
export function createHostedApp(
  store: () => HostedStore,
  key = process.env.DIAGRAM_ACCESS_KEY,
) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/api/status", (_req, res) =>
    res.json({
      storage: "cloud",
      configured:
        !!(process.env.DATABASE_URL || process.env.db_diagram_DATABASE_URL) &&
        !!key &&
        key.length >= 32,
      version: "1.1.0",
    }),
  );
  app.use("/api", (req, res, next) => {
    if (!key || key.length < 32) {
      res
        .status(503)
        .json({ error: "Shared workspace access key is not configured." });
      return;
    }
    if (
      req.headers.origin &&
      req.headers.origin !== `https://${req.headers.host}`
    ) {
      res.status(403).json({ error: "Origin not allowed." });
      return;
    }
    const supplied =
      req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1] || "";
    const digest = (value: string) =>
      createHash("sha256").update(value).digest();
    if (!timingSafeEqual(digest(supplied), digest(key))) {
      res
        .status(401)
        .json({ error: "Connect your workspace using Agent access." });
      return;
    }
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  app.all("/api/mcp", async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Use MCP Streamable HTTP POST requests." });
      return;
    }
    const server = createSchemaMcp(store());
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } finally {
      await transport.close();
      await server.close();
    }
  });
  app.get("/api/schemas", async (_req, res) => res.json(await store().list()));
  app.post("/api/schemas", async (req, res) => {
    if (typeof req.body?.name !== "string" || !req.body.name.trim())
      throw new SchemaError("Name is required.");
    const id = req.body.name.trim().toLowerCase().replace(/\s+/g, "-");
    res.status(201).json(await store().write(id, req.body.dbml));
  });
  app.get("/api/schemas/:id", async (req, res) =>
    res.json(await store().read(req.params.id)),
  );
  app.put("/api/schemas/:id", async (req, res) => {
    if (typeof req.body?.revision !== "string")
      throw new SchemaError("The current revision is required.", 409);
    res.json(
      await store().write(req.params.id, req.body.dbml, req.body.revision),
    );
  });
  app.put("/api/schemas/:id/layout", async (req, res) =>
    res.json(await store().saveLayout(req.params.id, req.body?.layout)),
  );
  app.post("/api/parse", (req, res) => res.json(parseSchema(req.body?.dbml)));
  app.post("/api/export", (req, res) =>
    res.json({ sql: exportSchema(req.body?.dbml, req.body?.format) }),
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    const status =
      error instanceof SchemaError
        ? error.status
        : error.status === 413
          ? 413
          : error instanceof SyntaxError
            ? 400
            : 500;
    // Database errors can contain connection details, so keep them out of responses.
    res.status(status).json({
      error:
        status === 500
          ? "Shared storage is unavailable. Retry shortly."
          : errorMessage(error),
    });
  };
  app.use(handleError);
  return app;
}
