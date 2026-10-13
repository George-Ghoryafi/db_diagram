import express, { type ErrorRequestHandler } from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { MetadataError } from "../src/bundles.js";
import { SchemaStore } from "./storage.js";
import {
  errorMessage,
  exportSchema,
  parseSchema,
  SchemaError,
} from "./schema.js";

export function createApp(store = new SchemaStore()) {
  const app = express();
  app.use((req, res, next) => {
    // Only the local editor may make browser requests; reject DNS-rebinding hosts.
    if (!/^(127\.0\.0\.1|localhost):4318$/.test(req.headers.host || "")) {
      res.status(403).json({ error: "Only local access is supported." });
      return;
    }
    if (
      req.headers.origin &&
      ![
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:4318",
        "http://localhost:4318",
      ].includes(req.headers.origin)
    ) {
      res.status(403).json({ error: "Origin not allowed." });
      return;
    }
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  app.get("/api/bundles", (_req, res) => res.json(store.listBundles()));
  app.post("/api/bundles", async (req, res) =>
    res
      .status(201)
      .json(await store.createBundle(req.body?.name, req.body?.color)),
  );
  app.put("/api/schemas/:id/bundle", async (req, res) =>
    res.json(await store.moveSchema(req.params.id, req.body?.bundle_id)),
  );
  app.get("/api/schemas", (_req, res) => {
    res.json(store.list());
  });
  app.post("/api/schemas", async (req, res) => {
    if (typeof req.body?.name !== "string" || !req.body.name.trim())
      throw new SchemaError("Name is required.");
    const stem =
      req.body.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .slice(0, 40) || "diagram";
    const id = stem + "-" + randomUUID().slice(0, 8);
    res
      .status(201)
      .json(
        await store.write(id, req.body.dbml, undefined, {
          name: req.body.name.trim(),
          bundle_id: req.body.bundle_id,
        }),
      );
  });
  app.get("/api/schemas/:id", (req, res) => {
    res.json(store.read(req.params.id));
  });
  app.put("/api/schemas/:id", async (req, res) => {
    if (typeof req.body?.revision !== "string")
      throw new SchemaError("The current revision is required.", 409);
    res.json(
      await store.write(req.params.id, req.body.dbml, req.body.revision),
    );
  });
  app.put("/api/schemas/:id/layout", async (req, res) => {
    res.json(await store.saveLayout(req.params.id, req.body?.layout));
  });
  app.post("/api/parse", (req, res) => {
    res.json(parseSchema(req.body?.dbml));
  });
  app.post("/api/export", (req, res) => {
    res.json({ sql: exportSchema(req.body?.dbml, req.body?.format) });
  });
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Endpoint not found." });
  });
  const dist = resolve("dist");
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/.*/, (_req, res) => {
      res.sendFile(resolve(dist, "index.html"));
    });
  }
  const handleError: ErrorRequestHandler = (error, _req, res, _next) => {
    const status =
      error instanceof MetadataError
        ? 400
        : error instanceof SchemaError
          ? error.status
          : error.status === 413
            ? 413
            : error instanceof SyntaxError
              ? 400
              : 500;
    res.status(status).json({ error: errorMessage(error) });
  };
  app.use(handleError);
  return app;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const store = new SchemaStore();
  await store.seed();
  createApp(store).listen(4318, "127.0.0.1", () =>
    console.log("Local DB Diagram: http://127.0.0.1:4318"),
  );
}
