import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  MetadataError,
  type Bundle,
  type DiagramMetadata,
} from "../src/bundles.js";
import type { SchemaStore } from "./storage.js";
import {
  SchemaError,
  errorMessage,
  exportSchema,
  parseSchema,
} from "./schema.js";

type Awaitable<T> = T | Promise<T>;
export type McpSchemaStore = {
  list(): Awaitable<ReturnType<SchemaStore["list"]>>;
  read(id: string): Awaitable<ReturnType<SchemaStore["read"]>>;
  write(
    id: string,
    dbml: string,
    revision?: string,
    metadata?: DiagramMetadata,
  ): ReturnType<SchemaStore["write"]>;
  listBundles(): Awaitable<Bundle[]>;
  createBundle(name: string, color: string): Promise<Bundle>;
  moveSchema(id: string, bundleId: string): ReturnType<SchemaStore["write"]>;
};
export function createSchemaMcp(store: McpSchemaStore) {
  const server = new McpServer({ name: "dbdiagram", version: "1.2.0" });
  function result(value: unknown) {
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(value, null, 2) },
      ],
    };
  }
  async function run(action: () => unknown) {
    try {
      return result(await action());
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text:
              error instanceof SchemaError || error instanceof MetadataError
                ? errorMessage(error)
                : "Schema storage is unavailable. Retry shortly.",
          },
        ],
      };
    }
  }
  server.registerTool(
    "list_schemas",
    {
      description: "List DBML schema IDs and current revisions.",
      inputSchema: { bundle_id: z.string().optional() },
    },
    ({ bundle_id }) =>
      run(async () =>
        (await store.list()).filter(
          (d) => !bundle_id || d.bundle_id === bundle_id,
        ),
      ),
  );
  server.registerTool(
    "read_schema",
    {
      description:
        "Read DBML, revision, saved layout, and normalized tables, relationships, indexes and groups.",
      inputSchema: { id: z.string() },
    },
    ({ id }) =>
      run(async () => {
        const schema = await store.read(id);
        return { ...schema, model: parseSchema(schema.dbml) };
      }),
  );
  server.registerTool(
    "write_schema",
    {
      description:
        "Create or update a schema. When updating, provide the revision returned by read_schema to prevent overwriting newer edits. DBML is validated before atomic save; previous versions are backed up. For creation, optionally provide bundle_id and name; otherwise use Shared diagrams. Use move_schema for existing diagrams.",
      inputSchema: {
        id: z.string(),
        dbml: z.string(),
        revision: z.string().optional(),
        bundle_id: z.string().optional(),
        name: z.string().trim().min(1).max(120).optional(),
      },
    },
    ({ id, dbml, revision, bundle_id, name }) =>
      run(() => store.write(id, dbml, revision, { bundle_id, name })),
  );
  server.registerTool(
    "validate_schema",
    {
      description:
        "Validate DBML and return its normalized visualization model without saving.",
      inputSchema: { dbml: z.string() },
    },
    ({ dbml }) => run(() => parseSchema(dbml)),
  );
  server.registerTool(
    "export_schema",
    {
      description:
        "Export a stored schema as PostgreSQL, MySQL, SQL Server SQL, or original portable DBML.",
      inputSchema: {
        id: z.string(),
        format: z.enum(["postgres", "mysql", "mssql", "dbml"]),
      },
    },
    ({ id, format }) =>
      run(async () => ({
        format,
        content: exportSchema((await store.read(id)).dbml, format),
      })),
  );
  server.registerTool(
    "list_bundles",
    {
      description: "List public diagram bundles, their IDs and colors.",
      inputSchema: {},
    },
    () => run(() => store.listBundles()),
  );
  server.registerTool(
    "create_bundle",
    {
      description:
        "Create a named, colored bundle. Bundles organize public diagrams; they do not restrict access.",
      inputSchema: { name: z.string(), color: z.string().default("#6288e8") },
    },
    ({ name, color }) => run(() => store.createBundle(name, color)),
  );
  server.registerTool(
    "move_schema",
    {
      description:
        "Move a diagram to another bundle without changing its ID, DBML, revision or saved layout.",
      inputSchema: { id: z.string(), bundle_id: z.string() },
    },
    ({ id, bundle_id }) => run(() => store.moveSchema(id, bundle_id)),
  );
  return server;
}
